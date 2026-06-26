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
import { getGems, gemKey, isHiddenGem, mallsFor, type Gem } from "@/lib/research/gems";
import {
  buildPreferenceFocus,
  preferredGemNames,
  TAG_EXPERIENCES,
  type PreferenceFocus,
} from "@/lib/research/preferences";
import { planPhotos } from "@/lib/research/photos";
import {
  fitsGroup,
  getTrails,
  toTrailMeta,
  trailSeasonSafe,
  travelBurdenKm,
  type Trail,
} from "@/lib/research/trails";
import { dishesFor, type Dish } from "@/data/dishes";
import { lookupCoords } from "@/lib/cityCoords";
import { fetchWeather, type WeatherSummary } from "@/lib/weather";
import {
  audience,
  buildDimensions,
  buildTransport,
  buildWhyReasons,
  difficultyAndPace,
  foodSplit,
  narrativeFallback,
  reasoningFallback,
  storyboardItinerary,
} from "@/lib/research/storyboard";

// Interests that signal a trek-leaning group — drives whether we fetch trails and
// weight trail depth into the match score.
const TREK_INTERESTS: InterestTag[] = [
  "trekking",
  "adventure",
  "mountains",
  "camping",
  "rafting",
];

function trekWeight(weights: Map<InterestTag, number>): number {
  return TREK_INTERESTS.reduce((sum, tag) => sum + Math.max(0, weights.get(tag) ?? 0), 0);
}

// A 0..1 comfort score from the destination's weather over the trip window. Hot
// (>34°C), cold (<2°C) or very wet (>70% rain) drag it down; pleasant stays high.
function weatherComfort(weather: WeatherSummary | null): number | null {
  if (!weather) return null;
  let score = 1;
  if (weather.highC > 38) score -= 0.5;
  else if (weather.highC > 34) score -= 0.3;
  if (weather.lowC < 0) score -= 0.35;
  else if (weather.lowC < 4) score -= 0.15;
  if (weather.rainPct > 80) score -= 0.4;
  else if (weather.rainPct > 60) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

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
  // Grounding: real travel burden from where the group actually lives (vs. the
  // static accessCostInr range). A graded penalty that grows with distance, so a
  // nearby match is favoured over an equally-good but far-flung one — capped so
  // it never dominates a strong interest fit.
  const burden = travelBurdenKm(
    summary.departureCities,
    destination.slug,
    destination.name,
  );
  if (burden != null) score -= Math.min(3, burden / 700);
  return score;
}

