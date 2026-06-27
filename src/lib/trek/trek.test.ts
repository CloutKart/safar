import { describe, expect, it } from "vitest";
import { lookupCoords } from "@/lib/cityCoords";
import { treks, getSeedTrek } from "@/data/treks";
import { getTrek } from "@/lib/trek/store";
import { TREK_DNA_DIMS, TrekIntentSchema } from "@/lib/trek/schema";
import { sunTimes, leaveBy } from "@/lib/trek/sun";
import { parseTrekQuery, recommendTreks, scoreTrek } from "@/lib/trek/recommend";

const intent = (partial: Record<string, unknown>) => TrekIntentSchema.parse(partial);

describe("seed corpus integrity", () => {
  it("loads 20 treks, each with coords and a full 12-dim DNA", () => {
    expect(treks).toHaveLength(20);
    for (const t of treks) {
      expect(t.trailheadCoords).not.toBeNull();
      for (const dim of TREK_DNA_DIMS) expect(typeof t.dna[dim]).toBe("number");
    }
  });

  it("resolves a trek by slug from the seed and the async store (Supabase off)", async () => {
    expect(getSeedTrek("triund")?.name).toContain("Triund");
    expect((await getTrek("hampta-pass"))?.state).toBe("Himachal Pradesh");
    expect(await getTrek("does-not-exist")).toBeNull();
  });
});

describe("sun timing (pure SunCalc)", () => {
  it("gives a morning sunrise and evening sunset with golden windows", () => {
    const sun = sunTimes(lookupCoords("bangalore")!, new Date("2026-06-21T00:00:00Z"));
    expect(sun.sunrise).toMatch(/AM$/);
    expect(sun.sunset).toMatch(/PM$/);
    expect(sun.goldenMorning).not.toBeNull();
    expect(sun.goldenEvening).not.toBeNull();
    expect(leaveBy(lookupCoords("bangalore")!, new Date("2026-06-21T00:00:00Z"), 2)).toMatch(/AM$/);
  });
});

describe("intent parsing (deterministic keyword fallback)", () => {
  it("reads terrain, crowds, city, month and difficulty from natural language", async () => {
    // No LLM env in tests → parseTrekQuery uses the keyword fallback.
    const i = await parseTrekQuery(
      "easy sunrise trek with waterfalls, no crowds, near Bangalore in September",
    );
    expect(i.dna.waterfalls ?? 0).toBeGreaterThanOrEqual(6);
    expect(i.dna.crowds ?? 10).toBeLessThanOrEqual(3);
    expect(i.nearCity?.toLowerCase()).toBe("bangalore");
    expect(i.month).toBe(9);
    expect(i.maxDifficulty).toBe("easy");
  });

  it("detects a weekend / dog-friendly intent", async () => {
    const i = await parseTrekQuery("quiet forest walk, dog friendly, weekend from Delhi");
    expect(i.weekend).toBe(true);
    expect(i.suitability).toContain("dog");
    expect(i.nearCity?.toLowerCase()).toBe("delhi");
  });
});

describe("scoring", () => {
  it("ranks a waterfall trek above a dry one for a waterfall wish", () => {
    const want = intent({ dna: { waterfalls: 10 } });
    const hampta = scoreTrek(want, getSeedTrek("hampta-pass")!, null).score;
    const dhankar = scoreTrek(want, getSeedTrek("dhankar-lake")!, null).score;
    expect(hampta).toBeGreaterThan(dhankar);
  });

  it("rewards being in season", () => {
    const trek = getSeedTrek("chandrashila-tungnath")!; // best months: Apr–Jun, Sep–Nov
    const inSeason = scoreTrek(intent({ month: 5 }), trek, null).score;
    const offSeason = scoreTrek(intent({ month: 1 }), trek, null).score;
    expect(inSeason).toBeGreaterThan(offSeason);
  });
});

describe("recommendTreks (end-to-end, deterministic path)", () => {
  it("makes proximity decisive when a city is named (Landour-beats-Majuli)", async () => {
    const result = await recommendTreks("quiet forest trek near Bangalore");
    expect(result.usedEmbeddings).toBe(false); // no embeddings configured in tests
    expect(result.intent.nearCity?.toLowerCase()).toBe("bangalore");
    // The nearest forest option (Coorg / Karnataka, ~220 km) must top a Himalayan
    // trek ~2000 km away, even when the far one scores well on other axes.
    expect(result.matches[0].trek.state).toBe("Karnataka");
    expect(result.matches[0].distanceKm).toBeLessThan(400);
    expect(result.matches[0].why.length).toBeGreaterThan(0);
    // Any "nearby alternatives" are genuinely near — never a 1900 km outlier.
    for (const n of result.nearby) expect(n.distanceKm).toBeLessThanOrEqual(700);
  });

  it("offers nearby alternatives when more near-city treks exist than top slots", async () => {
    // Delhi has several Himalayan treks within a few hundred km — enough to fill
    // both the matches and the nearby rail.
    const result = await recommendTreks("forest trek from Delhi");
    expect(result.nearby.every((n) => n.distanceKm <= 700)).toBe(true);
  });
});
