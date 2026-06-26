import type {
  GeneratedPlan,
  InterestTag,
  ItineraryDay,
  ItineraryStop,
  TripSummary,
} from "@/lib/domain";
import type { CuratedDestination } from "@/data/destinations";
import type { Gem } from "@/lib/research/gems";
import { isHiddenGem } from "@/lib/research/gems";
import { travelBurdenKm, type Trail } from "@/lib/research/trails";
import type { WeatherSummary } from "@/lib/weather";

// Deterministic "storyboard" enrichers (Safar V1.2). Pure functions that turn a
// built itinerary + the data already gathered for the plan into a richer,
// scannable experience: day themes/goals, time blocks, group moments, crowd
// estimates, "why" reasons, audience fit, difficulty/pace, transport legs and a
// per-meal food split. The LLM layer only *overrides copy* on top of these, so
// every feature works even with no LLM configured.

type Difficulty = GeneratedPlan["difficulty"];
type Pace = GeneratedPlan["pace"];

// ── Time blocks (#3) ─────────────────────────────────────────────────────────
function clock(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Spread a day's stops across a believable clock (08:00 → ~20:00), snapping food
// stops to the nearest meal so "lunch" reads at 1:30 PM, not 10 AM.
function assignStopTimes(stops: ItineraryStop[]): ItineraryStop[] {
  const n = stops.length;
  if (n === 0) return stops;
  const dayStart = 8 * 60; // 08:00
  const dayEnd = 20 * 60; // 20:00
  const step = n > 1 ? (dayEnd - dayStart) / (n - 1) : 0;
  const mealLabel = (minutes: number): string =>
    minutes < 11 * 60 ? "8:00 AM" : minutes < 16 * 60 ? "1:30 PM" : "7:30 PM";
  return stops.map((stop, index) => {
    const minutes = Math.round(dayStart + step * index);
    const time = stop.kind === "food" ? mealLabel(minutes) : clock(minutes);
    return { ...stop, time };
  });
}

// ── Crowd intelligence (#8), labeled estimates from review volume ────────────
function gemByName(gems: Gem[]): Map<string, Gem> {
  const map = new Map<string, Gem>();
  for (const gem of gems) map.set(gem.name.toLowerCase(), gem);
  return map;
}

const PHOTO_KINDS = new Set<ItineraryStop["kind"]>(["hidden-gem", "trail", "sight"]);

function assignCrowd(stops: ItineraryStop[], byName: Map<string, Gem>): ItineraryStop[] {
  return stops.map((stop) => {
    const gem = byName.get(stop.name.toLowerCase());
    const reviews = gem?.reviewCount ?? stop.reviewCount;
    const crowdLevel: ItineraryStop["crowdLevel"] =
      reviews == null
        ? stop.kind === "hidden-gem" || stop.kind === "trail"
          ? "low"
          : null
        : reviews > 4000
          ? "high"
          : reviews > 800
            ? "medium"
            : "low";
    const isScenic =
      /view|sunset|sunrise|lake|fall|peak|valley|point|fort|cliff|beach/i.test(stop.name) ||
      stop.kind === "trail";
    const photoScore: ItineraryStop["photoScore"] = PHOTO_KINDS.has(stop.kind)
      ? isScenic
        ? 5
        : 4
      : stop.kind === "food"
        ? 3
        : 3;
    const bestTime: ItineraryStop["bestTime"] = isScenic
      ? "Sunrise / golden hour"
      : crowdLevel === "high"
        ? "Before 9 AM to beat the crowd"
        : stop.kind === "food"
          ? null
          : null;
    return { ...stop, crowdLevel, photoScore, bestTime };
  });
}

// ── Day themes + goals (#1) ──────────────────────────────────────────────────
const MIDDLE_THEMES: Array<{ theme: string; goal: string; test: (k: Set<string>) => boolean }> = [
  {
    theme: "Adventure Day",
    goal: "Your highest-energy day — earn the views.",
    test: (k) => k.has("trail") || k.has("activity"),
  },
  {
    theme: "Culture & Hidden Gems",
    goal: "Slow exploration of heritage and local corners.",
    test: (k) => k.has("hidden-gem") || k.has("sight"),
  },
  {
    theme: "Food & Slow Exploration",
    goal: "Eat well, wander, no rush.",
    test: (k) => k.has("food"),
  },
];

function dayKinds(day: ItineraryDay): Set<string> {
  return new Set(day.stops.map((s) => s.kind));
}

function assignThemes(itinerary: ItineraryDay[]): ItineraryDay[] {
  const last = itinerary.length - 1;
  const usedThemes = new Set<string>();
  return itinerary.map((day, index) => {
    let theme: string;
    let goal: string;
    if (index === 0) {
      theme = "Arrival & Slow Evening";
      goal = "Settle in and unwind after the journey.";
    } else if (index === last && itinerary.length > 1) {
      theme = "Farewell Morning";
      goal = "One easy final highlight, then the road home.";
    } else {
      const kinds = dayKinds(day);
      // First matching theme that hasn't been used yet, else the first match.
      const match =
        MIDDLE_THEMES.find((t) => t.test(kinds) && !usedThemes.has(t.theme)) ??
        MIDDLE_THEMES.find((t) => t.test(kinds));
      theme = match?.theme ?? "Explore & Wander";
      goal = match?.goal ?? "A balanced mix of sights and downtime.";
    }
    usedThemes.add(theme);
    return { ...day, theme, goal };
  });
}

// ── Group moments (#9) ───────────────────────────────────────────────────────
function groupMoments(day: ItineraryDay): ItineraryDay["moments"] {
  const stops = day.stops;
  const find = (test: (s: ItineraryStop) => boolean) => stops.find(test)?.name ?? null;
  const photoSpot =
    [...stops].sort((a, b) => (b.photoScore ?? 0) - (a.photoScore ?? 0))[0]?.name ?? null;
  return {
    photoSpot,
    sunset: find((s) => /sunset|sunrise|view|point|cliff|lake/i.test(s.name)),
    dish: stops.find((s) => s.mustTry)?.mustTry ?? null,
    cafe: find((s) => /caf[eé]|coffee|roast|bakery/i.test(s.name)),
    experience: find((s) => s.kind === "trail" || s.kind === "activity"),
  };
}

// Full per-day enrichment: themes, times, crowd, moments.
export function storyboardItinerary(
  itinerary: ItineraryDay[],
  gems: Gem[],
): ItineraryDay[] {
  const byName = gemByName(gems);
  const themed = assignThemes(itinerary);
  return themed.map((day) => {
    const stops = assignCrowd(assignStopTimes(day.stops), byName);
    const withStops = { ...day, stops };
    return { ...withStops, moments: groupMoments(withStops) };
  });
}

// ── Why reasons (#4) + confidence ────────────────────────────────────────────
export interface WhyContext {
  summary: TripSummary;
  destination: CuratedDestination;
  matchedTags: InterestTag[];
  likelyInr: number;
  travelHours: number | null;
  trails: Trail[];
  gems: Gem[];
  weather: WeatherSummary | null;
  pace: Pace;
}

const FRIENDLY: Partial<Record<InterestTag, string>> = {
  trekking: "trekking",
  adventure: "adventure",
  mountains: "mountain views",
  cafes: "cafés",
  food: "local food",
  photography: "photography",
  relaxation: "a relaxed pace",
  beaches: "beaches",
  culture: "heritage",
  spiritual: "quiet, spiritual spots",
  nightlife: "nightlife",
  wildlife: "wildlife",
  camping: "camping",
  rafting: "rafting",
  shopping: "shopping",
  "road-trip": "the drive",
  caves: "caves",
  haunted: "offbeat folklore",
};

export function buildWhyReasons(ctx: WhyContext): string[] {
  const reasons: string[] = [];
  const budget = ctx.summary.budget.maxInr;
  if (budget && ctx.likelyInr <= budget) {
    reasons.push(`Within your ₹${Math.round(budget / 1000)}k budget`);
  } else if (budget && ctx.likelyInr <= budget * 1.1) {
    reasons.push("Close to your budget");
  }
  if (ctx.travelHours != null) {
    const origin = ctx.summary.departureCities[0];
    reasons.push(
      `${ctx.travelHours <= 8 ? "Easy" : "Doable"} reach${origin ? ` from ${origin}` : ""} (~${ctx.travelHours}h)`,
    );
  }
  if (ctx.trails.length > 0) {
    reasons.push(`Excellent trekking (${ctx.trails.length} real trails)`);
  }
  const hiddenCount = ctx.gems.filter(isHiddenGem).length;
  if (hiddenCount >= 3) reasons.push(`${hiddenCount} hidden gems, low tourist crowd`);
  if (ctx.matchedTags.includes("cafes")) reasons.push("Hidden cafés to hop between");
  if (ctx.weather) {
    const pleasant =
      ctx.weather.highC <= 32 && ctx.weather.lowC >= 5 && ctx.weather.rainPct < 60;
    reasons.push(
      `${pleasant ? "Pleasant" : "Expected"} weather (${ctx.weather.lowC}–${ctx.weather.highC}°C)`,
    );
  }
  if (ctx.pace === "relaxed") reasons.push("Relaxed, unrushed pace");
  // Lead with the strongest interest matches if we have room.
  const topMatches = ctx.matchedTags
    .map((t) => FRIENDLY[t])
    .filter((v): v is string => Boolean(v))
    .slice(0, 3);
  if (topMatches.length && reasons.length < 6) {
    reasons.unshift(`Strong fit for ${topMatches.join(", ")}`);
  }
  return reasons.slice(0, 7);
}

// ── Audience fit (#16) ───────────────────────────────────────────────────────
const PERFECT_LABEL: Partial<Record<InterestTag, string>> = {
  trekking: "Trekkers & nature lovers",
  adventure: "Adventure seekers",
  mountains: "Mountain lovers",
  cafes: "Café & slow-travel folk",
  food: "Foodies",
  photography: "Photographers",
  relaxation: "Weekend escapes & unwinding",
  beaches: "Beach time",
  culture: "History & heritage buffs",
  spiritual: "Quiet, spiritual breaks",
  nightlife: "Social, nightlife trips",
  wildlife: "Wildlife & birding",
  camping: "Campers",
  rafting: "Water-sport fans",
  shopping: "Shoppers",
  "road-trip": "Road-trippers",
};

export function audience(
  destination: CuratedDestination,
  matchedTags: InterestTag[],
): { perfectFor: string[]; notIdealFor: string[] } {
  const tags = new Set(destination.tags);
  const perfect = new Set<string>();
  for (const tag of matchedTags) {
    const label = PERFECT_LABEL[tag];
    if (label) perfect.add(label);
  }
  // Fall back to the destination's own defining tags if nothing matched.
  if (perfect.size === 0) {
    for (const tag of destination.tags.slice(0, 3)) {
      const label = PERFECT_LABEL[tag];
      if (label) perfect.add(label);
    }
  }
  if (tags.has("relaxation") || tags.has("cafes") || tags.has("beaches")) {
    perfect.add("Friends & couples");
  }

  const notIdeal: string[] = [];
  if (!tags.has("nightlife")) notIdeal.push("Clubbing / party trips");
  if (!tags.has("shopping")) notIdeal.push("Big-city luxury shopping");
  if (tags.has("relaxation") || tags.has("cafes")) {
    notIdeal.push("Fast-paced, see-everything sightseeing");
  }
  if (!tags.has("nightlife") && !tags.has("shopping")) {
    notIdeal.push("Luxury / five-star comfort seekers");
  }
  return {
    perfectFor: [...perfect].slice(0, 6),
    notIdealFor: [...new Set(notIdeal)].slice(0, 4),
  };
}

// ── Difficulty + pace (#18) ──────────────────────────────────────────────────
export function difficultyAndPace(
  itinerary: ItineraryDay[],
  trails: Trail[],
): { difficulty: Difficulty; pace: Pace } {
  const hardTrail = trails.some(
    (t) => t.difficulty === "hard" || t.difficulty === "expert",
  );
  const moderateTrail = trails.some((t) => t.difficulty === "moderate");
  const activityCount = itinerary
    .flatMap((d) => d.stops)
    .filter((s) => s.kind === "trail" || s.kind === "activity").length;
  const difficulty: Difficulty = hardTrail || activityCount >= 4
    ? "challenging"
    : moderateTrail || activityCount >= 2
      ? "moderate"
      : "easy";

  const stopsPerDay =
    itinerary.reduce((sum, d) => sum + d.stops.length, 0) / Math.max(1, itinerary.length);
  const pace: Pace = stopsPerDay <= 3 ? "relaxed" : stopsPerDay <= 4.5 ? "balanced" : "packed";
  return { difficulty, pace };
}

// ── Comparison dimensions (#17) ──────────────────────────────────────────────
export function buildDimensions(
  destination: CuratedDestination,
  trails: Trail[],
  gems: Gem[],
): NonNullable<GeneratedPlan["dimensions"]> {
  const tags = new Set(destination.tags);
  const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n)));
  const has = (...t: InterestTag[]) => t.filter((x) => tags.has(x)).length;
  const adventure = clamp(2 + has("adventure", "trekking", "rafting", "camping") + Math.min(2, trails.length / 2));
  const relaxation = clamp(2 + has("relaxation", "cafes", "beaches", "spiritual"));
  const culture = clamp(2 + has("culture", "spiritual", "haunted"));
  const hiddenRatio = gems.length ? gems.filter(isHiddenGem).length / gems.length : 0.5;
  const crowd = clamp(5 - hiddenRatio * 4); // more hidden gems → quieter
  return { adventure, relaxation, culture, crowd };
}

