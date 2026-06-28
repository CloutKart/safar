import { describe, expect, it } from "vitest";
import { getSeedTrek } from "@/data/treks";
import { trekEmbeddingText } from "@/lib/trek/schema";
import {
  crowdHeatmap,
  elevationProfile,
  emotionalTrekLine,
  paceEstimates,
  photographyGuide,
  terrainFootwear,
  trafficEstimate,
  trailheadLogistics,
  travelEfficiency,
  trekMatchSummary,
  trekPacking,
  trekRisk,
  turnaroundPoints,
  waterPlan,
  wildlifeGuide,
  worthItScore,
} from "@/lib/trek/enrich";

const flat = (groups: ReturnType<typeof trekPacking>) => groups.flatMap((g) => g.items).join(" | ");

describe("dynamic packing", () => {
  it("always includes essentials and adds snow/altitude gear for a high snowy trek", () => {
    const groups = trekPacking(getSeedTrek("kanamo-peak")!); // 5,974 m, snowy
    expect(groups[0].title).toBe("Essentials");
    const all = flat(groups);
    expect(all).toMatch(/thermals|microspikes|gloves/i);
    expect(all).toMatch(/AMS|warm layers/i);
  });

  it("adds anti-leech gear for a monsoon Western-Ghats/Khasi forest trail", () => {
    const groups = trekPacking(getSeedTrek("david-scott-trail")!); // Khasi, monsoon, forest
    expect(flat(groups)).toMatch(/leech/i);
  });
});

describe("exit & turnaround points", () => {
  it("derives bail-out points from waypoints and flags the last before the crux", () => {
    const pts = turnaroundPoints(getSeedTrek("hampta-pass")!);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts[pts.length - 1].key).toBe(true);
    // None sit at or beyond the pass itself.
    expect(pts.every((p) => p.km < 20)).toBe(true);
  });
});

describe("crowd heatmap + traffic", () => {
  it("returns a 2×3 grid and makes a popular trek busier on weekends", () => {
    const cells = crowdHeatmap(getSeedTrek("triund")!); // crowds 9
    expect(cells).toHaveLength(6);
    const weekendMorning = cells.find((c) => c.row === "Weekend" && c.col === "Morning")!;
    expect(weekendMorning.level).toBe("high");
  });

  it("keeps a hidden trek quiet across the grid", () => {
    const cells = crowdHeatmap(getSeedTrek("rohini-bugyal")!); // crowds 2
    expect(cells.every((c) => c.level !== "high")).toBe(true);
  });

  it("scales traffic estimates with busyness", () => {
    expect(trafficEstimate(getSeedTrek("triund")!).weekend).toMatch(/hundreds/i);
    expect(trafficEstimate(getSeedTrek("rohini-bugyal")!).weekday).toMatch(/solo|few/i);
  });
});

describe("embedding text", () => {
  it("builds a semantic profile naming the trek and its strengths", () => {
    const text = trekEmbeddingText(getSeedTrek("brahmagiri")!);
    expect(text).toContain("Brahmagiri");
    expect(text.length).toBeGreaterThan(60);
  });
});

describe("elevation profile", () => {
  it("starts near base, peaks at max altitude, and returns to base for out-and-back", () => {
    const p = elevationProfile(getSeedTrek("triund")!); // out-and-back, 2828 m, 1100 m gain
    expect(p.length).toBeGreaterThan(2);
    expect(p[0].m).toBeLessThan(2000); // ~base (1728 m)
    expect(Math.max(...p.map((x) => x.m))).toBe(2828); // peak = max altitude
    expect(Math.abs(p[p.length - 1].m - p[0].m)).toBeLessThan(60); // back to base
  });
});

describe("trek risk", () => {
  it("rates an off-season high-altitude expert trek as Extreme and an in-season easy one as Low", () => {
    expect(trekRisk(getSeedTrek("kanamo-peak")!, 1, null).level).toBe("Extreme");
    expect(trekRisk(getSeedTrek("deoria-tal")!, 5, null).level).toBe("Low");
  });

  it("escalates with heavy rain in the forecast", () => {
    const wet = { lowC: 12, highC: 20, rainPct: 85, typical: false };
    const r = trekRisk(getSeedTrek("triund")!, 5, wet);
    expect(r.factors.join(" ")).toMatch(/rain/i);
  });
});

describe("decision-support add-ons", () => {
  const hampta = () => getSeedTrek("hampta-pass")!;

  it("orders pace estimates Fast < Average < Relaxed with positive hours", () => {
    const [fast, avg, relaxed] = paceEstimates(hampta());
    expect(fast.hours).toBeGreaterThan(0);
    expect(fast.hours).toBeLessThan(avg.hours);
    expect(avg.hours).toBeLessThan(relaxed.hours);
  });

  it("scores travel efficiency + worth-it within range, with a verdict and reasons", () => {
    const eff = travelEfficiency(hampta(), 500);
    expect(eff.score).toBeGreaterThanOrEqual(1);
    expect(eff.score).toBeLessThanOrEqual(100);
    expect(eff.verdict.length).toBeGreaterThan(0);
    const worth = worthItScore(hampta(), eff);
    expect(worth.score).toBeGreaterThanOrEqual(0);
    expect(worth.reasons.length).toBeGreaterThan(0);
  });

  it("gives honest wildlife likelihoods and confidence-tagged logistics", () => {
    for (const w of wildlifeGuide(hampta())) {
      expect(["Low", "Possible", "Likely"]).toContain(w.probability);
    }
    const logistics = trailheadLogistics(hampta());
    expect(logistics.find((l) => l.label === "Trailhead")).toBeTruthy();
    for (const l of logistics) expect(["Known", "Estimate", "Verify"]).toContain(l.confidence);
  });

  it("plans water, footwear and narrative lines deterministically", () => {
    expect(waterPlan(hampta()).carryLitres).toBeGreaterThan(0);
    expect(terrainFootwear(hampta()).length).toBeGreaterThan(0);
    expect(photographyGuide(hampta()).some((g) => g.moment === "Drone")).toBe(true);
    expect(trekMatchSummary(hampta())).toContain("Hampta");
    expect(emotionalTrekLine(hampta()).length).toBeGreaterThan(10);
  });
});
