import { z } from "zod";
import { env } from "@/lib/env";
import { generateStructured } from "@/lib/ai/client";
import {
  geocodeCity,
  haversineKm,
  lookupCoords,
  type LatLng,
} from "@/lib/cityCoords";
import type { TrailDifficulty, TrailMeta } from "@/lib/domain";
import { gemKey } from "@/lib/research/gems";
import { listTreks } from "@/lib/trek/store";
import type { Trek } from "@/lib/trek/schema";

// Trekking recommender for a destination: aggregates real trails (incl. hidden,
// low-traffic ones) from the Trek Knowledge Graph corpus (the single curated
// source of truth) plus live OpenStreetMap/Overpass and Reddit hiking
// communities, then dedupes, scores, derives difficulty, and reserves slots for
// hidden trails. Live sources are keyless and can fail; the corpus layer
// guarantees trek groups always get real, structured trails.

export type TrailSource = "curated" | "osm" | "reddit";

export interface Trail {
  name: string;
  distanceKm: number | null;
  elevationGainM: number | null;
  maxAltitudeM: number | null;
  difficulty: TrailDifficulty | null;
  durationHours: number | null;
  trailhead: string | null;
  bestMonths: number[];
  permitRequired: boolean;
  guideRecommended: boolean;
  routeType: "loop" | "out-and-back" | "point-to-point" | null;
  routeUrl: string | null;
  crowdLevel: "low" | "medium" | "high" | null;
  blurb: string;
  sources: TrailSource[];
  score: number;
}

const TRAIL_UA = "Safar/1.0 (group trip planner)";

// ── Difficulty + duration heuristics ─────────────────────────────────────────
// Derived from distance + ascent when the source doesn't state a grade. Tuned
// for Indian Himalayan day-to-multiday treks, erring toward caution.
export function deriveDifficulty(
  distanceKm: number | null,
  ascentM: number | null,
  maxAltM: number | null,
): TrailDifficulty | null {
  if (distanceKm == null && ascentM == null && maxAltM == null) return null;
  let points = 0;
  if (distanceKm != null) points += distanceKm >= 18 ? 3 : distanceKm >= 10 ? 2 : distanceKm >= 5 ? 1 : 0;
  if (ascentM != null) points += ascentM >= 1200 ? 3 : ascentM >= 700 ? 2 : ascentM >= 350 ? 1 : 0;
  // High altitude is independently dangerous (AMS), so it can push the grade up.
  if (maxAltM != null) points += maxAltM >= 4500 ? 3 : maxAltM >= 3500 ? 2 : maxAltM >= 2800 ? 1 : 0;
  const graded: TrailDifficulty =
    points >= 7 ? "expert" : points >= 4 ? "hard" : points >= 2 ? "moderate" : "easy";
  // Altitude safety floor: extreme-altitude objectives are never "easy/moderate"
  // regardless of how little distance/ascent data we have (AMS is the real risk).
  if (maxAltM != null && maxAltM >= 4800) return "expert";
  if (maxAltM != null && maxAltM >= 4000 && (graded === "easy" || graded === "moderate"))
    return "hard";
  return graded;
}

// Rough walking time: Naismith-style — ~4 km/h plus 10 min per 100 m of ascent.
function estimateHours(distanceKm: number | null, ascentM: number | null): number | null {
  if (distanceKm == null && ascentM == null) return null;
  const flat = (distanceKm ?? 0) / 4;
  const climb = (ascentM ?? 0) / 100 / 6; // 10 min per 100 m → hours
  const hours = flat + climb;
  return hours > 0 ? Math.round(hours * 10) / 10 : null;
}

function altitudeFlags(maxAltM: number | null): { permit: boolean; guide: boolean } {
  // High-altitude Himalayan treks commonly need forest/ILP permits and a guide;
  // surface a conservative default the planner can show as a tradeoff.
  if (maxAltM != null && maxAltM >= 3500) return { permit: true, guide: true };
  if (maxAltM != null && maxAltM >= 2800) return { permit: false, guide: true };
  return { permit: false, guide: false };
}