// A 0-100 match score with the spec's weighting, plus a one-line "why". All
// deterministic (no extra LLM) from data already gathered for the plan.
function scorePlanMatch(input: {
  destination: CuratedDestination;
  summary: TripSummary;
  weights: Map<InterestTag, number>;
  matchedTags: InterestTag[];
  days: number;
  likely: number;
  gems: Gem[];
  hasLiveStay: boolean;
  weather: WeatherSummary | null;
  // Trails actually placed in the itinerary (post season/level gating), so the
  // score and the "why" never promise trails the plan doesn't show.
  trailCount: number;
}): { matchScore: number; whyRecommended: string } {
  const { destination, summary, weights, matchedTags, days, likely, gems, hasLiveStay, weather, trailCount } =
    input;

  const totalPositive = [...weights.values()]
    .filter((weight) => weight > 0)
    .reduce((sum, weight) => sum + weight, 0);
  const matchedWeight = matchedTags.reduce((sum, tag) => sum + (weights.get(tag) ?? 0), 0);
  const preference = totalPositive > 0 ? Math.min(1, matchedWeight / totalPositive) : 0.5;

  const budget = summary.budget.maxInr;
  const budgetFit = budget
    ? Math.max(0, Math.min(1, 1 - Math.max(0, (likely - budget) / budget)))
    : 0.7;

  const durationOk = days >= destination.minDays && days <= destination.maxDays + 1 ? 1 : 0.5;
  const month = summary.dates.start
    ? new Date(`${summary.dates.start}T00:00:00Z`).getUTCMonth() + 1
    : null;
  // Grounding: prefer real forecast/climatology comfort over the binary
  // idealMonths flag; fall back to the catalog month when weather is unavailable.
  const comfort = weatherComfort(weather);
  const seasonOk =
    comfort != null
      ? comfort
      : month
        ? destination.idealMonths.includes(month)
          ? 1
          : 0.45
        : 0.85;
  const feasibility = (durationOk + seasonOk) / 2;

  const hiddenCount = gems.filter(isHiddenGem).length;
  const popularCount = gems.length - hiddenCount;
  const hiddenQuality = Math.min(1, hiddenCount / 4);
  const popularQuality = Math.min(1, popularCount / 4);
  const accommodation = hasLiveStay ? 1 : 0.6;

  // Trek-aware boost: for a trek-leaning group, a destination with real, usable
  // trails (matched to the group's level) is a materially better pick than one
  // merely tagged "trekking" — so trail depth nudges the score up (capped at +8).
  const trek = trekWeight(weights);
  const trailBonus = trek > 0 ? Math.min(8, trailCount * 2) : 0;

  const matchScore = Math.min(
    100,
    Math.round(
      100 *
        (0.3 * preference +
          0.2 * budgetFit +
          0.15 * feasibility +
          0.15 * hiddenQuality +
          0.1 * popularQuality +
          0.1 * accommodation),
    ) + trailBonus,
  );

  const parts: string[] = [];
  if (matchedTags.length) parts.push(`strong fit for ${matchedTags.slice(0, 3).join(", ")}`);
  if (trek > 0 && trailCount > 0) {
    parts.push(`${trailCount} trail${trailCount > 1 ? "s" : ""} matched to your level`);
  }
  if (weather) {
    parts.push(
      `${weather.lowC}–${weather.highC}°C${weather.rainPct >= 60 ? `, ${weather.rainPct}% rain` : ""}${weather.typical ? " (typical)" : ""}`,
    );
  }
  if (budget) {
    parts.push(
      budgetFit >= 0.95
        ? `comfortably within your ₹${Math.round(budget / 1000)}k budget`
        : budgetFit >= 0.7
          ? "close to your budget"
          : "a stretch on budget",
    );
  }
  if (hiddenCount) {
    parts.push(`${hiddenCount} hidden gem${hiddenCount > 1 ? "s" : ""} + ${popularCount} popular sights`);
  }
  if (month && !destination.idealMonths.includes(month)) parts.push("note: off-season");
  const whyRecommended =
    parts.length > 0
      ? parts.join(" · ").replace(/^./, (char) => char.toUpperCase())
      : "A solid all-round match for your group.";

  return { matchScore, whyRecommended };
}

// How well a highlight line matches the group's top interests (higher-ranked
// interests count for more), via the per-interest name regexes.
function highlightTagScore(text: string, tags: InterestTag[]): number {
  let score = 0;
  tags.forEach((tag, index) => {
    if (TAG_EXPERIENCES[tag].match.test(text)) score += tags.length - index;
  });
  return score;
}

