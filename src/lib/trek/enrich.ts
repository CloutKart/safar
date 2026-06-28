import type { WeatherSummary } from "@/lib/weather";
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

// ── Estimated elevation profile (Trek-add: elevation graph) ──────────────────
// No survey/DEM data, so synthesize from real endpoints: base = max − gain, rise
// to the summit/pass waypoint's km, then descend (back to base for out-and-back).
// Clearly an ESTIMATE — a DEM API would refine it later.
export interface ElevationPoint {
  km: number;
  m: number;
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export function elevationProfile(trek: Trek): ElevationPoint[] {
  const total = trek.distanceKm;
  const maxM = trek.maxAltitudeM;
  if (total == null || maxM == null || total <= 0) return [];
  const gain = trek.elevationGainM ?? Math.round(maxM * 0.3);
  const base = Math.max(0, maxM - gain);
  const highWp = [...trek.timeline]
    .sort((a, b) => a.km - b.km)
    .find((w) => w.type === "summit" || w.type === "pass" || w.type === "lake");
  const summitKm = highWp?.km ?? (trek.routeType === "out-and-back" ? total / 2 : total * 0.7);
  const endM = trek.routeType === "out-and-back" ? base : base + (maxM - base) * 0.15;

  const N = 24;
  const pts: ElevationPoint[] = [];
  for (let i = 0; i <= N; i += 1) {
    const km = (total * i) / N;
    let m: number;
    if (km <= summitKm) {
      const t = summitKm <= 0 ? 1 : km / summitKm;
      m = base + (maxM - base) * easeInOut(t);
    } else {
      const t = (km - summitKm) / Math.max(total - summitKm, 0.1);
      m = maxM + (endM - maxM) * easeInOut(Math.min(1, t));
    }
    pts.push({ km: Math.round(km * 10) / 10, m: Math.round(m) });
  }
  return pts;
}

// ── Trek risk score (Trek-add: AI risk) ──────────────────────────────────────
// A deterministic heuristic from altitude, grade, season fit, live weather (when
// available), guide need and water — NOT a live landslide/avalanche feed.
export interface TrekRisk {
  level: "Low" | "Moderate" | "High" | "Extreme";
  factors: string[];
}

export function trekRisk(
  trek: Trek,
  month: number | null,
  weather: WeatherSummary | null,
): TrekRisk {
  let score = 0;
  const factors: string[] = [];
  const alt = trek.maxAltitudeM ?? 0;
  if (alt >= 4500) {
    score += 3;
    factors.push("Very high altitude — AMS risk, acclimatise properly");
  } else if (alt >= 3500) {
    score += 2;
    factors.push("High altitude — watch for AMS");
  }
  if (trek.difficulty === "expert") {
    score += 2;
    factors.push("Expert grade — exposure and route-finding");
  } else if (trek.difficulty === "hard") {
    score += 1;
    factors.push("Hard grade — sustained effort");
  }
  if (month != null && trek.bestMonths.length && !trek.bestMonths.includes(month)) {
    const adjacent = trek.bestMonths.some((m) => {
      const d = Math.abs(m - month);
      return Math.min(d, 12 - d) === 1;
    });
    score += adjacent ? 1 : 2;
    factors.push(adjacent ? "Shoulder season — check conditions" : "Out of season — conditions can be poor");
  }
  if (weather) {
    if (weather.rainPct >= 70) {
      score += 2;
      factors.push(`Heavy rain likely (${weather.rainPct}%) — slippery, possible washouts`);
    } else if (weather.rainPct >= 40) {
      score += 1;
      factors.push(`Some rain (${weather.rainPct}%) — carry a shell`);
    }
    if (weather.lowC < 0) {
      score += 1;
      factors.push(`Freezing nights (${weather.lowC}°C) — ice and cold`);
    } else if (weather.highC > 36) {
      score += 1;
      factors.push(`Very hot (${weather.highC}°C) — heat and hydration`);
    }
  }
  if (trek.guideRecommended) {
    score += 1;
    factors.push("Guide advised for this route");
  }
  if (trek.waterReliability && (trek.waterReliability.status === "none" || trek.waterReliability.status === "none-after-km")) {
    factors.push("Limited water — carry enough");
  }
  const level: TrekRisk["level"] =
    score >= 8 ? "Extreme" : score >= 5 ? "High" : score >= 2 ? "Moderate" : "Low";
  if (factors.length === 0) factors.push("Straightforward in season");
  return { level, factors };
}

export interface PaceEstimate {
  label: "Fast" | "Average" | "Relaxed";
  hours: number;
  note: string;
}

export function paceEstimates(trek: Trek): PaceEstimate[] {
  const average =
    trek.durationHours ??
    Math.max(
      1,
      (trek.distanceKm ?? 5) / 3.5 + (trek.elevationGainM ?? 0) / 550,
    );
  const round = (value: number) => Math.round(value * 2) / 2;
  return [
    { label: "Fast", hours: round(average * 0.78), note: "fit pace, short photo stops" },
    { label: "Average", hours: round(average), note: "steady pace with normal breaks" },
    { label: "Relaxed", hours: round(average * 1.32), note: "long rests and photo time" },
  ];
}

export interface EfficiencyScore {
  score: number;
  travelHours: number;
  trekHours: number;
  payoff: number;
  verdict: string;
}

export function travelEfficiency(
  trek: Trek,
  straightLineKm: number | null,
): EfficiencyScore {
  const travelHours = straightLineKm == null ? 0 : Math.max(1, straightLineKm / 45);
  const trekHours = paceEstimates(trek)[1].hours;
  const payoff =
    trek.scenicDensity?.composite ??
    Math.round((trek.dna.views + trek.dna.hidden + trek.dna.photography) / 3);
  const ratio = travelHours > 0 ? trekHours / travelHours : 1;
  const score = Math.max(
    1,
    Math.min(100, Math.round(payoff * 8 + Math.min(20, ratio * 12))),
  );
  const verdict =
    score >= 80
      ? "Exceptional payoff for the journey"
      : score >= 62
        ? "Worth making a day of it"
        : score >= 45
          ? "Best when folded into a wider trip"
          : "The approach is the bigger commitment";
  return { score, travelHours, trekHours, payoff, verdict };
}

export interface WorthItScore {
  score: number;
  label: string;
  reasons: string[];
}

export function worthItScore(
  trek: Trek,
  efficiency: EfficiencyScore,
): WorthItScore {
  const scenery = trek.scenicDensity?.composite ?? trek.dna.views;
  const uniqueness = trek.dna.hidden;
  const crowdBonus = 10 - trek.dna.crowds;
  const score = Math.round(
    Math.min(
      100,
      scenery * 5 + uniqueness * 2.5 + crowdBonus * 1.5 + efficiency.score * 0.1,
    ),
  );
  return {
    score,
    label:
      score >= 85
        ? "Make the detour"
        : score >= 68
          ? "Strong yes"
          : score >= 50
            ? "Worth it in season"
            : "Choose for the journey, not only the summit",
    reasons: [
      `${scenery}/10 scenic density`,
      `${uniqueness}/10 uniqueness`,
      trek.dna.crowds <= 4 ? "usually quieter than headline trails" : "crowds reduce the payoff at peak time",
    ],
  };
}

export function trekMatchSummary(trek: Trek): string {
  const strengths = Object.entries(trek.dna)
    .filter(([, value]) => value >= 7)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key.replace(/-/g, " "));
  const caveat =
    trek.difficulty === "expert"
      ? "It rewards experience, acclimatisation and conservative decisions."
      : trek.dna.crowds >= 7
        ? "Start early, because the quiet version of this trail disappears by mid-morning."
        : "Its best moments arrive before the day gets loud.";
  return `${trek.name} fits when you want ${strengths.join(", ")} rather than a checklist trek. ${caveat}`;
}

