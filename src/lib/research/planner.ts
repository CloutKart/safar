import { z } from "zod";
import { destinations, type CuratedDestination } from "@/data/destinations";
import {
  GeneratedPlanSchema,
  ItineraryDaySchema,
  type GeneratedPlan,
  type InterestTag,
  type ItineraryStop,
  type TripSummary,
} from "@/lib/domain";
import { generateStructured } from "@/lib/ai/client";
import { researchDestination } from "@/lib/research/search";
import { getPriceQuotes, type SupplierQuote } from "@/lib/research/pricing";
import { getGems, gemKey, type Gem } from "@/lib/research/gems";

function groupWeights(summary: TripSummary): Map<InterestTag, number> {
  const weights = new Map<InterestTag, number>();
  for (const member of summary.memberPreferences) {
    for (const interest of member.interests) {
      weights.set(
        interest.tag,
        (weights.get(interest.tag) ?? 0) + interest.weight * interest.confidence,
      );
    }
  }
  return weights;
}

function destinationScore(
  destination: CuratedDestination,
  summary: TripSummary,
  weights: Map<InterestTag, number>,
): number {
  // A destination's earlier tags are its defining vibe; weight them more so a
  // place that merely lists "culture" 3rd doesn't tie a true heritage town.
  const positionWeight = [1, 0.85, 0.7, 0.55, 0.4];
  let score = destination.tags.reduce(
    (sum, tag, index) =>
      sum + (weights.get(tag) ?? 0) * (positionWeight[index] ?? 0.4),
    0,
  );
  const days = summary.dates.durationDays;
  if (days && (days < destination.minDays || days > destination.maxDays + 1)) {
    score -= 4;
  }
  const month = summary.dates.start
    ? new Date(`${summary.dates.start}T00:00:00Z`).getUTCMonth() + 1
    : null;
  if (month && !destination.idealMonths.includes(month)) score -= 2.5;
  const budget = summary.budget.maxInr;
  if (budget) {
    const estimated =
      destination.dailyBudgetInr[0] * (days ?? destination.minDays) +
      destination.accessCostInr[0];
    if (estimated > budget) score -= 5;
  }
  return score;
}

function activitiesFor(
  destination: CuratedDestination,
  angle: GeneratedPlan["angle"],
): string[] {
  const base = destination.highlights;
  let ordered: (string | undefined)[];
  if (angle === "adventurous") {
    ordered = [
      base.find((item) => /trek|trail|cave|kayak|rafting|camp/i.test(item)) ??
        base[0],
      ...base.filter((item) => item !== base[0]),
    ];
  } else if (angle === "relaxed") {
    ordered = [
      base.find((item) => /cafe|food|village|heritage|sunset/i.test(item)) ??
        base.at(-1) ??
        base[0],
      ...base.slice(0, -1),
    ];
  } else {
    ordered = base;
  }
  return ordered.filter((item): item is string => Boolean(item));
}

const capitalize = (value: string) =>
  `${value[0].toUpperCase()}${value.slice(1)}`;

// Deterministic itinerary used when no LLM is configured (dev / no key). It is
// intentionally generic; the LLM path below is what produces specific spots,
// hidden gems, hotels and per-stop costs.
function fallbackItinerary(
  destination: CuratedDestination,
  days: number,
  angle: GeneratedPlan["angle"],
): GeneratedPlan["itinerary"] {
  const acts = activitiesFor(destination, angle);
  return Array.from({ length: days }, (_, index) => {
    const picks =
      index === 0
        ? [acts[0]]
        : index === days - 1
          ? [acts.at(-1) ?? acts[0]]
          : [acts[index % acts.length], acts[(index + 1) % acts.length]];
    const stops: ItineraryStop[] = picks
      .filter((name): name is string => Boolean(name))
      .map((name) => ({
        name,
        kind: "sight" as const,
        note: "",
        approxInr: null,
      }));
    stops.push({
      name: "Local café or food stop",
      kind: "food",
      note: "",
      approxInr: null,
    });
    return {
      day: index + 1,
      title:
        index === 0
          ? `Arrive and settle into ${destination.name}`
          : index === days - 1
            ? "Slow morning and return"
            : `${capitalize(angle)} day ${index + 1}`,
      stops,
      stay: null,
    };
  });
}