// ── Curated backbone: the Trek Knowledge Graph corpus ────────────────────────
// One source of truth — the planner reads the same first-class Trek records that
// power Trek Mode. routeUrl deep-links the itinerary stop straight into the rich
// trek page. crowdLevel is derived from the Trek's DNA so hidden-trail variety
// selection still works.
export function trekToTrail(trek: Trek): Trail {
  const crowdLevel: Trail["crowdLevel"] =
    trek.dna.crowds <= 3 ? "low" : trek.dna.crowds >= 7 ? "high" : "medium";
  return {
    name: trek.name,
    distanceKm: trek.distanceKm,
    elevationGainM: trek.elevationGainM,
    maxAltitudeM: trek.maxAltitudeM,
    difficulty: trek.difficulty,
    durationHours: trek.durationHours ?? estimateHours(trek.distanceKm, trek.elevationGainM),
    trailhead: trek.trailhead || null,
    bestMonths: trek.bestMonths,
    permitRequired: trek.permitRequired,
    guideRecommended: trek.guideRecommended,
    routeType: trek.routeType,
    routeUrl: `/trek/${trek.slug}`,
    crowdLevel,
    blurb: trek.blurb,
    sources: ["curated"],
    score: 0,
  };
}

// Treks for a destination: those explicitly linked via `destinationSlug`, plus
// any whose trailhead sits within ~70 km of the destination (a day's reach from
// that base). Proximity catches the offbeat/standalone treks that carry no slug.
const TREK_NEAR_KM = 70;
async function fromTreks(slug: string, coords: LatLng | null): Promise<Trail[]> {
  const all = await listTreks();
  const chosen = all.filter(
    (t) =>
      (slug !== "" && t.destinationSlug === slug) ||
      (coords != null &&
        t.trailheadCoords != null &&
        haversineKm(coords, t.trailheadCoords) <= TREK_NEAR_KM),
  );
  return chosen.map(trekToTrail);
}

async function resolveCoords(city: string): Promise<LatLng | null> {
  const slug = city
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return lookupCoords(slug) ?? lookupCoords(city) ?? (await geocodeCity(city));
}

// ── OpenStreetMap / Overpass (free, no key) ──────────────────────────────────
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fromOverpass(coords: LatLng): Promise<Trail[]> {
  const [lat, lng] = coords;
  // Named hiking routes within 35 km, plus named peaks within 30 km (a peak is a
  // natural trek objective even when OSM lacks the route relation).
  const query =
    `[out:json][timeout:25];` +
    `(` +
    `relation["route"="hiking"]["name"](around:35000,${lat},${lng});` +
    `way["highway"="path"]["name"]["sac_scale"](around:18000,${lat},${lng});` +
    `node["natural"="peak"]["name"](around:30000,${lat},${lng});` +
    `);out tags center 60;`;
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": TRAIL_UA,
      Accept: "application/json",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!response?.ok) return [];
  const data = (await response.json().catch(() => null)) as
    | { elements?: OverpassElement[] }
    | null;
  if (!data?.elements) return [];

  const byKey = new Map<string, Trail>();
  for (const el of data.elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue;
    const key = gemKey(name);
    if (!key || byKey.has(key)) continue;
    const isPeak = tags.natural === "peak";

    // OSM hiking relations sometimes carry distance/ascent; peaks carry ele.
    const distanceKm = num(tags.distance) ?? num(tags.length);
    const ascentM = num(tags.ascent);
    const peakEle = isPeak ? num(tags.ele) : null;
    // sac_scale T1..T6 is a real difficulty ladder when present.
    const sac = tags.sac_scale;
    const sacDifficulty: TrailDifficulty | null = sac
      ? /t1|hiking/.test(sac)
        ? "easy"
        : /t2|t3|mountain/.test(sac)
          ? "moderate"
          : /t4|t5/.test(sac)
            ? "hard"
            : "expert"
      : null;
    const difficulty =
      sacDifficulty ?? deriveDifficulty(distanceKm, ascentM, peakEle);
    const { permit, guide } = altitudeFlags(peakEle);
    const routeType =
      tags.roundtrip === "yes"
        ? "loop"
        : tags.route === "hiking"
          ? "out-and-back"
          : null;

    byKey.set(key, {
      name: isPeak ? `${name} summit trail` : name,
      distanceKm,
      elevationGainM: ascentM,
      maxAltitudeM: peakEle,
      difficulty,
      durationHours: estimateHours(distanceKm, ascentM),
      trailhead: tags.from ?? null,
      bestMonths: [],
      permitRequired: permit || tags.access === "permit",
      guideRecommended: guide,
      routeType,
      routeUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      crowdLevel: null,
      blurb: isPeak
        ? `Himalayan/hill summit objective${peakEle ? ` (~${peakEle} m)` : ""}`
        : tags.description ?? "Mapped hiking route",
      sources: ["osm"],
      score: 0,
    });
  }
  return [...byKey.values()];
}

