import { z } from "zod";
import { generateStructured } from "@/lib/ai/client";
import {
  InterestTagSchema,
  TripSummarySchema,
  interestTags,
  type TripSummary,
} from "@/lib/domain";
import type { StoredMessage, StoredParticipant } from "@/lib/store/types";

// One LLM pass over the WHOLE conversation, run only when a summary is requested
// (not per message) — so we get LLM-quality consolidation without burning a call
// on every chat line. It corrects the deterministic baseline: fixes Hinglish the
// regex heuristics miss, drops hallucinated places, resolves fuzzy dates ("second
// week of July"), and attributes preferences to the right speaker.

const RefineSchema = z.object({
  departureCities: z.array(z.string()).default([]),
  requestedDestinations: z.array(z.string()).default([]),
  excludedDestinations: z.array(z.string()).default([]),
  startDate: z.string().nullable().default(null),
  endDate: z.string().nullable().default(null),
  durationDays: z.number().int().positive().nullable().default(null),
  budgetMinInr: z.number().nonnegative().nullable().default(null),
  budgetMaxInr: z.number().nonnegative().nullable().default(null),
  groupSize: z.number().int().positive().nullable().default(null),
  hardConstraints: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  memberPreferences: z
    .array(
      z.object({
        displayName: z.string(),
        likes: z.array(InterestTagSchema).default([]),
        avoids: z.array(InterestTagSchema).default([]),
      }),
    )
    .default([]),
});

const REFINE_SYSTEM = `You consolidate an Indian group-trip planning chat into one accurate trip brief.
Read the FULL transcript (English, Hindi, Roman-script Hinglish) and the deterministic baseline, and return corrected JSON ONLY.

Rules:
- Extract only what travellers actually said. NEVER invent a city, date, or budget. If unknown, leave null / empty.
- Hinglish: "Delhi se"=from Delhi; "X aur Y"=X and Y; "hazaar"=1000; "per person/per head/per banda"=per person; "din"=days, "raat"=nights; "<place> avoid/nahi jaana"=exclude that place. A place can be ruled out ("Goa aur Manali avoid karna hai") — put both in excludedDestinations.
- Do NOT treat filler as a place ("plan kar rahe hain", "popular places", "hidden gems" are NOT destinations).
- budgetMinInr/budgetMaxInr are per-person INR numbers (₹12,000-15,000 → 12000 and 15000).
- Dates: resolve fuzzy phrases against "today". "Second week of July" → a startDate around the 8th of that July and a durationDays if a trip length is stated; prefer ISO yyyy-mm-dd. If only a duration is given, set durationDays and leave dates null.
- groupSize: the stated party size ("5 friends"=5), else null.
- memberPreferences: for EACH named speaker, list their liked interest tags and disliked ones. When a speaker says "we"/"hum" they speak for the group — attribute those preferences to that speaker. Something a speaker says "isn't a priority"/"optional" is neither a like nor a dislike — omit it. Only use the allowed tags.
- hardConstraints: firm requirements/avoids stated as non-negotiable (e.g. "no overnight buses", "must be veg-friendly").
- conflicts: genuine disagreements between travellers (e.g. one wants beaches, another mountains).
- Allowed interest tags: ${interestTags.join(", ")}.`;

