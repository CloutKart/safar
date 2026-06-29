import { describe, expect, it } from "vitest";
import { getSeedTrek, treks } from "@/data/treks";
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
  similarTreks,
  shouldIGo,
  monthSuitability,
  expandedTimeline,
  stepMarkers,
  estimateTrekDays,
} from "@/lib/trek/enrich";

const levelAt = (cells: ReturnType<typeof monthSuitability>, m: number) =>
  cells.find((c) => c.month === m)!.level;

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

  it("varies pace by the trek's own distance + gain (not a flat duration)", () => {
    const short = paceEstimates(getSeedTrek("deoria-tal")!)[1].hours; // 6 km
    const long = paceEstimates(getSeedTrek("roopkund")!)[1].hours; // 53 km, multi-day
    expect(short).not.toBe(long);
    // Distance drives day count: Milam (118 km) needs more days than Roopkund (53 km).
    expect(estimateTrekDays(getSeedTrek("milam-glacier")!)).toBeGreaterThan(
      estimateTrekDays(getSeedTrek("roopkund")!),
    );
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

describe("expanded timeline + step markers", () => {
  it("adds synthesised steps, stays ascending, and keeps every real waypoint", () => {
    const trek = getSeedTrek("nag-tibba")!;
    const steps = expandedTimeline(trek);
    expect(steps.length).toBeGreaterThan(trek.timeline.length);
    for (let i = 1; i < steps.length; i++) expect(steps[i].km).toBeGreaterThanOrEqual(steps[i - 1].km);
    for (const w of trek.timeline) expect(steps.some((s) => s.km === w.km && !s.synthesized)).toBe(true);
    expect(steps.some((s) => s.synthesized)).toBe(true);
  });
  it("marks the summit with golden-hour + photo, and a camp with a tent", () => {
    const trek = getSeedTrek("kedarkantha")!;
    const steps = expandedTimeline(trek);
    const summit = steps.find((s) => s.type === "summit")!;
    expect(stepMarkers(trek, summit, steps)).toEqual(expect.arrayContaining(["🌅", "📸"]));
    const camp = steps.find((s) => s.type === "camp");
    if (camp) expect(stepMarkers(trek, camp, steps)).toContain("⛺");
  });
});

describe("calendar heatmap (monthSuitability)", () => {
  it("marks a winter trek's Dec–Mar ideal and summer monsoon avoid", () => {
    const cells = monthSuitability(getSeedTrek("kedarkantha")!);
    expect(cells).toHaveLength(12);
    expect(levelAt(cells, 1)).toBe("ideal"); // January
    expect(levelAt(cells, 7)).toBe("avoid"); // July (monsoon, off-season)
  });
  it("keeps a monsoon trek's peak months ideal (not down-graded for rain)", () => {
    const cells = monthSuitability(getSeedTrek("valley-of-flowers")!);
    expect(levelAt(cells, 8)).toBe("ideal"); // August bloom
  });
});

describe("should I go? synthesizer", () => {
  const clear = { lowC: 8, highC: 18, rainPct: 10, typical: false };
  it("says Go for an in-season easy trek and Choose another for an off-season winter summit", () => {
    expect(shouldIGo(getSeedTrek("deoria-tal")!, { month: 5, fitness: "beginner", weather: clear }).verdict).toBe("Go");
    // Kedarkantha is a Dec–Apr trek; July is monsoon → structural, not a "wait".
    expect(shouldIGo(getSeedTrek("kedarkantha")!, { month: 7, fitness: "beginner", weather: clear }).verdict).toBe("Choose another");
  });
  it("routes transient heavy weather to Wait a week, not Choose another", () => {
    const r = shouldIGo(getSeedTrek("triund")!, { month: 5, fitness: "intermediate", weather: { ...clear, rainPct: 85 } });
    expect(r.verdict).toBe("Wait a week");
  });
  it("penalises a too-hard trek for a beginner with too few days", () => {
    const r = shouldIGo(getSeedTrek("kanamo-peak")!, { month: 6, fitness: "beginner", days: 1, weather: clear });
    expect(r.verdict).toBe("Choose another");
    expect(r.score).toBeLessThan(50);
  });
});

describe("smart alternatives (similarTreks)", () => {
  it("returns DNA-near treks, never itself, each with a non-empty reason", () => {
    const base = getSeedTrek("nag-tibba")!;
    const alts = similarTreks(base, treks, 3);
    expect(alts).toHaveLength(3);
    expect(alts.every((a) => a.trek.slug !== base.slug)).toBe(true);
    expect(alts.every((a) => a.reason.trim().length > 0)).toBe(true);
    // A moderate Garhwal favourite should pull another moderate summit at #1,
    // not an expert glacier expedition.
    expect(alts[0].trek.difficulty).toBe("moderate");
  });
});