function activitiesFor(
  destination: CuratedDestination,
  angle: GeneratedPlan["angle"],
  tags: InterestTag[] = [],
): string[] {
  // Float highlights that match the group's interests to the front, so even the
  // template plan leans toward what they asked for; then apply the angle order.
  const base =
    tags.length > 0
      ? [...destination.highlights].sort(
          (a, b) => highlightTagScore(b, tags) - highlightTagScore(a, tags),
        )
      : destination.highlights;
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

const clampInr = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

// Deterministic per-person estimate for a single stop, scaled off the
// destination's low daily-budget tier and the stop kind. This is what lets the
// no-LLM/template plans carry the same per-stop pricing the LLM path produces,
// so EVERY plan shows budget detail — not just the one the LLM happened to fill.
function stopCostInr(
  kind: ItineraryStop["kind"],
  destination: CuratedDestination,
): number | null {
  const tier = destination.dailyBudgetInr[0];
  const round = (value: number, step: number) => Math.round(value / step) * step;
  switch (kind) {
    case "food":
      return clampInr(round(tier * 0.12, 10), 120, 450);
    case "activity":
      return clampInr(round(tier * 0.4, 50), 300, 2500);
    case "sight":
      return clampInr(round(tier * 0.06, 10), 20, 400);
    case "transport":
      return clampInr(round(tier * 0.1, 10), 50, 800);
    case "hidden-gem":
    default:
      // Offbeat viewpoints, walks and local finds are usually free entry.
      return null;
  }
}

// Only absolute http(s) URLs are valid for the schema's `.url()` stop fields.
// Some sources (e.g. Atlas Obscura) can yield a relative path; coercing those to
// null here keeps one bad link from throwing and nuking the whole plan.
const httpUrl = (value: string | null | undefined): string | null =>
  value && /^https?:\/\//.test(value) ? value : null;

// Build a stop with all optional verification/dish/trail fields defaulted to
// null, so call sites only specify what they have.
function stop(
  partial: Partial<ItineraryStop> & Pick<ItineraryStop, "name">,
): ItineraryStop {
  return {
    kind: "sight",
    note: "",
    approxInr: null,
    rating: null,
    reviewCount: null,
    reviewSnippet: null,
    mapsUrl: null,
    mustTry: null,
    trail: null,
    time: null,
    description: null,
    bestTime: null,
    crowdLevel: null,
    photoScore: null,
    ...partial,
  };
}

// Empty day-level storyboard fields, filled by the storyboard enrichers and/or
// the LLM. Spread into freshly-built days so they satisfy the schema type.
const EMPTY_DAY_STORY = {
  theme: "",
  goal: "",
  narrative: "",
  moments: {
    photoSpot: null,
    sunset: null,
    dish: null,
    cafe: null,
    experience: null,
  },
} as const;

// Big-ticket experiences (treks, rafting, dives) are priced as activities;
// everything else from the catalog highlights is a low-cost sightseeing entry.
const ACTIVITY_NAME = /trek|trail|raft|kayak|camp|dive|safari|cruise|surf|climb|paraglid|snorkel/i;

// Deterministic itinerary used when no LLM is configured (dev / no key). It is
// intentionally generic; the LLM path below is what produces specific spots,
// hidden gems, hotels and per-stop costs.
function fallbackItinerary(
  destination: CuratedDestination,
  days: number,
  angle: GeneratedPlan["angle"],
  gems: Gem[] = [],
  tags: InterestTag[] = [],
): GeneratedPlan["itinerary"] {
  const acts = activitiesFor(destination, angle, tags);
  // Real, named food spots to use instead of a generic "food stop" — one per day.
  const foodSpots = gems.filter((gem) => gem.type === "food").map((gem) => gem.name);
  return Array.from({ length: days }, (_, index) => {
    const picks =
      index === 0
        ? [acts[0]]
        : index === days - 1
          ? [acts.at(-1) ?? acts[0]]
          : [acts[index % acts.length], acts[(index + 1) % acts.length]];
    const stops: ItineraryStop[] = picks
      .filter((name): name is string => Boolean(name))
      .map((name) => {
        const kind: ItineraryStop["kind"] = ACTIVITY_NAME.test(name)
          ? "activity"
          : "sight";
        return stop({ name, kind, approxInr: stopCostInr(kind, destination) });
      });
    const foodName = foodSpots.length
      ? foodSpots[index % foodSpots.length]
      : null;
    stops.push(
      stop({
        name: foodName ?? "Local café or food stop",
        kind: "food",
        note: foodName ? "well-rated local eatery" : "",
        approxInr: stopCostInr("food", destination),
      }),
    );
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
      ...EMPTY_DAY_STORY,
    };
  });
}

