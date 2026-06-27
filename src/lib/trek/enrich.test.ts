import { describe, expect, it } from "vitest";
import { getSeedTrek } from "@/data/treks";
import { trekEmbeddingText } from "@/lib/trek/schema";
import {
  crowdHeatmap,
  trafficEstimate,
  trekPacking,
  turnaroundPoints,
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