// Add one real, verified gem per day as a hidden-gem stop (skipping any the
// itinerary already names). Works with or without the LLM.
function injectGems(
  itinerary: GeneratedPlan["itinerary"],
  gems: Gem[],
): GeneratedPlan["itinerary"] {
  if (gems.length === 0) return itinerary;
  const present = itinerary.flatMap((day) =>
    day.stops.map((stop) => gemKey(stop.name)),
  );
  // Substring-aware so "Gokarna view point" isn't re-added when the LLM already
  // wrote "Sunset at Gokarna view point".
  const fresh = gems.filter((gem) => {
    const key = gemKey(gem.name);
    return key.length > 0 && !present.some((name) => name.includes(key) || key.includes(name));
  });
  return itinerary.map((day, index) => {
    const gem = fresh[index];
    if (!gem) return day;
    const isFood = gem.type === "food";
    return {
      ...day,
      stops: [
        ...day.stops,
        {
          name: gem.name,
          kind: isFood ? ("food" as const) : ("hidden-gem" as const),
          note:
            gem.blurb ||
            (isFood
              ? "well-rated local eatery"
              : gem.sources.includes("places")
                ? "well-rated, low-key local spot"
                : "offbeat local find"),
          approxInr: null,
        },
      ],
    };
  });
}

const PLANNER_SYSTEM = `You are Safar, a sharp India travel planner who knows places beyond the obvious tourist list. You write one concrete plan for ONE destination for a friend group.

Rules:
- Output STRICT JSON only, matching: {"summary": string, "itinerary": [{"day": number, "title": string, "stops": [{"name": string, "kind": "sight"|"hidden-gem"|"activity"|"food"|"transport", "note": string, "approxInr": number|null}], "stay": {"name": string, "area": string, "approxInrPerNight": number|null} | null}]}.
- Produce EXACTLY the requested number of days.
- Each day: 3 to 5 stops. Mix well-known sights with at least one genuine lesser-known "hidden-gem", and at least one "food" stop naming a real local dish or the type of eatery.
- You are given "localGems" — real, verified local spots for this place. Prefer them for your hidden-gem and sightseeing stops, weaving them into the days with a short reason; only invent a spot if the gems don't cover a day.
- Name a realistic mid-range "stay" per day (a real, plausible property/area for that place), with a per-night per-person estimate.
- "approxInr" is a rough PER-PERSON estimate for that stop (entry, ride, meal). Use null when free. These are estimates, not quotes; keep them realistic for India and within the group's budget.
- Ground everything in the provided destination highlights, cautions and research. Respect the group's days, budget and hard constraints. Never recommend anything the cautions warn against.
- Keep notes to one short line. No markdown, no prose outside the JSON.`;

const PlanDetailSchema = z.object({
  summary: z.string(),
  itinerary: z.array(ItineraryDaySchema).min(1),
});

async function enrichItinerary(input: {
  destination: CuratedDestination;
  summary: TripSummary;
  angle: GeneratedPlan["angle"];
  days: number;
  quotes: SupplierQuote[];
  research: Array<{ title: string; publisher: string; url: string }>;
  gems: Gem[];
}): Promise<z.infer<typeof PlanDetailSchema> | null> {
  const context = {
    angle: input.angle,
    days: input.days,
    localGems: input.gems
      .slice(0, 8)
      .map((gem) => ({ name: gem.name, type: gem.type, note: gem.blurb })),
    destination: {
      name: input.destination.name,
      state: input.destination.state,
      region: input.destination.region,
      nearestAirport: input.destination.nearestAirport,
      tags: input.destination.tags,
      highlights: input.destination.highlights,
      cautions: input.destination.cautions,
      dailyBudgetInr: input.destination.dailyBudgetInr,
    },
    group: {
      size: input.summary.groupSize,
      departureCities: input.summary.departureCities,
      budgetInr: input.summary.budget,
      dates: input.summary.dates,
      preferences: input.summary.memberPreferences.flatMap((member) =>
        member.interests.map((interest) => interest.tag),
      ),
      hardConstraints: input.summary.hardConstraints,
    },
    pricingPerPersonInr: Object.fromEntries(
      input.quotes.map((quote) => [quote.category, quote.amountInr]),
    ),
    research: input.research.slice(0, 5),
  };
  try {
    return await generateStructured({
      schema: PlanDetailSchema,
      system: PLANNER_SYSTEM,
      user: JSON.stringify(context),
    });
  } catch {
    return null;
  }
}

