import { describe, expect, it } from "vitest";
import type { InterestTag } from "@/lib/domain";
import type { Gem } from "@/lib/research/gems";
import { buildPreferenceFocus } from "@/lib/research/preferences";

function gem(partial: Partial<Gem> & Pick<Gem, "name" | "type">): Gem {
  return {
    blurb: "",
    area: null,
    sources: ["places"],
    score: 50,
    rating: 4.5,
    reviewCount: 200,
    mapsUrl: null,
    lat: null,
    lng: null,
    photoRef: null,
    ...partial,
  };
}

const gems: Gem[] = [
  gem({ name: "Bhangarh Fort", type: "history", blurb: "folklore haunted fort", score: 80 }),
  gem({ name: "Blue Tokai Coffee Roasters", type: "food", score: 70 }),
  gem({ name: "Sharma Sweets", type: "food", score: 60 }),
  gem({ name: "Triund Trek", type: "experience", score: 65 }),
  gem({ name: "Sunset Point", type: "viewpoint", score: 40 }),
];

describe("buildPreferenceFocus", () => {
  const weights = new Map<InterestTag, number>([
    ["haunted", 2],
    ["cafes", 1.5],
    ["trekking", 1],
    ["nightlife", 0.5],
    ["beaches", -1], // negative → must be dropped
  ]);
  const focus = buildPreferenceFocus(weights, gems);

  it("ranks positive interests by weight and drops negatives", () => {
    expect(focus.map((f) => f.interest)).toEqual([
      "haunted",
      "cafes",
      "trekking",
      "nightlife",
    ]);
  });

  it("buckets each interest's real candidate places by name/type match", () => {
    const places = (tag: InterestTag) =>
      focus.find((f) => f.interest === tag)?.places.map((p) => p.name) ?? [];
    expect(places("haunted")).toContain("Bhangarh Fort");
    expect(places("trekking")).toContain("Triund Trek");
    // cafes is precise: a coffee roaster qualifies, a generic sweet shop does not
    expect(places("cafes")).toContain("Blue Tokai Coffee Roasters");
    expect(places("cafes")).not.toContain("Sharma Sweets");
  });

  it("keeps an interest with no matching gem (empty places) for the LLM to satisfy", () => {
    const nightlife = focus.find((f) => f.interest === "nightlife");
    expect(nightlife).toBeDefined();
    expect(nightlife?.places).toHaveLength(0);
    expect(nightlife?.means).toMatch(/bar|rooftop|live music/i);
  });
});
