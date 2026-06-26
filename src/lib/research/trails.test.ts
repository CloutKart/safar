import { describe, expect, it } from "vitest";
import {
  deriveDifficulty,
  fitsGroup,
  getTrails,
  isHiddenTrail,
  maxDifficultyFor,
  selectTrailsWithVariety,
  trailSeasonSafe,
  travelBurdenKm,
  type Trail,
} from "@/lib/research/trails";

function trail(partial: Partial<Trail> & Pick<Trail, "name">): Trail {
  return {
    distanceKm: null,
    elevationGainM: null,
    maxAltitudeM: null,
    difficulty: null,
    durationHours: null,
    trailhead: null,
    bestMonths: [],
    permitRequired: false,
    guideRecommended: false,
    routeType: null,
    routeUrl: null,
    crowdLevel: null,
    blurb: "",
    sources: ["osm"],
    score: 10,
    ...partial,
  };
}

describe("deriveDifficulty", () => {
  it("grades a short low walk as easy and a long high-ascent trek as hard/expert", () => {
    expect(deriveDifficulty(3, 100, 1500)).toBe("easy");
    expect(deriveDifficulty(12, 800, 3000)).toBe("hard");
    expect(deriveDifficulty(22, 1400, 4800)).toBe("expert");
  });
  it("returns null when nothing is known", () => {
    expect(deriveDifficulty(null, null, null)).toBeNull();
  });
  it("applies an altitude safety floor so a high peak is never easy/moderate", () => {
    // A 4800 m peak with no distance/ascent data must still grade as expert.
    expect(deriveDifficulty(null, null, 4800)).toBe("expert");
    // A 4200 m peak floors to at least hard.
    expect(deriveDifficulty(2, null, 4200)).toBe("hard");
  });
});

describe("trailSeasonSafe", () => {
  const idealMonths = [4, 5, 6, 9, 10]; // typical Himalayan trek window
  const highExpert = trail({ name: "Snow pass", difficulty: "expert", maxAltitudeM: 4500 });
  const lowEasy = trail({ name: "Valley walk", difficulty: "easy", maxAltitudeM: 1800 });

  it("drops a high-altitude/expert trail when the trip is out of season", () => {
    expect(trailSeasonSafe(highExpert, idealMonths, 1)).toBe(false); // January = snow
    expect(trailSeasonSafe(lowEasy, idealMonths, 1)).toBe(true); // low walk is fine
  });
  it("allows everything in season or when the season is unknown", () => {
    expect(trailSeasonSafe(highExpert, idealMonths, 5)).toBe(true);
    expect(trailSeasonSafe(highExpert, idealMonths, null)).toBe(true);
    expect(trailSeasonSafe(highExpert, [], 1)).toBe(true);
  });
});

describe("fitsGroup", () => {
  it("keeps an expert summit out of a relaxed group's plan", () => {
    const expert = trail({ name: "Stok Kangri", difficulty: "expert" });
    expect(fitsGroup(expert, "relaxed")).toBe(false);
    expect(fitsGroup(expert, "adventurous")).toBe(true);
  });
  it("lets an unknown-grade trail through (it's noted, not dropped)", () => {
    expect(fitsGroup(trail({ name: "Mystery trail" }), "relaxed")).toBe(true);
  });
  it("caps relaxed at moderate, balanced at hard", () => {
    expect(maxDifficultyFor("relaxed")).toBe("moderate");
    expect(maxDifficultyFor("balanced")).toBe("hard");
    expect(maxDifficultyFor("adventurous")).toBe("expert");
  });
});

describe("isHiddenTrail + selectTrailsWithVariety", () => {
  const hidden1 = trail({ name: "Offbeat ridge", sources: ["osm"], score: 30 });
  const hidden2 = trail({ name: "Quiet meadow", crowdLevel: "low", sources: ["reddit"], score: 28 });
  const marquee = trail({ name: "Famous summit", crowdLevel: "high", sources: ["osm", "reddit"], score: 80 });

  it("flags low-crowd / OSM-only routes as hidden, high-crowd as not", () => {
    expect(isHiddenTrail(hidden1)).toBe(true);
    expect(isHiddenTrail(hidden2)).toBe(true);
    expect(isHiddenTrail(marquee)).toBe(false);
  });

  it("reserves slots for hidden trails so the mix isn't all marquee", () => {
    const picked = selectTrailsWithVariety([marquee, hidden1, hidden2], 2);
    expect(picked).toContain(hidden1);
    // both a hidden and the marquee make the cut, not two marquees
    expect(picked.some((t) => isHiddenTrail(t))).toBe(true);
  });
});

describe("getTrails curated backbone", () => {
  it("returns real curated trails for a trek destination even offline/in tests", async () => {
    const trails = await getTrails("chopta", "Chopta and Tungnath");
    expect(trails.length).toBeGreaterThan(0);
    expect(trails.some((t) => /chandrashila/i.test(t.name))).toBe(true);
    // every curated trail is graded and carries a usable route link
    expect(trails.every((t) => t.difficulty != null)).toBe(true);
    expect(trails.every((t) => /^https?:\/\//.test(t.routeUrl ?? ""))).toBe(true);
    // the mix includes at least one hidden/offbeat trail
    expect(trails.some((t) => isHiddenTrail(t))).toBe(true);
  });
  it("returns [] for a destination with no curated trails", async () => {
    expect(await getTrails("goa", "Goa")).toEqual([]);
  });
});

describe("travelBurdenKm", () => {
  it("computes real distance from departure cities to a catalog destination", () => {
    // Delhi → Manali is a few hundred km; sanity-check the order of magnitude.
    const km = travelBurdenKm(["Delhi"], "manali", "Manali");
    expect(km).not.toBeNull();
    expect(km!).toBeGreaterThan(300);
    expect(km!).toBeLessThan(700);
  });
  it("averages across multiple origins and returns null when unknown", () => {
    expect(travelBurdenKm(["Delhi", "Mumbai"], "goa", "Goa")).toBeGreaterThan(0);
    expect(travelBurdenKm(["Nowhereville"], "atlantis", "Atlantis")).toBeNull();
  });
});