// ── Reddit hiking communities (via the standalone scraper + LLM extraction) ──
const TrailExtractSchema = z.object({
  trails: z.array(
    z.object({
      name: z.string(),
      difficulty: z.string().default(""),
      distanceKm: z.number().nullable().default(null),
      maxAltitudeM: z.number().nullable().default(null),
      hidden: z.boolean().default(false),
      blurb: z.string().default(""),
    }),
  ),
});

const TRAIL_SYSTEM = `Extract specific, real trekking trails near the given place that hikers on Reddit recommend — strongly favour lesser-known / offbeat / "hidden" trails over the single famous summit everyone does. Output STRICT JSON: {"trails":[{"name":string,"difficulty":"easy"|"moderate"|"hard"|"expert","distanceKm":number|null,"maxAltitudeM":number|null,"hidden":boolean,"blurb":string}]}. "hidden" is true when redditors call it offbeat/underrated/uncrowded. "blurb" is one short line on why it's worth it / what to expect. Only include named trails clearly near that place. Skip generic advice and anything that isn't a real trail.`;

function normalizeDifficulty(value: string): TrailDifficulty | null {
  const v = value.toLowerCase();
  if (/easy|beginner|t1/.test(v)) return "easy";
  if (/moderate|medium|intermediate/.test(v)) return "moderate";
  if (/expert|extreme|technical|t5|t6/.test(v)) return "expert";
  if (/hard|difficult|strenuous|challeng/.test(v)) return "hard";
  return null;
}