function titleCase(value: string): string {
  return value.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function dedupeByLower(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function mergeRefined(
  base: TripSummary,
  refined: z.infer<typeof RefineSchema>,
  participants: StoredParticipant[],
): TripSummary {
  const departureCities = refined.departureCities.length
    ? dedupeByLower(refined.departureCities.map(titleCase))
    : base.departureCities;

  const excludedDestinations = dedupeByLower([
    ...base.excludedDestinations,
    ...refined.excludedDestinations.map(titleCase),
  ]);
  const excludedLower = new Set(excludedDestinations.map((v) => v.toLowerCase()));
  const requestedDestinations = dedupeByLower([
    ...base.requestedDestinations,
    ...refined.requestedDestinations.map(titleCase),
  ]).filter((v) => !excludedLower.has(v.toLowerCase()));

  const hasRefinedDates =
    refined.startDate !== null ||
    refined.endDate !== null ||
    refined.durationDays !== null;
  const dates = hasRefinedDates
    ? {
        start: refined.startDate ?? base.dates.start,
        end: refined.endDate ?? base.dates.end,
        durationDays: refined.durationDays ?? base.dates.durationDays,
      }
    : base.dates;

  const budget =
    refined.budgetMaxInr !== null || refined.budgetMinInr !== null
      ? {
          minInr: refined.budgetMinInr ?? refined.budgetMaxInr,
          maxInr: refined.budgetMaxInr ?? refined.budgetMinInr,
          basis: "per_person" as const,
        }
      : base.budget;

  const groupSize = Math.max(base.groupSize, refined.groupSize ?? 0);
  const hardConstraints = dedupeByLower([
    ...base.hardConstraints,
    ...refined.hardConstraints,
  ]);
  const conflicts = dedupeByLower([...base.conflicts, ...refined.conflicts]);

  // Union the deterministic member interests (the floor) with the LLM's, so the
  // LLM can ADD or flip a preference but never silently wipe good heuristic
  // attribution (group "we want…" messages the LLM may not pin to a speaker).
  type Interest = { tag: string; weight: number; confidence: number };
  const byId = new Map<
    string,
    { participantId: string; displayName: string; interests: Map<string, Interest> }
  >();
  for (const member of base.memberPreferences) {
    const interests = new Map<string, Interest>();
    for (const i of member.interests) interests.set(i.tag, { ...i });
    byId.set(member.participantId, {
      participantId: member.participantId,
      displayName: member.displayName,
      interests,
    });
  }
  refined.memberPreferences.forEach((member, index) => {
    const match = participants.find(
      (p) => (p.displayName ?? "").toLowerCase() === member.displayName.toLowerCase(),
    );
    const id = match?.id ?? `llm-${index}`;
    const entry =
      byId.get(id) ??
      (() => {
        const created = {
          participantId: id,
          displayName: match?.displayName ?? member.displayName,
          interests: new Map<string, Interest>(),
        };
        byId.set(id, created);
        return created;
      })();
    for (const tag of member.likes) entry.interests.set(tag, { tag, weight: 1, confidence: 0.8 });
    // An explicit LLM "avoid" overrides a heuristic like.
    for (const tag of member.avoids) entry.interests.set(tag, { tag, weight: -1, confidence: 0.8 });
  });
  const memberPreferences = [...byId.values()].map((entry) => ({
    participantId: entry.participantId,
    displayName: entry.displayName,
    interests: [...entry.interests.values()].sort((a, b) => b.weight - a.weight),
  }));

  // Recompute "still unclear" against the merged brief (mirrors buildTripSummary).
  const uncertainties: string[] = [];
  if (departureCities.length === 0) uncertainties.push("Departure city is missing");
  if (!dates.start && !dates.durationDays)
    uncertainties.push("Dates or trip duration are missing");
  if (budget.maxInr === null) uncertainties.push("Per-person budget is missing");
  if (memberPreferences.every((member) => member.interests.length === 0))
    uncertainties.push("No direct personal activity preferences found yet");

  return TripSummarySchema.parse({
    groupSize,
    departureCities,
    requestedDestinations,
    excludedDestinations,
    dates,
    budget,
    hardConstraints,
    memberPreferences,
    uncertainties,
    conflicts,
  });
}

export async function refineSummaryWithLlm(input: {
  base: TripSummary;
  messages: StoredMessage[];
  participants: StoredParticipant[];
}): Promise<TripSummary> {
  const transcript = input.messages
    .filter((m) => m.participantId && m.text)
    .map((m) => {
      const name =
        input.participants.find((p) => p.id === m.participantId)?.displayName ??
        "Traveller";
      return `${name}: ${m.text}`;
    })
    .join("\n");
  if (!transcript.trim()) return input.base;

  const refined = await generateStructured({
    schema: RefineSchema,
    system: REFINE_SYSTEM,
    user: JSON.stringify({
      today: new Date().toISOString().slice(0, 10),
      transcript: transcript.slice(0, 9000),
      deterministicBaseline: {
        departureCities: input.base.departureCities,
        requestedDestinations: input.base.requestedDestinations,
        excludedDestinations: input.base.excludedDestinations,
        dates: input.base.dates,
        budget: input.base.budget,
        groupSize: input.base.groupSize,
        hardConstraints: input.base.hardConstraints,
        memberPreferences: input.base.memberPreferences.map((m) => ({
          displayName: m.displayName,
          interests: m.interests.map((i) => ({ tag: i.tag, weight: i.weight })),
        })),
      },
    }),
  }).catch(() => null);

  if (!refined) return input.base; // no LLM configured / call failed → baseline
  try {
    return mergeRefined(input.base, refined, input.participants);
  } catch {
    return input.base;
  }
}