// Add one real, verified gem per day as a hidden-gem stop (skipping any the
// itinerary already names). Works with or without the LLM.
function injectGems(
  itinerary: GeneratedPlan["itinerary"],
  gems: Gem[],
  destination: CuratedDestination,
  preferred: Set<string> = new Set(),
): GeneratedPlan["itinerary"] {
  if (gems.length === 0) return itinerary;
  const present = itinerary.flatMap((day) =>
    day.stops.map((stop) => gemKey(stop.name)),
  );
  // Substring-aware so "Gokarna view point" isn't re-added when the LLM already
  // wrote "Sunset at Gokarna view point".
  const fresh = gems
    .filter((gem) => {
      const key = gemKey(gem.name);
      return key.length > 0 && !present.some((name) => name.includes(key) || key.includes(name));
    })
    // Float gems that match the group's interests first, then genuinely
    // lesser-known spots — the headline sights are already in the day plan.
    .sort((a, b) => {
      const pref =
        Number(preferred.has(b.name.toLowerCase())) -
        Number(preferred.has(a.name.toLowerCase()));
      return pref !== 0 ? pref : Number(isHiddenGem(b)) - Number(isHiddenGem(a));
    });
  // Inject one gem per day that still has room, keeping pacing (max ~5 stops).
  let cursor = 0;
  return itinerary.map((day) => {
    if (day.stops.length >= 5 || cursor >= fresh.length) return day;
    const gem = fresh[cursor];
    cursor += 1;
    const isFood = gem.type === "food";
    const isShopping = gem.type === "shopping";
    // Malls/markets read as a planned "sight", not an offbeat 💎 hidden gem.
    const kind = isFood ? "food" : isShopping ? "sight" : "hidden-gem";
    return {
      ...day,
      stops: [
        ...day.stops,
        stop({
          name: gem.name,
          kind: kind as ItineraryStop["kind"],
          note:
            gem.blurb ||
            (isFood
              ? "well-rated local eatery"
              : isShopping
                ? "malls, markets and shopping"
                : gem.sources.includes("places")
                  ? "well-rated, low-key local spot"
                  : "offbeat local find"),
          approxInr: isFood
            ? stopCostInr("food", destination)
            : isShopping
              ? stopCostInr("sight", destination)
              : null,
          // A.1 — surface the verification we already fetched.
          rating: gem.rating,
          reviewCount: gem.reviewCount,
          reviewSnippet: gem.reviewSnippet ?? null,
          mapsUrl: httpUrl(gem.mapsUrl),
        }),
      ],
    };
  });
}

// Backfill verification (rating, reviews, maps link) onto any stop whose name
// matches a real gem we already fetched — including LLM-written stops, which
// don't carry this data. Substring-aware so "Sunset at Tungnath" matches the
// "Tungnath" gem. Only fills empty fields, never overwrites.
function enrichStopReviews(
  itinerary: GeneratedPlan["itinerary"],
  gems: Gem[],
): GeneratedPlan["itinerary"] {
  const indexed = gems
    .map((gem) => ({ key: gemKey(gem.name), gem }))
    .filter((entry) => entry.key.length >= 4);
  // Match a stop to a gem by name. Exact key wins; a substring match is only
  // trusted when the shared key is long enough (≥5 chars) to be specific, so a
  // generic "Café" stop never inherits an unrelated café's rating.
  const matchGem = (name: string): Gem | null => {
    const key = gemKey(name);
    if (key.length < 4) return null;
    const exact = indexed.find((entry) => entry.key === key);
    if (exact) return exact.gem;
    const loose = indexed.find(
      (entry) =>
        (key.includes(entry.key) && entry.key.length >= 5) ||
        (entry.key.includes(key) && key.length >= 5),
    );
    return loose?.gem ?? null;
  };
  return itinerary.map((day) => ({
    ...day,
    stops: day.stops.map((stop) => {
      if (stop.rating != null || stop.reviewSnippet) return stop;
      const gem = matchGem(stop.name);
      if (!gem) return stop;
      return {
        ...stop,
        rating: stop.rating ?? gem.rating,
        reviewCount: stop.reviewCount ?? gem.reviewCount,
        mapsUrl: stop.mapsUrl ?? httpUrl(gem.mapsUrl),
        reviewSnippet: stop.reviewSnippet ?? gem.reviewSnippet ?? null,
      };
    }),
  }));
}

