import { describe, expect, it } from "vitest";
import type { InterestTag, ItineraryDay, ItineraryStop, TripSummary } from "@/lib/domain";
import type { CuratedDestination } from "@/data/destinations";
import type { Trail } from "@/lib/research/trails";
import {
  audience,
  buildConfidence,
  buildDimensions,
  buildTransport,
  buildWhyReasons,
  companionNoteFallback,
  difficultyAndPace,
  foodSplit,
  storyboardItinerary,
  taglineFallback,
  vibeBreakdown,
} from "@/lib/research/storyboard";

function stop(partial: Partial<ItineraryStop> & Pick<ItineraryStop, "name">): ItineraryStop {
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
function day(d: number, stops: ItineraryStop[]): ItineraryDay {
  return {
    day: d,
    title: `Day ${d}`,
    stops,
    stay: null,
    theme: "",
    goal: "",
    narrative: "",
    moodEmoji: "",
    energy: 0,
    walkingKm: null,
    moments: { photoSpot: null, sunset: null, dish: null, cafe: null, experience: null },
  };
}

const destination = {
  slug: "tirthan-valley",
  name: "Tirthan Valley",
  state: "Himachal Pradesh",
  region: "North",
  nearestAirport: "Bhuntar",
  idealMonths: [4, 5, 6, 9, 10],
  minDays: 3,
  maxDays: 5,
  dailyBudgetInr: [2000, 5000],
  accessCostInr: [2000, 8000],
  tags: ["trekking", "relaxation", "cafes", "mountains", "photography"],
  highlights: [],
  cautions: [],
  sourceUrl: "https://x",
} as CuratedDestination;

describe("storyboardItinerary", () => {
  const itin = storyboardItinerary(
    [
      day(1, [stop({ name: "Check-in" }), stop({ name: "Riverside café", kind: "food" })]),
      day(2, [
        stop({ name: "Jalori Pass trek", kind: "trail" }),
        stop({ name: "Serolsar Lake", kind: "hidden-gem" }),
        stop({ name: "Lunch dhaba", kind: "food" }),
      ]),
      day(3, [stop({ name: "Sunset point" }), stop({ name: "Local breakfast", kind: "food" })]),
    ],
    [],
  );

  it("gives day 1 an arrival theme and the last day a farewell theme", () => {
    expect(itin[0].theme).toMatch(/arrival/i);
    expect(itin[2].theme).toMatch(/farewell/i);
  });

  it("assigns a different theme to the middle adventure day", () => {
    expect(itin[1].theme).not.toBe(itin[0].theme);
    expect(itin[1].theme).toMatch(/adventure/i);
  });

  it("puts time blocks on stops, snapping food to meal slots", () => {
    const day1 = itin[0];
    expect(day1.stops[0].time).toBe("8:00 AM"); // first stop
    expect(day1.stops.find((s) => s.kind === "food")?.time).toMatch(/AM|PM/);
  });

  it("fills group moments from the day's stops", () => {
    expect(itin[1].moments.experience).toBe("Jalori Pass trek");
    expect(itin[1].moments.photoSpot).toBeTruthy();
  });

  it("gives each day a mood emoji, energy and walking estimate (#8)", () => {
    expect(itin[0].moodEmoji).toBeTruthy();
    expect(itin[1].moodEmoji).toBe("🥾"); // adventure day
    // the adventure day should read more energetic than the arrival day
    expect(itin[1].energy).toBeGreaterThan(itin[0].energy);
    expect(itin[1].energy).toBeGreaterThanOrEqual(1);
    expect(itin[1].energy).toBeLessThanOrEqual(5);
  });
});

describe("vibeBreakdown / tagline / companionNote / confidence", () => {
  const weights = new Map<InterestTag, number>([
    ["relaxation", 3],
    ["cafes", 2],
    ["trekking", 1.5],
    ["food", 1],
  ]);
  const itin = storyboardItinerary(
    [
      day(1, [stop({ name: "Café" , kind: "food" })]),
      day(2, [stop({ name: "Trek", kind: "trail" })]),
    ],
    [],
  );

  it("returns a vibe mix that sums to exactly 100", () => {
    const mix = vibeBreakdown(
      ["relaxation", "cafes", "trekking", "food"] as InterestTag[],
      weights,
      itin,
    );
    expect(mix.length).toBeGreaterThan(0);
    expect(mix.reduce((s, v) => s + v.pct, 0)).toBe(100);
    expect(mix[0].tag).toBe("Relaxation"); // highest-weighted bucket leads
  });

  it("builds a non-empty tagline and a pacing-aware companion note", () => {
    expect(taglineFallback(["cafes", "mountains"] as InterestTag[], destination)).toBeTruthy();
    const note = companionNoteFallback(itin);
    expect(note.toLowerCase()).toMatch(/day \d|rushed|breathe/);
  });

  it("scores confidence sub-metrics within range", () => {
    const c = buildConfidence({
      summary: { budget: { maxInr: 15000 } } as unknown as TripSummary,
      likelyInr: 13000,
      weather: { lowC: 16, highC: 24, rainPct: 20, typical: false },
      gems: [],
      travelHours: 8,
      itinerary: itin,
    });
    expect(c.budgetFit).toBeGreaterThanOrEqual(0);
    expect(c.budgetFit).toBeLessThanOrEqual(100);
    expect(c.weatherScore).toBeGreaterThanOrEqual(0);
    expect(c.weatherScore).toBeLessThanOrEqual(10);
    expect(["low", "medium", "high"]).toContain(c.travelFatigue);
  });
});

describe("buildWhyReasons", () => {
  const summary = {
    departureCities: ["Delhi"],
    budget: { minInr: 12000, maxInr: 15000, basis: "per_person" },
  } as unknown as TripSummary;
  const reasons = buildWhyReasons({
    summary,
    destination,
    matchedTags: ["trekking", "cafes"] as InterestTag[],
    likelyInr: 13000,
    travelHours: 9,
    trails: [{ difficulty: "moderate" } as Trail],
    gems: [],
    weather: { lowC: 16, highC: 24, rainPct: 20, typical: false },
    pace: "relaxed",
  });
  it("reflects budget, travel, trekking, weather and pace signals", () => {
    const joined = reasons.join(" | ").toLowerCase();
    expect(joined).toMatch(/budget/);
    expect(joined).toMatch(/delhi/);
    expect(joined).toMatch(/trek/);
    expect(joined).toMatch(/weather/);
    expect(joined).toMatch(/relaxed/);
  });
});

describe("audience", () => {
  it("recommends nature/café folk and rules out clubbing for a quiet hill town", () => {
    const { perfectFor, notIdealFor } = audience(destination, ["trekking", "cafes"] as InterestTag[]);
    expect(perfectFor.join(" ")).toMatch(/Trekkers|Café/i);
    expect(notIdealFor.join(" ")).toMatch(/Clubbing|party/i);
  });
});

describe("difficultyAndPace", () => {
  it("flags a hard-trail trip as challenging", () => {
    const { difficulty } = difficultyAndPace(
      [day(1, [stop({ name: "Hard trek", kind: "trail" })])],
      [{ difficulty: "hard" } as Trail],
    );
    expect(difficulty).toBe("challenging");
  });
  it("rates a 2-stop/day plan as relaxed", () => {
    const { pace } = difficultyAndPace(
      [day(1, [stop({ name: "a" }), stop({ name: "b" })])],
      [],
    );
    expect(pace).toBe("relaxed");
  });
});

describe("buildTransport", () => {
  it("synthesizes Delhi→hill legs with hours and per-person cost", () => {
    const { transport, travelHours } = buildTransport(
      { departureCities: ["Delhi"] } as unknown as TripSummary,
      destination,
      3000,
    );
    expect(transport?.legs.length).toBeGreaterThanOrEqual(2);
    expect(transport?.perPersonInr).toBe(3000);
    expect(travelHours).toBeGreaterThan(0);
    expect(transport?.legs[0].mode).toMatch(/bus|volvo|flight/i);
  });
  it("returns null when there is no departure city", () => {
    const { transport } = buildTransport(
      { departureCities: [] } as unknown as TripSummary,
      destination,
      3000,
    );
    expect(transport).toBeNull();
  });
});

describe("foodSplit + buildDimensions", () => {
  it("splits the daily food spend so the parts sum to the daily total", () => {
    const fb = foodSplit(6000, 3); // 2000/day
    expect(fb.dailyTotalInr).toBe(
      fb.breakfastInr + fb.lunchInr + fb.dinnerInr + fb.snacksInr,
    );
    expect(fb.dinnerInr).toBeGreaterThan(fb.breakfastInr);
  });
  it("scores dimensions within 0–5", () => {
    const d = buildDimensions(destination, [{ difficulty: "moderate" } as Trail], []);
    for (const v of Object.values(d)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});