export function emotionalTrekLine(trek: Trek): string {
  if (trek.dna.hidden >= 8) return "A trail that feels like finding a secret before everyone else does.";
  if (trek.dna.views >= 9) return "The kind of climb where the horizon keeps widening until conversation stops.";
  if (trek.dna.forest >= 8) return "A green, shaded walk that reveals its payoff slowly.";
  if (trek.dna.waterfalls >= 8) return "Follow the sound of water until the trail opens up.";
  return "A measured escape with just enough effort to make the view feel earned.";
}

export interface WildlifeLikelihood {
  label: string;
  probability: "Low" | "Possible" | "Likely";
  note: string;
}

export function wildlifeGuide(trek: Trek): WildlifeLikelihood[] {
  const habitat = trek.scenicDensity?.wildlife ?? trek.dna.forest / 2;
  const highAltitude = (trek.maxAltitudeM ?? 0) >= 3500;
  const forest = trek.dna.forest >= 6;
  return [
    {
      label: highAltitude ? "High-altitude birds" : forest ? "Forest birds" : "Open-country birds",
      probability: habitat >= 7 ? "Likely" : habitat >= 4 ? "Possible" : "Low",
      note: "Best around quiet dawn hours; habitat likelihood, not a guaranteed sighting.",
    },
    {
      label: highAltitude ? "Mountain ungulates" : "Small mammals",
      probability: habitat >= 7 && trek.dna.crowds <= 4 ? "Possible" : "Low",
      note: "Keep distance, carry no food for wildlife, and never leave the trail to pursue a sighting.",
    },
    {
      label: forest ? "Insects and leeches" : "Reptiles and insects",
      probability:
        trek.suitability.includes("monsoon") || (forest && ["Kerala", "Karnataka", "Meghalaya"].includes(trek.state))
          ? "Likely"
          : "Possible",
      note: "Season and recent rain matter more than the catalog score.",
    },
  ];
}