// Set a signature dish to order on food stops (Part B). The stop already names
// the eatery (from the gem pool / LLM); this pairs it with a real local dish to
// try, cycling the destination's signature dishes so no food stop is generic.
function attachDishes(
  itinerary: GeneratedPlan["itinerary"],
  dishes: Dish[],
): GeneratedPlan["itinerary"] {
  if (dishes.length === 0) return itinerary;
  let cursor = 0;
  return itinerary.map((day) => ({
    ...day,
    stops: day.stops.map((stop) => {
      if (stop.kind !== "food" || stop.mustTry) return stop;
      const dish = dishes[cursor % dishes.length];
      cursor += 1;
      return { ...stop, mustTry: dish.name };
    }),
  }));
}

// Inject real trails as "trail" stops (Part C). Filters to the group's level
// (fitsGroup) and applies a season-safety gate — out of the destination's ideal
// months, high-altitude (≥3500 m) or expert trails are dropped (snow/AMS risk).
// Floats hidden trails, adds at most one per day with room, and carries full
// metadata so the UI can show distance/difficulty/permit chips.
function injectTrails(
  itinerary: GeneratedPlan["itinerary"],
  trails: Trail[],
  destination: CuratedDestination,
  angle: GeneratedPlan["angle"],
  month: number | null,
): GeneratedPlan["itinerary"] {
  if (trails.length === 0) return itinerary;
  const usable = trails
    .filter((trail) => fitsGroup(trail, angle))
    .filter((trail) => trailSeasonSafe(trail, destination.idealMonths, month))
    .filter(
      (trail) =>
        trail.bestMonths.length === 0 || month == null || trail.bestMonths.includes(month),
    );
  if (usable.length === 0) return itinerary;

  // Does a trail name refer to the same place an existing stop already names?
  const sameAs = (trail: Trail, stopName: string): boolean => {
    const tk = gemKey(trail.name);
    const sk = gemKey(stopName);
    if (tk.length < 3 || sk.length < 3) return false;
    return tk === sk || tk.includes(sk) || sk.includes(tk);
  };

  const claimed = new Set<Trail>();
  // Pass 1: match each stop the LLM wrote — whether it called the trek an
  // "activity" or already a metadata-less "trail" — to a real trail, and enrich
  // it in place. Claiming the match prevents Pass 2 from injecting a duplicate.
  let next = itinerary.map((day) => ({
    ...day,
    stops: day.stops.map((s) => {
      const match = usable.find((t) => !claimed.has(t) && sameAs(t, s.name));
      if (!match) return s;
      claimed.add(match);
      if (s.kind === "trail" && s.trail) return s; // already rich — just dedup
      const meta = toTrailMeta(match);
      return {
        ...s,
        kind: "trail" as const,
        note: s.note || match.blurb || "trekking route",
        approxInr: s.approxInr ?? stopCostInr("activity", destination),
        mapsUrl: s.mapsUrl ?? httpUrl(meta.routeUrl),
        trail: meta,
      };
    }),
  }));

  // Pass 2: inject the remaining trails (one per day with room) so even a
  // template plan, or one the LLM under-filled, surfaces real trails.
  const remaining = usable.filter((t) => !claimed.has(t));
  let cursor = 0;
  next = next.map((day) => {
    if (day.stops.length >= 5 || cursor >= remaining.length) return day;
    const trail = remaining[cursor];
    cursor += 1;
    const meta = toTrailMeta(trail);
    return {
      ...day,
      stops: [
        ...day.stops,
        stop({
          name: trail.name,
          kind: "trail",
          note: trail.blurb || "trekking route",
          approxInr: stopCostInr("activity", destination),
          mapsUrl: httpUrl(meta.routeUrl),
          trail: meta,
        }),
      ],
    };
  });

  // Pass 3: any "trail" stop the LLM invented that we couldn't back with real
  // data becomes a plain "activity" — never show an empty trail card.
  return next.map((day) => ({
    ...day,
    stops: day.stops.map((s) =>
      s.kind === "trail" && !s.trail ? { ...s, kind: "activity" as const } : s,
    ),
  }));
}

