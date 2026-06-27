import { z } from "zod";
import { TrailDifficultySchema } from "@/lib/domain";

// ── Trek Intelligence Engine: the Trek Knowledge Graph schema ────────────────
// A trek is a FIRST-CLASS entity (its own page + search), unlike the lightweight
// `TrailMeta` injected into trip itineraries. It supersets the logistics trekkers
// decide on with the "Trek DNA" — a 12-dimension experience vector — plus the
// rich page data (km-by-km timeline, difficulty profile, hidden moments, crowd
// pattern, scenic density, completion confidence). Every authored value is a
// CURATED, COMMUNITY-INFORMED ESTIMATE, not survey-grade — verify locally. New
// fields are defaulted/nullable so stored records stay forward-compatible.

// The 12 DNA dimensions, in a FIXED order so the vector is stable for similarity.
// All 0–10. `crowds` = how busy (higher = busier); a "no crowds" wish targets a
// LOW value. `difficulty` mirrors the grade as a number so it joins the vector.
export const TREK_DNA_DIMS = [
  "adventure",
  "views",
  "crowds",
  "forest",
  "waterfalls",
  "snow",
  "photography",
  "camping",
  "difficulty",
  "family",
  "hidden",
  "food",
] as const;
export type TrekDnaDim = (typeof TREK_DNA_DIMS)[number];

const dnaScore = z.number().min(0).max(10);
export const TrekDnaSchema = z.object(
  Object.fromEntries(TREK_DNA_DIMS.map((d) => [d, dnaScore])) as Record<
    TrekDnaDim,
    typeof dnaScore
  >,
);
export type TrekDna = z.infer<typeof TrekDnaSchema>;

// A trek carries the full 12-dim DNA; a query *intent* expresses only some dims,
// so its DNA is a partial (all-optional) version of the same shape.
export const TrekDnaPartialSchema = z.object(
  Object.fromEntries(TREK_DNA_DIMS.map((d) => [d, dnaScore.optional()])) as Record<
    TrekDnaDim,
    ReturnType<typeof dnaScore.optional>
  >,
);

// The suitability tags users search on ("dog friendly", "first trek", "kids").
export const SUITABILITY_TAGS = [
  "first-trek",
  "kids",
  "dog",
  "solo",
  "couples",
  "photography",
  "birdwatching",
  "camping",
  "monsoon",
  "winter-snow",
] as const;
export type SuitabilityTag = (typeof SUITABILITY_TAGS)[number];

// A segment of the trail-progress difficulty graph (#1) — where it gets hard.
const DifficultySegmentSchema = z.object({
  kmFrom: z.number().nonnegative(),
  kmTo: z.number().nonnegative(),
  grade: z.enum(["flat", "gentle", "moderate", "steep", "scramble"]),
  note: z.string().default(""),
});

// A km-by-km waypoint on the journey (Pillar 4 timeline + hidden checkpoints).
const WaypointSchema = z.object({
  km: z.number().nonnegative(),
  label: z.string(),
  type: z.enum([
    "trailhead",
    "forest",
    "waterfall",
    "viewpoint",
    "summit",
    "water",
    "rest",
    "village",
    "lake",
    "meadow",
    "ridge",
    "pass",
    "camp",
    "stream",
  ]),
});

// A Safar-soul "hidden moment" — evocative, curated, never fabricated specifics.
const HiddenMomentSchema = z.object({
  km: z.number().nonnegative().nullable().default(null),
  text: z.string(),
});

const TrekDifficultyVizSchema = z.object({
  energy: z.number().int().min(1).max(5),
  steepness: z.number().int().min(1).max(5),
  exposure: z.number().int().min(1).max(5),
  technical: z.number().int().min(1).max(5),
});

