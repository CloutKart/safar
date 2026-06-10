import {
  TripSummarySchema,
  type TripSummary,
} from "@/lib/domain";
import type {
  StoredFact,
  StoredParticipant,
  StoredPreference,
} from "@/lib/store/types";

function valuesFor(facts: StoredFact[], kind: string) {
  return facts
    .filter((fact) => fact.kind === kind && fact.confidence >= 0.6)
    .map((fact) => fact.value);
}

function latestNumber(facts: StoredFact[], kind: string): number | null {
  const values = valuesFor(facts, kind).filter(
    (value): value is number => typeof value === "number",
  );
  return values.at(-1) ?? null;
}

function latestString(facts: StoredFact[], kind: string): string | null {
  const values = valuesFor(facts, kind).filter(
    (value): value is string => typeof value === "string",
  );
  return values.at(-1) ?? null;
}

function conflictingValues(facts: StoredFact[], kind: string): string[] {
  return [
    ...new Set(
      facts
        .filter((fact) => fact.kind === kind && fact.confidence >= 0.75)
        .map((fact) => JSON.stringify(fact.value)),
    ),
  ];
}

export function buildTripSummary(input: {
  participants: StoredParticipant[];
  facts: StoredFact[];
  preferences: StoredPreference[];
}): TripSummary {
  const activeIds = new Set(input.participants.map((participant) => participant.id));
  const relevantFacts = input.facts.filter(
    (fact) => !fact.participantId || activeIds.has(fact.participantId),
  );
  const departureCities = [
    ...new Set(
      valuesFor(relevantFacts, "origin")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim()),
    ),
  ];
  const hardConstraints = relevantFacts
    .filter((fact) => fact.isHard && fact.kind === "restriction")
    .flatMap((fact) =>
      Array.isArray(fact.value) ? fact.value : [String(fact.value)],
    );
  const conflicts: string[] = [];
  for (const [kind, label] of [
    ["start_date", "start date"],
    ["end_date", "end date"],
    ["duration_days", "trip duration"],
  ] as const) {
    const values = conflictingValues(relevantFacts, kind);
    if (values.length > 1) {
      conflicts.push(`Conflicting ${label}: ${values.join(" vs ")}`);
    }
  }

  const memberPreferences = input.participants.map((participant) => {
    const grouped = new Map<string, StoredPreference[]>();
    for (const preference of input.preferences.filter(
      (item) => item.participantId === participant.id,
    )) {
      grouped.set(preference.tag, [
        ...(grouped.get(preference.tag) ?? []),
        preference,
      ]);
    }
    return {
      participantId: participant.id,
      displayName: participant.displayName ?? "Unnamed traveller",
      interests: [...grouped.entries()]
        .map(([tag, signals]) => ({
          tag,
          weight:
            signals.reduce((sum, signal) => sum + signal.weight, 0) /
            signals.length,
          confidence: Math.max(...signals.map((signal) => signal.confidence)),
        }))
        .filter((interest) => interest.weight !== 0)
        .sort((a, b) => b.weight - a.weight),
    };
  });

  const start = latestString(relevantFacts, "start_date");
  const end = latestString(relevantFacts, "end_date");
  const durationDays = latestNumber(relevantFacts, "duration_days");
  const minInr = latestNumber(relevantFacts, "budget_min");
  const maxInr = latestNumber(relevantFacts, "budget_max");
  const uncertainties: string[] = [];
  if (departureCities.length === 0) uncertainties.push("Departure city is missing");
  if (!start && !durationDays) uncertainties.push("Dates or trip duration are missing");
  if (maxInr === null) uncertainties.push("Per-person budget is missing");
  if (memberPreferences.every((member) => member.interests.length === 0)) {
    uncertainties.push("No direct personal activity preferences found yet");
  }

  return TripSummarySchema.parse({
    groupSize: input.participants.length,
    departureCities,
    dates: { start, end, durationDays },
    budget: {
      minInr,
      maxInr,
      basis: "per_person",
    },
    hardConstraints,
    memberPreferences,
    uncertainties,
    conflicts,
  });
}

export function formatTripSummary(summary: TripSummary, version: number): string {
  const dates =
    summary.dates.start || summary.dates.durationDays
      ? [
          summary.dates.start,
          summary.dates.end ? `to ${summary.dates.end}` : null,
          summary.dates.durationDays ? `(${summary.dates.durationDays} days)` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : "Not clear yet";
  const budget = summary.budget.maxInr
    ? `₹${summary.budget.minInr?.toLocaleString("en-IN") ?? "?"}–₹${summary.budget.maxInr.toLocaleString("en-IN")} per person`
    : "Not clear yet";
  const preferences = summary.memberPreferences
    .map((member) => {
      const likes = member.interests
        .filter((interest) => interest.weight > 0)
        .map((interest) => interest.tag);
      const avoids = member.interests
        .filter((interest) => interest.weight < 0)
        .map((interest) => interest.tag);
      return `• ${member.displayName}: ${likes.join(", ") || "no clear likes"}${avoids.length ? `; avoids ${avoids.join(", ")}` : ""}`;
    })
    .join("\n");

  return `*Safar trip summary v${version}*

👥 ${summary.groupSize} active travellers
📍 From: ${summary.departureCities.join(", ") || "Not clear yet"}
🗓️ ${dates}
💸 ${budget}
🚫 Hard constraints: ${summary.hardConstraints.join("; ") || "None confirmed"}

*Individual preferences*
${preferences}

*Still unclear*
${summary.uncertainties.map((item) => `• ${item}`).join("\n") || "• Nothing"}

*Conflicts*
${summary.conflicts.map((item) => `• ${item}`).join("\n") || "• None"}

Reply with a correction in normal language, or reply *approve*. Research starts after a strict majority approves and all hard conflicts are resolved.`;
}