const PLANNER_SYSTEM = `You are Safar, a sharp India travel planner who knows places beyond the obvious tourist list. You write one concrete plan for ONE destination for a friend group.

Rules:
- Output STRICT JSON only, matching: {"summary": string, "reasoning": string, "itinerary": [{"day": number, "theme": string, "goal": string, "narrative": string, "title": string, "stops": [{"name": string, "kind": "sight"|"hidden-gem"|"activity"|"food"|"transport"|"trail", "note": string, "description": string, "approxInr": number|null, "mustTry": string|null}], "stay": {"name": string, "area": string, "approxInrPerNight": number|null} | null}]}.
- "reasoning": 1-2 warm sentences on WHY this destination suits THIS group over the alternatives (reference their interests/budget/dates). This is the "AI thinking" the group reads first.
- Give every day a distinct "theme" (e.g. "Arrival & Slow Evening", "Adventure Day", "Culture & Hidden Gems", "Farewell Morning") and a one-line "goal" — no two days should feel the same. "narrative" is a short, warm 1-2 sentence story of the day ("Today is your adventure day — after breakfast you trek through pine forest to a quiet waterfall…").
- "description": 1-2 lines per stop on WHY it's worth it / what to expect (e.g. "17th-century wooden temple, one of the least crowded heritage spots in the valley"). "note" stays a 3-5 word tag. Make people excited, stay truthful.
- You are given "localTrails" — real trekking routes (with distance/difficulty/altitude). When the group wants trekking/adventure, build days around a NAMED trail from this list as a "trail" stop, budgeting a half/full day for it; for high-altitude routes add an acclimatisation day and an early-start note. Never invent a generic "scenic trek".
- You are given "signatureDishes" — real local dishes. On every "food" stop set "mustTry" to a specific dish the named eatery is known for (prefer these); never leave a food stop without a real dish.
- Produce EXACTLY the requested number of days.
- Shape it as a JOURNEY with a realistic arc, not a checklist:
  - Day 1 (arrival): keep it LIGHT — 2-3 easy stops near the stay (check-in, a relaxed local walk, an unhurried dinner). Account for travel fatigue; no long excursions.
  - Middle days (exploration/activity): the fuller days — 4-5 stops of signature experiences. Keep each day DOABLE: group stops that are geographically close (no zig-zagging), keep active sightseeing under ~8 hours, and include one slower moment (a cafe, a sunset, a leisurely meal) so it never feels rushed.
  - Last day (departure): keep it RELAXED — 2-3 stops max, a final easy highlight or some shopping, then wind down for the journey home.
  - For longer trips, vary the rhythm: mix exploration days with at least one chill/lighter day so it never feels exhausting or wastefully stretched.
- Every day must blend POPULAR must-see landmarks with at least one genuine lesser-known "hidden-gem", and at least one "food" stop naming a real local dish or eatery. Order stops in a natural daily flow (morning → afternoon → evening). Big sights (forts, palaces, treks) take half a day — budget time for them and don't overstuff.
- You are given "localGems" — real, verified local spots for this place. Prefer them for your hidden-gem and sightseeing stops, weaving them into the days with a short reason; only invent a spot if the gems don't cover a day.
- The group's actual interests are in "group.preferenceFocus" — each has a "means" (what that interest looks like as real experiences) and real candidate "places". For EACH interest listed, include at least one specific, NAMED stop that genuinely delivers it: prefer the given "places"; if none are given, use a real, specific spot that fits the "means". If this destination genuinely cannot support an interest, skip it silently — never fake or force it.
- Name real, specific places. Never use generic placeholders like "a local cafe", "a viewpoint", "the local market" or "a nice restaurant" — always name the actual spot.
- Name a realistic mid-range "stay" per day (a real, plausible property/area for that place), with a per-night per-person estimate.
- "approxInr" is a rough PER-PERSON estimate for that stop (entry, ride, meal). Use null when free. These are estimates, not quotes; keep them realistic for India and within the group's budget.
- Ground everything in the provided destination highlights, cautions and research. Respect the group's days, budget and hard constraints. Never recommend anything the cautions warn against.
- Keep "note" to one short tag and put the real explanation in "description". No markdown, no prose outside the JSON.`;

