import { describe, expect, it } from "vitest";
import type { Trail } from "@/lib/research/trails";
import { filterNovelCandidates } from "@/lib/trek/discovery";

function mkTrail(partial: Partial<Trail> & Pick<Trail, "name" | "sources">): Trail {
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
    score: 0,
    ...partial,
  };
}

describe("offbeat discovery — novelty filter", () => {
  it("drops curated + seed-known trails and keeps novel finds, offbeat first", () => {
    const known = new Set(["triund"]);
    const trails = [
      mkTrail({ name: "Curated Ridge", sources: ["curated"] }), // curated → drop
      mkTrail({ name: "Triund", sources: ["osm"] }), // already a seed trek → drop
      mkTrail({ name: "Popular Peak", sources: ["osm"], crowdLevel: "high" }), // novel, not hidden
      mkTrail({ name: "Secret Bugyal", sources: ["reddit"], crowdLevel: "low" }), // novel + offbeat
    ];
    const out = filterNovelCandidates(trails, known);
    const names = out.map((c) => c.name);
    expect(names).not.toContain("Curated Ridge");
    expect(names).not.toContain("Triund");
    expect(names).toContain("Popular Peak");
    expect(out[0].name).toBe("Secret Bugyal"); // hidden/offbeat sorted first
    expect(out[0].hidden).toBe(true);
  });

  it("dedupes repeated names", () => {
    const out = filterNovelCandidates([
      mkTrail({ name: "Echo Trail", sources: ["osm"] }),
      mkTrail({ name: "Echo Trail", sources: ["reddit"] }),
    ], new Set());
    expect(out).toHaveLength(1);
  });
});