export interface PhotographyGuide {
  moment: string;
  guidance: string;
}

export function photographyGuide(trek: Trek): PhotographyGuide[] {
  const summit = trek.timeline.find((waypoint) =>
    ["summit", "pass", "viewpoint", "ridge", "lake"].includes(waypoint.type),
  );
  return [
    {
      moment: "Golden hour",
      guidance: `Reach ${summit?.label ?? "the main viewpoint"} 20–30 minutes before sunrise or sunset; use the date-aware sun planner below.`,
    },
    {
      moment: "Milky Way",
      guidance:
        trek.dna.crowds <= 4 && trek.dna.hidden >= 6
          ? "Promising dark-sky character on a clear, moonless night; verify cloud and moon conditions."
          : "Possible only away from settlements and group lighting; check moon phase and local access hours.",
    },
    {
      moment: "Drone",
      guidance:
        "Do not assume permission. Check Digital Sky, forest/protected-area, defence, temple and local rules before launch.",
    },
  ];
}

export function terrainFootwear(trek: Trek): string[] {
  const kinds = new Set(trek.surface.map((surface) => surface.kind));
  const advice: string[] = [];
  if (kinds.has("rock") || kinds.has("steps")) advice.push("Grippy hiking shoes with a firm sole");
  if (kinds.has("stream") || trek.suitability.includes("monsoon")) advice.push("Quick-dry socks and water-resistant footwear");
  if (kinds.has("snow")) advice.push("Waterproof boots; verify whether microspikes are needed");
  if (kinds.has("meadow") && !kinds.has("rock")) advice.push("Trail runners are adequate in dry conditions");
  return [...new Set(advice.length ? advice : ["Broken-in walking or trail shoes"])];
}

export interface WaterPlan {
  carryLitres: number;
  refillPoints: string[];
  warning: string;
}

export function waterPlan(trek: Trek): WaterPlan {
  const configured = trek.waterReliability?.carryLitres;
  const duration = paceEstimates(trek)[1].hours;
  const carryLitres =
    configured ?? Math.round(Math.max(1, Math.min(4, duration * 0.35)) * 2) / 2;
  const refillPoints = trek.timeline
    .filter((point) => ["water", "stream", "village"].includes(point.type))
    .map((point) => `${point.label} (${point.km} km)`);
  return {
    carryLitres,
    refillPoints,
    warning:
      trek.waterReliability?.status === "year-round"
        ? "Treat natural water before drinking; year-round does not mean potable."
        : "Seasonal sources can fail. Confirm locally and leave with the full amount.",
  };
}

export interface TrailheadLogistics {
  label: string;
  value: string;
  confidence: "Known" | "Estimate" | "Verify";
}

export function trailheadLogistics(trek: Trek): TrailheadLogistics[] {
  const villageStart = trek.timeline.some((point) => point.type === "village");
  return [
    { label: "Trailhead", value: trek.trailhead || "Confirm locally", confidence: trek.trailhead ? "Known" : "Verify" },
    { label: "Parking", value: villageStart ? "Ask locally for designated village parking" : "Roadhead capacity may be limited", confidence: "Verify" },
    { label: "Bus / taxi", value: `Arrange the last mile from ${trek.nearestCity || trek.emergency?.nearestTown || "the nearest town"}`, confidence: "Estimate" },
    { label: "Food & washroom", value: villageStart ? "More likely at the village start; carry backup food" : "Do not rely on trailhead facilities", confidence: "Estimate" },
    { label: "Cash & ATM", value: `Withdraw in ${trek.emergency?.nearestTown || trek.nearestCity || "the nearest major town"}`, confidence: "Estimate" },
    { label: "Clinic & network", value: trek.emergency?.evacNote || "Confirm the nearest clinic and mobile coverage before departure", confidence: "Verify" },
  ];
}

export function landmarkDescription(type: Trek["timeline"][number]["type"]): string {
  const descriptions: Record<Trek["timeline"][number]["type"], string> = {
    trailhead: "Final gear check and route confirmation",
    forest: "Shade, softer ground and reduced visibility",
    waterfall: "Wet rock zone; protect electronics",
    viewpoint: "Primary photo and regrouping point",
    summit: "Main payoff; wind and exposure can rise quickly",
    water: "Potential refill point; treat before drinking",
    rest: "Natural pause and turnaround decision point",
    village: "Food, local information and possible road access",
    lake: "Sensitive shoreline; keep distance and pack waste out",
    meadow: "Open terrain with weather exposure",
    ridge: "Views improve while wind exposure increases",
    pass: "High commitment point; reassess weather",
    camp: "Shelter, water and overnight logistics",
    stream: "Flow changes rapidly after rain",
  };
  return descriptions[type];
}
