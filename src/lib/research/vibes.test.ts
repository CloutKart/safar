import { describe, expect, it } from "vitest";
import type { InterestTag, TripSummary } from "@/lib/domain";
import { destinations } from "@/data/destinations";
import { dishesFor } from "@/data/dishes";
import { lookupCoords } from "@/lib/cityCoords";
import {
  destinationVibes,
  groupVibes,
  primaryVibe,
  wantsLuxury,
} from "@/lib/research/vibes";

const byName = (name: string) => destinations.find((d) => d.name.includes(name))!;

describe("vibe taxonomy", () => {
  it("maps a wildlife park to the Wildlife vibe and a heritage city to Heritage", () => {
    expect(destinationVibes(byName("Ranthambore"))).toContain("Wildlife");
    expect(destinationVibes(byName("Jaipur"))).toContain("Heritage");
    expect(destinationVibes(byName("Amritsar"))).toContain("Food");
  });

  it("flags premium stays with the Luxury vibe", () => {
    expect(destinationVibes(byName("Kumarakom"))).toContain("Luxury");
    expect(byName("Kumarakom").premium).toBe(true);
  });

  it("ranks the group's vibes by their weighted interests", () => {
    const weights = new Map<InterestTag, number>([
      ["wildlife", 3],
      ["food", 2],
      ["culture", 1],
    ]);
    const vibes = groupVibes(weights);
    expect(vibes[0]).toBe("Wildlife");
    expect(vibes).toContain("Food");
  });

  it("labels a plan with the group's most-wanted destination vibe", () => {
    const weights = new Map<InterestTag, number>([["food", 3], ["culture", 1]]);
    expect(primaryVibe(byName("Lucknow"), weights)).toBe("Food");
  });

  it("detects luxury intent from budget or a hard constraint", () => {
    const hi = { budget: { maxInr: 40000 }, hardConstraints: [] } as unknown as TripSummary;
    const lo = { budget: { maxInr: 12000 }, hardConstraints: [] } as unknown as TripSummary;
    const phrase = { budget: { maxInr: 12000 }, hardConstraints: ["honeymoon, want a resort"] } as unknown as TripSummary;
    expect(wantsLuxury(hi)).toBe(true);
    expect(wantsLuxury(lo)).toBe(false);
    expect(wantsLuxury(phrase)).toBe(true);
  });
});

describe("catalog integrity", () => {
  it("gives every destination coords and at least one dish", () => {
    const noCoords = destinations
      .filter((d) => !lookupCoords(d.slug) && !lookupCoords(d.name))
      .map((d) => d.name);
    const noDish = destinations
      .filter((d) => dishesFor({ slug: d.slug, name: d.name, state: d.state }).length === 0)
      .map((d) => `${d.name} (${d.state})`);
    expect(noCoords).toEqual([]);
    expect(noDish).toEqual([]);
  });

  it("serves the previously-missing vibes (wildlife, heritage cities, food cities)", () => {
    const allVibes = new Set(destinations.flatMap(destinationVibes));
    for (const v of ["Wildlife", "Heritage", "Food", "Spiritual", "Hill Station", "Luxury"]) {
      expect(allVibes.has(v as never)).toBe(true);
    }
  });
});