// ── Transport legs (#6), a clearly-labeled estimate ──────────────────────────
const HILL_STATES = new Set([
  "Himachal Pradesh",
  "Uttarakhand",
  "Jammu & Kashmir",
  "Sikkim",
  "Arunachal Pradesh",
]);

export function buildTransport(
  summary: TripSummary,
  destination: CuratedDestination,
  transportInr: number,
): { transport: GeneratedPlan["transport"]; travelHours: number | null } {
  const origin = summary.departureCities[0];
  if (!origin) return { transport: null, travelHours: null };
  const km = travelBurdenKm([origin], destination.slug, destination.name);
  if (km == null) return { transport: null, travelHours: null };

  const hilly = HILL_STATES.has(destination.state);
  const hub = destination.nearestAirport || destination.name;
  let legs: NonNullable<GeneratedPlan["transport"]>["legs"];
  let totalHours: number;

  if (km > 900 && !hilly) {
    const airHours = Math.round((km / 700 + 2.5) * 10) / 10;
    legs = [
      { mode: "Flight", from: origin, to: hub, hours: airHours, inr: Math.round(transportInr * 0.8) },
      { mode: "Taxi", from: hub, to: destination.name, hours: 1.5, inr: Math.round(transportInr * 0.2) },
    ];
    totalHours = Math.round((airHours + 1.5 + 1.5) * 10) / 10; // + check-in/transfer
  } else {
    const busHours = Math.round((km / 45 + 1) * 10) / 10;
    legs = [
      { mode: hilly ? "Overnight Volvo bus" : "Bus / train", from: origin, to: hub, hours: busHours, inr: Math.round(transportInr * 0.75) },
      { mode: "Shared taxi", from: hub, to: destination.name, hours: 2, inr: Math.round(transportInr * 0.25) },
    ];
    totalHours = Math.round((busHours + 2) * 10) / 10;
  }
  return {
    transport: { legs, totalHours, perPersonInr: transportInr },
    travelHours: totalHours,
  };
}