// Build a destination on the fly for a city the group named that isn't in the
// curated catalog — live data (gems, hotels) + the LLM fill in the details.
function adhocDestination(
  name: string,
  weights: Map<InterestTag, number>,
): CuratedDestination {
  const topTags = [...weights.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);
  return {
    slug:
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ||
      "requested",
    name,
    state: "",
    region: "Requested",
    nearestAirport: name,
    idealMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    minDays: 2,
    maxDays: 7,
    dailyBudgetInr: [2000, 6000],
    accessCostInr: [2000, 8000],
    tags: topTags.length
      ? topTags
      : (["culture", "food", "relaxation"] as InterestTag[]),
    highlights: [
      `top sights and viewpoints around ${name}`,
      `local cafes and food spots in ${name}`,
      `offbeat corners and markets of ${name}`,
    ],
    cautions: [],
    sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(`${name} travel guide`)}`,
  };
}

// Resolve requested cities to catalog entries (fuzzy) or ad-hoc destinations.
function resolveRequested(
  names: string[],
  weights: Map<InterestTag, number>,
): CuratedDestination[] {
  const resolved: CuratedDestination[] = [];
  for (const name of names) {
    const norm = name.toLowerCase().trim();
    if (!norm) continue;
    const match = destinations.find((destination) => {
      const dn = destination.name.toLowerCase();
      const head = dn.split(/[ (]/)[0];
      return dn === norm || destination.slug === norm || dn.includes(norm) || norm.includes(head);
    });
    resolved.push(match ?? adhocDestination(name, weights));
  }
  return resolved;
}

export async function generatePlans(
  summary: TripSummary,
): Promise<GeneratedPlan[]> {
  const weights = groupWeights(summary);
  const ranked = destinations
    .map((destination) => ({
      destination,
      score: destinationScore(destination, summary, weights),
    }))
    .sort((a, b) => b.score - a.score);

  // Pick three, nudging toward different states for variety — but as a soft
  // penalty, so a clearly stronger same-state match (e.g. another Rajasthan
  // fort town for a heritage trip) still beats a weak cross-state filler.
  const DIVERSITY_PENALTY = 1.2;
  const pool = [...ranked];
  const selected: CuratedDestination[] = [];
  while (selected.length < 3 && pool.length > 0) {
    let bestIndex = 0;
    let bestAdjusted = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const sharesState = selected.some(
        (chosen) => chosen.state === pool[i].destination.state,
      );
      const adjusted = pool[i].score - (sharesState ? DIVERSITY_PENALTY : 0);
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = i;
      }
    }
    selected.push(pool[bestIndex].destination);
    pool.splice(bestIndex, 1);
  }

  // Pin up to two explicitly requested cities first (so a named city always
  // appears), then fill the rest with the variety-ranked picks.
  const requested = resolveRequested(summary.requestedDestinations, weights).slice(0, 2);
  const finalSelection: CuratedDestination[] = [];
  const seen = new Set<string>();
  for (const destination of [...requested, ...selected]) {
    const key = destination.slug || destination.name.toLowerCase();
    if (seen.has(key) || finalSelection.length >= 3) continue;
    seen.add(key);
    finalSelection.push(destination);
  }

  const angles: GeneratedPlan["angle"][] = [
    "balanced",
    "adventurous",
    "relaxed",
  ];
  const plans = await Promise.all(
    finalSelection.map(async (destination, index) => {
      const angle = angles[index];
      const days =
        summary.dates.durationDays ??
        Math.min(destination.maxDays, Math.max(destination.minDays, 3));
      const [searchResults, quotes, gems] = await Promise.all([
        researchDestination(destination, summary),
        getPriceQuotes(destination, summary),
        getGems(destination.name).catch(() => [] as Gem[]),
      ]);
      const research = searchResults.slice(0, 5).map((result) => ({
        title: result.title,
        publisher: result.publisher,
        url: result.url,
      }));

      const byCategory = new Map(
        quotes.map((quote) => [quote.category, quote.amountInr]),
      );
      const transportInr = byCategory.get("transport") ?? 0;
      const stayInr = byCategory.get("stay") ?? 0;
      const foodInr = byCategory.get("food") ?? 0;
      const activitiesInr = byCategory.get("activity") ?? 0;
      const likely = transportInr + stayInr + foodInr + activitiesInr;

      const matchedTags = destination.tags
        .filter((tag) => (weights.get(tag) ?? 0) > 0)
        .sort((a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0));

      // LLM-written specifics, grounded in the catalog + pricing + research.
      // Falls back to a generic template when no LLM is configured.
      const detail = await enrichItinerary({
        destination,
        summary,
        angle,
        days,
        quotes,
        research,
        gems,
      });
      const baseItinerary =
        detail?.itinerary ?? fallbackItinerary(destination, days, angle);
      // When a live stay provider returned a real bookable hotel, use it for
      // every night (more trustworthy than the LLM's invented name).
      const stayQuote = quotes.find((quote) => quote.category === "stay");
      const withStay =
        stayQuote?.title
          ? baseItinerary.map((day) => ({
              ...day,
              stay: {
                name: stayQuote.title as string,
                area: destination.name,
                approxInrPerNight: stayQuote.perNightInr ?? null,
              },
            }))
          : baseItinerary;
      // Guarantee real, verified hidden gems appear even without an LLM.
      const itinerary = injectGems(withStay, gems);
      const planSummary =
        detail?.summary ||
        `${days} days built around ${matchedTags.slice(0, 4).join(", ") || destination.tags.slice(0, 4).join(", ")} without breaking the group’s stated hard constraints.`;

      const retrievedAt = new Date().toISOString();
      return GeneratedPlanSchema.parse({
        optionNumber: index + 1,
        title: `${destination.name}: ${angle === "balanced" ? "the group sweet spot" : angle === "adventurous" ? "go bigger" : "slow down and taste more"}`,
        destinationSlug: destination.slug,
        destinationName: destination.name,
        angle,
        summary: planSummary,
        preferenceCoverage: matchedTags.slice(0, 6),
        tradeoffs: destination.cautions,
        itinerary,
        sources: [
          {
            title: destination.state
              ? `${destination.state} official tourism`
              : `${destination.name} travel guide`,
            url: destination.sourceUrl,
            publisher: destination.state ? `${destination.state} Tourism` : "Web",
            retrievedAt,
            sourceType: "curated" as const,
          },
          ...searchResults.slice(0, 4).map((result) => ({
            title: result.title,
            url: result.url,
            publisher: result.publisher,
            retrievedAt,
            sourceType: result.sourceType,
          })),
        ].filter((source) => /^https?:\/\//.test(source.url)),
        cost: {
          lowInr: Math.round(likely * 0.82),
          likelyInr: likely,
          highInr: Math.round(likely * 1.28),
          live: quotes.some((quote) => quote.live),
          quotedAt: retrievedAt,
          expiresAt:
            quotes
              .map((quote) => quote.expiresAt)
              .filter((value): value is string => Boolean(value))
              .sort()[0] ?? null,
          assumptions: quotes.map((quote) => quote.assumption),
          deepLinks: quotes.map((quote) => quote.deepLink),
          breakdown: { transportInr, stayInr, activitiesInr, foodInr },
        },
      });
    }),
  );

  return plans;
}