async function fromReddit(city: string): Promise<Trail[]> {
  if (!env.REDDIT_SCRAPER_URL) return [];
  const response = await fetch(`${env.REDDIT_SCRAPER_URL.replace(/\/$/, "")}/reddit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.SCRAPER_TOKEN ? { Authorization: `Bearer ${env.SCRAPER_TOKEN}` } : {}),
    },
    body: JSON.stringify({ city: `${city} trek` }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!response?.ok) return [];
  const data = (await response.json()) as {
    posts?: Array<{ title?: string; selftext?: string; comments?: string[] }>;
  };
  const corpus = (data.posts ?? [])
    .map((post) =>
      [post.title ?? "", (post.selftext ?? "").slice(0, 400), (post.comments ?? []).join("\n")]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n---\n")
    .slice(0, 9000);
  if (!corpus.trim()) return [];
  const extracted = await generateStructured({
    schema: TrailExtractSchema,
    system: TRAIL_SYSTEM,
    user: JSON.stringify({ place: city, redditPosts: corpus }),
  }).catch(() => null);
  if (!extracted) return [];
  return extracted.trails.map((t) => {
    const difficulty =
      normalizeDifficulty(t.difficulty) ?? deriveDifficulty(t.distanceKm, null, t.maxAltitudeM);
    const { permit, guide } = altitudeFlags(t.maxAltitudeM);
    return {
      name: t.name,
      distanceKm: t.distanceKm,
      elevationGainM: null,
      maxAltitudeM: t.maxAltitudeM,
      difficulty,
      durationHours: estimateHours(t.distanceKm, null),
      trailhead: null,
      bestMonths: [],
      permitRequired: permit,
      guideRecommended: guide,
      routeType: null,
      routeUrl: null,
      crowdLevel: t.hidden ? "low" : null,
      blurb: t.blurb,
      sources: ["reddit"] as TrailSource[],
      score: 0,
    } satisfies Trail;
  });
}

// ── Merge + score + hidden detection ─────────────────────────────────────────
function scoreTrail(trail: Trail): number {
  let score = 0;
  if (trail.sources.includes("curated")) score += 34; // vetted, full metadata
  if (trail.sources.includes("osm")) score += 30; // real mapped geometry
  if (trail.sources.includes("reddit")) score += 26; // community-vouched
  if (trail.sources.length > 1) score += 24; // cross-source agreement
  if (trail.difficulty) score += 6; // graded → more decision-useful
  if (trail.distanceKm != null) score += 4;
  if (trail.blurb) score += 4;
  return Math.round(score);
}

// A hidden trail is community-flagged offbeat, or a real mapped route that the
// crowd-sourced communities haven't turned into a headline (low crowd / Reddit
// "underrated"). Not the one marquee summit everyone already knows.
export function isHiddenTrail(trail: Trail): boolean {
  if (trail.crowdLevel === "low") return true;
  if (trail.crowdLevel === "high") return false;
  // OSM-only routes with a difficulty but no marquee status read as offbeat.
  return trail.sources.includes("osm") && !trail.sources.includes("reddit");
}

function mergeTrails(lists: Trail[][]): Trail[] {
  const byKey = new Map<string, Trail>();
  for (const trail of lists.flat()) {
    const key = gemKey(trail.name).replace(/\bsummit trail\b/, "").trim();
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.sources = [...new Set([...existing.sources, ...trail.sources])];
      existing.distanceKm ??= trail.distanceKm;
      existing.elevationGainM ??= trail.elevationGainM;
      existing.maxAltitudeM ??= trail.maxAltitudeM;
      existing.difficulty ??= trail.difficulty;
      existing.durationHours ??= trail.durationHours;
      existing.trailhead ??= trail.trailhead;
      existing.routeUrl ??= trail.routeUrl;
      existing.blurb = existing.blurb || trail.blurb;
      existing.permitRequired = existing.permitRequired || trail.permitRequired;
      existing.guideRecommended = existing.guideRecommended || trail.guideRecommended;
      existing.crowdLevel ??= trail.crowdLevel;
    } else {
      byKey.set(key, { ...trail });
    }
  }
  const merged = [...byKey.values()];
  for (const trail of merged) trail.score = scoreTrail(trail);
  return merged.sort((a, b) => b.score - a.score);
}

// Reserve ~half the slots for hidden trails so a trek plan blends one marquee
// objective with genuine offbeat finds. Mirrors gems' selectWithVariety.
export function selectTrailsWithVariety(sorted: Trail[], limit: number): Trail[] {
  const chosen = new Set<Trail>();
  const hiddenTarget = Math.ceil(limit / 2);
  for (const trail of sorted.filter(isHiddenTrail)) {
    if (chosen.size >= hiddenTarget) break;
    chosen.add(trail);
  }
  for (const trail of sorted) {
    if (chosen.size >= limit) break;
    chosen.add(trail);
  }
  return [...chosen].sort((a, b) => b.score - a.score).slice(0, limit);
}

const trailCache = new Map<string, { trails: Trail[]; at: number }>();
const TRAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getTrails(
  slug: string,
  name: string,
  knownCoords?: LatLng | null,
  limit = 6,
): Promise<Trail[]> {
  // Keep the test suite hermetic — only the live fetchers reach the network. The
  // corpus layer is pure data, always available (even offline / in tests).
  if (process.env.NODE_ENV === "test") {
    const corpus = await fromTreks(slug, knownCoords ?? null);
    return selectTrailsWithVariety(mergeTrails([corpus]), limit);
  }
  const key = gemKey(name) || slug;
  const cached = trailCache.get(key);
  if (cached && Date.now() - cached.at < TRAIL_TTL_MS)
    return selectTrailsWithVariety(cached.trails, limit);
  // Prefer caller-supplied coords (the catalog slug's exact location) over
  // re-resolving a multi-word display name like "Chopta and Tungnath".
  const coords = knownCoords ?? (await resolveCoords(name).catch(() => null));
  const [corpus, osm, reddit] = await Promise.all([
    fromTreks(slug, coords),
    coords ? fromOverpass(coords).catch(() => []) : Promise.resolve([]),
    fromReddit(name).catch(() => []),
  ]);
  const trails = mergeTrails([corpus, osm, reddit]);
  trailCache.set(key, { trails, at: Date.now() });
  return selectTrailsWithVariety(trails, limit);
}

// ── Group-fit + season helpers (used by the planner) ─────────────────────────
const DIFFICULTY_RANK: Record<TrailDifficulty, number> = {
  easy: 1,
  moderate: 2,
  hard: 3,
  expert: 4,
};

// The hardest difficulty a group should be sent, from their trip angle. A
// "relaxed" group shouldn't get an expert summit; "adventurous" can take more.
export function maxDifficultyFor(
  angle: "balanced" | "adventurous" | "relaxed",
): TrailDifficulty {
  return angle === "adventurous" ? "expert" : angle === "relaxed" ? "moderate" : "hard";
}

export function fitsGroup(
  trail: Trail,
  angle: "balanced" | "adventurous" | "relaxed",
): boolean {
  if (!trail.difficulty) return true; // unknown grade — let it through, note it
  return DIFFICULTY_RANK[trail.difficulty] <= DIFFICULTY_RANK[maxDifficultyFor(angle)];
}

// Season-safety gate: out of the destination's ideal months, snow can close
// passes and AMS risk rises, so an expert-grade or high-altitude (≥3500 m) trail
// is unsafe even for a capable group. In-season (or unknown season) → allowed.
export function trailSeasonSafe(
  trail: Trail,
  idealMonths: number[],
  month: number | null,
): boolean {
  const offSeason = month != null && idealMonths.length > 0 && !idealMonths.includes(month);
  if (!offSeason) return true;
  return trail.difficulty !== "expert" && (trail.maxAltitudeM ?? 0) < 3500;
}

export function toTrailMeta(trail: Trail): TrailMeta {
  return {
    distanceKm: trail.distanceKm,
    elevationGainM: trail.elevationGainM,
    maxAltitudeM: trail.maxAltitudeM,
    difficulty: trail.difficulty,
    durationHours: trail.durationHours,
    trailhead: trail.trailhead,
    bestMonths: trail.bestMonths,
    permitRequired: trail.permitRequired,
    guideRecommended: trail.guideRecommended,
    routeType: trail.routeType,
    routeUrl: trail.routeUrl,
    hidden: isHiddenTrail(trail),
  };
}

// Distance from a set of departure cities to a destination — the real travel
// burden for THIS group, for grounding access cost. Returns null when no coords.
export function travelBurdenKm(
  departureCities: string[],
  destinationSlug: string,
  destinationName: string,
): number | null {
  const dest = lookupCoords(destinationSlug) ?? lookupCoords(destinationName);
  if (!dest) return null;
  const origins = departureCities
    .map((city) => lookupCoords(city))
    .filter((c): c is LatLng => c != null);
  if (origins.length === 0) return null;
  // Average burden across origins (multi-origin groups: some fly DEL, some BLR).
  const total = origins.reduce((sum, origin) => sum + haversineKm(origin, dest), 0);
  return Math.round(total / origins.length);
}