// ── Per-meal food split (#10) ────────────────────────────────────────────────
export function foodSplit(
  foodInr: number,
  days: number,
): NonNullable<GeneratedPlan["cost"]["foodBreakdown"]> {
  const daily = foodInr / Math.max(1, days);
  const r = (frac: number) => Math.round((daily * frac) / 10) * 10;
  const breakfastInr = r(0.18);
  const lunchInr = r(0.3);
  const dinnerInr = r(0.38);
  const snacksInr = r(0.14);
  return {
    breakfastInr,
    lunchInr,
    dinnerInr,
    snacksInr,
    dailyTotalInr: breakfastInr + lunchInr + dinnerInr + snacksInr,
  };
}

// ── Deterministic copy fallbacks (#14, #19) ──────────────────────────────────
export function narrativeFallback(day: ItineraryDay): string {
  const named = day.stops
    .filter((s) => s.kind !== "transport" && s.kind !== "stay")
    .map((s) => s.name);
  if (named.length === 0) return "";
  const lead = day.theme || `Day ${day.day}`;
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `${lead}: ${list}. ${day.goal}`.trim();
}

export function reasoningFallback(input: {
  destination: CuratedDestination;
  matchedTags: InterestTag[];
  excluded: string[];
  alternatives: string[];
  destinationsAnalysed: number;
}): string {
  const matches = input.matchedTags
    .map((t) => FRIENDLY[t])
    .filter((v): v is string => Boolean(v))
    .slice(0, 4);
  const parts = [
    `We weighed ${input.destinationsAnalysed} destinations.`,
  ];
  if (input.excluded.length) {
    parts.push(`We dropped ${input.excluded.join(" and ")} as you asked.`);
  }
  parts.push(
    `${input.destination.name} stood out${matches.length ? ` for ${matches.join(", ")}` : ""}${
      input.alternatives.length ? `, ahead of ${input.alternatives.join(" and ")}` : ""
    }.`,
  );
  return parts.join(" ");
}
