import type { Trek } from "@/lib/trek/schema";

// Derived trek-page intelligence — all computed deterministically from a trek's
// own attributes (DNA, timeline, surface, season), so nothing here is fabricated
// or needs extra authoring. Covers the trek-specific additions that were missing:
// dynamic packing, exit/turnaround points, a visual crowd heatmap, and trail
// traffic estimates.

// ── Dynamic, condition-aware packing (Trek-add #15/#16) ──────────────────────
export interface PackingGroup {
  title: string;
  items: string[];
}

export function trekPacking(trek: Trek): PackingGroup[] {
  const groups: PackingGroup[] = [];

  const essentials = [
    "Trail / hiking shoes",
    "Refillable water",
    "Sun hat & sunscreen",
    "Basic first-aid kit",
    "Power bank",
    "Photo ID",
  ];
  if (trek.permitRequired) essentials.push("Permit / ID copies");
  groups.push({ title: "Essentials", items: essentials });

  const months = new Set(trek.bestMonths);
  const monsoon = trek.suitability.includes("monsoon") || [6, 7, 8, 9].some((m) => months.has(m));
  const highAlt = (trek.maxAltitudeM ?? 0) >= 3500;
  const snowy = trek.dna.snow >= 5 || trek.surface.some((s) => s.kind === "snow");
  const forest = trek.dna.forest >= 6;
  const wetGhats =
    /western ghats|khasi/i.test(trek.region) ||
    ["Karnataka", "Kerala", "Meghalaya"].includes(trek.state);

  const climate: string[] = [];
  if (snowy) climate.push("Insulated jacket & thermals", "Waterproof gloves", "Microspikes / gaiters");
  if (highAlt) climate.push("Warm layers for cold nights", "UV sunglasses", "AMS meds — acclimatise");
  if (monsoon) {
    climate.push("Rain shell / poncho", "Quick-dry layers", "Dry bag for electronics");
    if (wetGhats && forest) climate.push("Anti-leech socks + salt");
  }
  if (climate.length) groups.push({ title: "For the conditions", items: [...new Set(climate)] });

  const camping = trek.suitability.includes("camping") || trek.timeline.some((w) => w.type === "camp");
  const water = trek.waterReliability;
  const activity: string[] = [];
  if (camping) activity.push("Tent & sleeping bag", "Headlamp", "Camp stove / meals");
  if (water && (water.status === "none" || water.status === "none-after-km")) {
    activity.push(`Extra water${water.carryLitres ? ` (~${water.carryLitres} L)` : ""}`);
  }
  if (trek.guideRecommended) activity.push("Pre-arranged local guide");
  if (trek.suitability.includes("birdwatching")) activity.push("Binoculars");
  if (forest) activity.push("Insect repellent");
  if (activity.length) groups.push({ title: "For this trail", items: [...new Set(activity)] });

  return groups;
}

// ── Exit & turnaround points (Trek-add #3) ───────────────────────────────────
// Safe spots to turn back from — derived from the trail's own waypoints (shelter,
// water, villages, camps before the final hard push).
export interface TurnaroundPoint {
  km: number;
  label: string;
  note: string;
  key: boolean;
}

const TURNAROUND_NOTE: Record<string, string> = {
  camp: "Established campsite — shelter and rest",
  village: "Village — help and road access",
  water: "Reliable water source",
  rest: "Natural rest stop",
  lake: "Sheltered basin to regroup",
  meadow: "Open ground, easy to regroup",
};

export function turnaroundPoints(trek: Trek): TurnaroundPoint[] {
  if (trek.timeline.length === 0) return [];
  const sorted = [...trek.timeline].sort((a, b) => a.km - b.km);
  const crux =
    [...sorted].reverse().find((w) => w.type === "summit" || w.type === "pass") ??
    sorted[sorted.length - 1];
  const safe = new Set(Object.keys(TURNAROUND_NOTE));
  const points = sorted
    .filter((w) => safe.has(w.type) && w.km < crux.km)
    .map((w) => ({ km: w.km, label: w.label, note: TURNAROUND_NOTE[w.type], key: false }))
    .slice(0, 4);
  // The last safe point before the crux is the decision spot to flag.
  if (points.length) points[points.length - 1].key = true;
  return points;
}

// ── Visual crowd heatmap (Trek-add #8) ───────────────────────────────────────
export type CrowdLevel = "low" | "medium" | "high";
export interface CrowdCell {
  row: string;
  col: string;
  level: CrowdLevel;
}

export const CROWD_ROWS = ["Weekday", "Weekend"] as const;
export const CROWD_COLS = ["Dawn", "Morning", "Afternoon"] as const;

export function crowdHeatmap(trek: Trek): CrowdCell[] {
  const base = trek.dna.crowds; // 0–10 busyness
  const busiest = (trek.crowdPattern?.busiest ?? []).join(" ").toLowerCase();
  const dawnPeak = /sunrise|dawn|sunset/.test(busiest);
  const cells: CrowdCell[] = [];
  for (const row of CROWD_ROWS) {
    for (const col of CROWD_COLS) {
      let score = base;
      if (row === "Weekend") score += 3;
      if (col === "Morning") score += 1;
      if (col === "Dawn") score += dawnPeak ? 2 : -1;
      if (col === "Afternoon") score -= 1;
      const level: CrowdLevel = score >= 8 ? "high" : score >= 5 ? "medium" : "low";
      cells.push({ row, col, level });
    }
  }
  return cells;
}

// ── Estimated trail traffic (Trek-add #11) ───────────────────────────────────
export interface TrafficEstimate {
  weekday: string;
  weekend: string;
  peak: string;
  quiet: string;
}

export function trafficEstimate(trek: Trek): TrafficEstimate {
  const c = trek.dna.crowds;
  const band = c >= 8 ? "high" : c >= 5 ? "medium" : c >= 3 ? "low" : "trace";
  const counts: Record<typeof band, { weekday: string; weekend: string }> = {
    high: { weekday: "dozens of trekkers", weekend: "hundreds on a clear weekend" },
    medium: { weekday: "a handful of groups", weekend: "dozens on weekends" },
    low: { weekday: "often just a few groups", weekend: "a dozen or so on weekends" },
    trace: { weekday: "frequently solo", weekend: "rarely more than a couple of groups" },
  };
  return {
    weekday: counts[band].weekday,
    weekend: counts[band].weekend,
    peak: trek.crowdPattern?.busiest.join(", ") || "in-season weekends",
    quiet: trek.crowdPattern?.quietWindow || "weekday mornings",
  };
}