const PlanDetailSchema = z.object({
  summary: z.string(),
  reasoning: z.string().default(""),
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
  preferenceFocus: PreferenceFocus[];
  trails: Trail[];
  dishes: Dish[];
  alternatives: string[];
  excluded: string[];
}): Promise<z.infer<typeof PlanDetailSchema> | null> {
  const context = {
    angle: input.angle,
    days: input.days,
    // So the LLM's "reasoning" can justify this pick over the other options.
    otherOptions: input.alternatives,
    ruledOut: input.excluded,
    localGems: input.gems
      .slice(0, 8)
      .map((gem) => ({ name: gem.name, type: gem.type, note: gem.blurb })),
    localTrails: input.trails.slice(0, 6).map((trail) => ({
      name: trail.name,
      difficulty: trail.difficulty,
      distanceKm: trail.distanceKm,
      maxAltitudeM: trail.maxAltitudeM,
      permitRequired: trail.permitRequired,
      note: trail.blurb,
    })),
    signatureDishes: input.dishes.slice(0, 8).map((dish) => ({
      name: dish.name,
      note: dish.description,
    })),
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
      // Ranked interests with what each means + real candidate places, so the
      // LLM curates a specific named stop per preference (not a generic list).
      preferenceFocus: input.preferenceFocus,
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
  const excluded = summary.excludedDestinations.map((value) => value.toLowerCase());
  const isExcluded = (destination: CuratedDestination) => {
    const name = destination.name.toLowerCase();
    const head = name.split(/[ (]/)[0];
    return excluded.some((ex) => name === ex || name.includes(ex) || ex.includes(head));
  };
  const ranked = destinations
    .filter((destination) => !isExcluded(destination))
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
      const [searchResults, quotes, baseGems] = await Promise.all([
        researchDestination(destination, summary),
        getPriceQuotes(destination, summary),
        getGems(destination.name).catch(() => [] as Gem[]),
      ]);
      // Malls/shopping spots are pulled in ONLY when the group wants shopping,
      // so they never cheapen a trek/heritage plan.
      const gems =
        (weights.get("shopping") ?? 0) > 0
          ? [...baseGems, ...(await mallsFor(destination.name).catch(() => []))]
          : baseGems;

      const month = summary.dates.start
        ? new Date(`${summary.dates.start}T00:00:00Z`).getUTCMonth() + 1
        : null;
      const wantsTrek = trekWeight(weights) > 0;
      const destCoords =
        lookupCoords(destination.slug) ?? lookupCoords(destination.name);
      // Trails only for trek-leaning groups (so a café trip isn't padded with
      // treks); weather for the actual window grounds season fit/safety; dishes
      // come from the curated seed.
      const [trails, weather] = await Promise.all([
        wantsTrek
          ? getTrails(destination.slug, destination.name, destCoords).catch(
              () => [] as Trail[],
            )
          : Promise.resolve([] as Trail[]),
        destCoords && summary.dates.start
          ? fetchWeather(
              destCoords,
              summary.dates.start,
              summary.dates.end ?? summary.dates.start,
            ).catch(() => null)
          : Promise.resolve(null),
      ]);
      const dishes = dishesFor({
        slug: destination.slug,
        name: destination.name,
        state: destination.state,
      });

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

      // The group's interests ranked + backed by real candidate places from
      // this destination's gem pool — drives both the LLM prompt and the
      // fallback so plans curate per preference instead of generically.
      const preferenceFocus = buildPreferenceFocus(weights, gems);

      // The other two destinations on the table — so the LLM (and the
      // deterministic fallback) can justify this pick over them (#19).
      const alternatives = finalSelection
        .filter((d) => d.slug !== destination.slug)
        .map((d) => d.name);

      // LLM-written specifics, grounded in the catalog + pricing + research.
      // Falls back to a generic template when no LLM is configured.
      // Run the LLM and photo lookups concurrently.
      const [detail, destinationImages] = await Promise.all([
        enrichItinerary({
          destination,
          summary,
          angle,
          days,
          quotes,
          research,
          gems,
          preferenceFocus,
          trails,
          dishes,
          alternatives,
          excluded: summary.excludedDestinations,
        }),
        planPhotos(destination.name, gems).catch(() => []),
      ]);
      const baseItinerary =
        detail?.itinerary ??
        fallbackItinerary(destination, days, angle, gems, matchedTags);
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
      // Guarantee real, verified hidden gems appear even without an LLM, and
      // float the ones that match the group's interests to the front.
      const withGems = injectGems(
        withStay,
        gems,
        destination,
        preferredGemNames(preferenceFocus),
      );
      // Layer in real trails (trek groups), a signature dish per food stop, and
      // backfill ratings/reviews onto every stop that matches a real place.
      const withTrails = wantsTrek
        ? injectTrails(withGems, trails, destination, angle, month)
        : withGems;
      const itinerary = enrichStopReviews(
        attachDishes(withTrails, dishes),
        gems,
      );
      // The trails actually placed in the plan (post level/season gating) drive
      // both the score and the safety tradeoffs, so they stay consistent.
      const usedTrails = itinerary
        .flatMap((day) => day.stops)
        .filter((stop) => stop.kind === "trail");
      const planSummary =
        detail?.summary ||
        `${days} days built around ${matchedTags.slice(0, 4).join(", ") || destination.tags.slice(0, 4).join(", ")} without breaking the group’s stated hard constraints.`;
      const { matchScore, whyRecommended } = scorePlanMatch({
        destination,
        summary,
        weights,
        matchedTags,
        days,
        likely,
        gems,
        hasLiveStay: Boolean(stayQuote?.title),
        weather,
        trailCount: usedTrails.length,
      });
      // Surface trek safety as explicit tradeoffs: permits, guide need, and an
      // off-season warning grounded in the actual forecast.
      const trekTradeoffs: string[] = [];
      if (usedTrails.some((stop) => stop.trail?.permitRequired)) {
        trekTradeoffs.push("Some trails need a forest/area permit — arrange in advance.");
      }
      if (usedTrails.some((stop) => stop.trail?.guideRecommended)) {
        trekTradeoffs.push("High-altitude trails: a local guide and acclimatisation day are advised.");
      }
      if (weather && (weather.highC > 36 || weather.lowC < 0 || weather.rainPct > 70)) {
        trekTradeoffs.push(
          `Weather for your dates looks tough (${weather.lowC}–${weather.highC}°C, ${weather.rainPct}% rain) — pack accordingly.`,
        );
      }
      const tradeoffs = [...destination.cautions, ...trekTradeoffs];

      // ── V1.2 storyboard: turn the itinerary into a scannable, justified story.
      const { transport, travelHours } = buildTransport(summary, destination, transportInr);
      const storyItinerary = storyboardItinerary(itinerary, gems).map((day) => ({
        ...day,
        narrative: day.narrative || narrativeFallback(day),
      }));
      const { difficulty, pace } = difficultyAndPace(storyItinerary, trails);
      const whyReasons = buildWhyReasons({
        summary,
        destination,
        matchedTags,
        likelyInr: likely,
        travelHours,
        trails,
        gems,
        weather,
        pace,
      });
      const { perfectFor, notIdealFor } = audience(destination, matchedTags);
      const dimensions = buildDimensions(destination, trails, gems);
      const reasoning =
        detail?.reasoning ||
        reasoningFallback({
          destination,
          matchedTags,
          excluded: summary.excludedDestinations,
          alternatives,
          destinationsAnalysed: ranked.length,
        });

      const retrievedAt = new Date().toISOString();
      return GeneratedPlanSchema.parse({
        optionNumber: index + 1,
        matchScore,
        whyRecommended,
        title: `${destination.name}: ${angle === "balanced" ? "the group sweet spot" : angle === "adventurous" ? "go bigger" : "slow down and taste more"}`,
        destinationSlug: destination.slug,
        destinationName: destination.name,
        destinationState: destination.state,
        angle,
        summary: planSummary,
        preferenceCoverage: matchedTags.slice(0, 6),
        tradeoffs,
        itinerary: storyItinerary,
        whyReasons,
        destinationsAnalysed: ranked.length,
        reasoning,
        perfectFor,
        notIdealFor,
        difficulty,
        pace,
        travelHours,
        dimensions,
        transport,
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
          foodBreakdown: foodSplit(foodInr, days),
        },
        destinationImages,
      });
    }),
  );

  return plans;
}