export const TrekSchema = z.object({
  // ── Identity & logistics (superset of TrailMeta) ──
  slug: z.string(),
  name: z.string(),
  state: z.string(),
  region: z.string().default(""),
  // The catalog destination this trek sits under (links back to destinations.ts
  // for stays / nearby activities); "" when standalone.
  destinationSlug: z.string().default(""),
  nearestCity: z.string().default(""),
  // Trailhead coordinates [lat, lng] — drives proximity, weather, sun timing.
  trailheadCoords: z.tuple([z.number(), z.number()]).nullable().default(null),
  trailhead: z.string().default(""),
  distanceKm: z.number().positive().nullable().default(null),
  elevationGainM: z.number().nonnegative().nullable().default(null),
  maxAltitudeM: z.number().nonnegative().nullable().default(null),
  difficulty: TrailDifficultySchema,
  durationHours: z.number().positive().nullable().default(null),
  routeType: z.enum(["loop", "out-and-back", "point-to-point"]).nullable().default(null),
  permitRequired: z.boolean().default(false),
  guideRecommended: z.boolean().default(false),
  bestMonths: z.array(z.number().int().min(1).max(12)).default([]),
  // ── Storytelling (the Safar voice) ──
  blurb: z.string().default(""),
  description: z.string().default(""),
  // ── Trek DNA + rich page data ──
  dna: TrekDnaSchema,
  difficultyViz: TrekDifficultyVizSchema.nullable().default(null),
  difficultyProfile: z.array(DifficultySegmentSchema).default([]),
  timeline: z.array(WaypointSchema).default([]),
  hiddenMoments: z.array(HiddenMomentSchema).default([]),
  waterReliability: z
    .object({
      status: z.enum(["year-round", "seasonal", "none-after-km", "none"]),
      afterKm: z.number().nonnegative().nullable().default(null),
      carryLitres: z.number().positive().nullable().default(null),
    })
    .nullable()
    .default(null),
  surface: z
    .array(
      z.object({
        kind: z.enum(["forest", "steps", "rock", "meadow", "stream", "road", "snow"]),
        pct: z.number().int().min(0).max(100),
      }),
    )
    .default([]),
  crowdPattern: z
    .object({
      busiest: z.array(z.string()).default([]),
      quietWindow: z.string().default(""),
    })
    .nullable()
    .default(null),
  scenicDensity: z
    .object({
      forest: z.number().min(0).max(10),
      ridge: z.number().min(0).max(10),
      waterfalls: z.number().min(0).max(10),
      wildlife: z.number().min(0).max(10),
      summitPayoff: z.number().min(0).max(10),
      composite: z.number().min(0).max(10),
    })
    .nullable()
    .default(null),
  completionConfidence: z
    .object({
      beginnerPct: z.number().int().min(0).max(100),
      intermediatePct: z.number().int().min(0).max(100),
      experiencedPct: z.number().int().min(0).max(100),
    })
    .nullable()
    .default(null),
  suitability: z.array(z.enum(SUITABILITY_TAGS)).default([]),
  // Safety: NO invented contacts. Just the nearest town + a verify-locally note.
  // Real emergency numbers / helplines are a later, verified-data phase.
  emergency: z
    .object({
      nearestTown: z.string().default(""),
      evacNote: z.string().default(""),
      verifyLocally: z.literal(true).default(true),
    })
    .nullable()
    .default(null),
  // Production semantic-recall vector (pgvector). Null in dev / fallback path.
  embedding: z.array(z.number()).nullable().default(null),
});
export type Trek = z.infer<typeof TrekSchema>;

// ── Query intent (parsed from natural language) ──────────────────────────────
// The structured shape the recommender re-ranks on. `dna` holds only the
// dimensions the user actually expressed (partial target, 0–10). Produced by the
// LLM parser OR the deterministic keyword fallback.
export const TrekIntentSchema = z.object({
  dna: TrekDnaPartialSchema.default({}),
  nearCity: z.string().nullable().default(null),
  month: z.number().int().min(1).max(12).nullable().default(null),
  maxDifficulty: TrailDifficultySchema.nullable().default(null),
  suitability: z.array(z.enum(SUITABILITY_TAGS)).default([]),
  // The query implies a short/weekend window → tighten the proximity radius.
  weekend: z.boolean().default(false),
});
export type TrekIntent = z.infer<typeof TrekIntentSchema>;

// Trek's DNA as the fixed-order numeric vector (for similarity / embeddings text).
export function dnaVector(dna: TrekDna): number[] {
  return TREK_DNA_DIMS.map((d) => dna[d]);
}
