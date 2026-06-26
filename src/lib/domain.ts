import { z } from "zod";

export const interestTags = [
  "adventure",
  "trekking",
  "haunted",
  "cafes",
  "food",
  "nightlife",
  "relaxation",
  "culture",
  "wildlife",
  "photography",
  "beaches",
  "mountains",
  "road-trip",
  "spiritual",
  "caves",
  "camping",
  "rafting",
  "shopping",
] as const;

export const InterestTagSchema = z.enum(interestTags);
export type InterestTag = z.infer<typeof InterestTagSchema>;

export const FactKindSchema = z.enum([
  "origin",
  "destination",
  "exclude_destination",
  "start_date",
  "end_date",
  "duration_days",
  "budget_min",
  "budget_max",
  "group_size",
  "transport",
  "restriction",
]);
export type FactKind = z.infer<typeof FactKindSchema>;

export const ExtractedFactSchema = z.object({
  kind: FactKindSchema,
  value: z.union([z.string(), z.number(), z.array(z.string())]),
  confidence: z.number().min(0).max(1),
  isHard: z.boolean().default(false),
});
export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

export const PreferenceSignalSchema = z.object({
  tag: InterestTagSchema,
  weight: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  directFirstPerson: z.boolean(),
});
export type PreferenceSignal = z.infer<typeof PreferenceSignalSchema>;

export const MessageExtractionSchema = z.object({
  language: z.enum(["en", "hi", "hinglish", "unknown"]),
  isJoke: z.boolean(),
  isForwarded: z.boolean(),
  facts: z.array(ExtractedFactSchema),
  preferences: z.array(PreferenceSignalSchema),
});
export type MessageExtraction = z.infer<typeof MessageExtractionSchema>;

export const MemberPreferenceSchema = z.object({
  participantId: z.string(),
  displayName: z.string(),
  interests: z.array(
    z.object({
      tag: InterestTagSchema,
      weight: z.number(),
      confidence: z.number(),
    }),
  ),
});

export const TripSummarySchema = z.object({
  groupSize: z.number().int().nonnegative(),
  departureCities: z.array(z.string()),
  // Cities travellers explicitly asked to go to — pinned into the plan options.
  requestedDestinations: z.array(z.string()).default([]),
  // Cities travellers ruled out ("goa nahi jaana") — never recommended.
  excludedDestinations: z.array(z.string()).default([]),
  dates: z.object({
    start: z.string().nullable(),
    end: z.string().nullable(),
    durationDays: z.number().int().positive().nullable(),
  }),
  budget: z.object({
    minInr: z.number().nonnegative().nullable(),
    maxInr: z.number().nonnegative().nullable(),
    basis: z.enum(["per_person", "group", "unknown"]),
  }),
  hardConstraints: z.array(z.string()),
  memberPreferences: z.array(MemberPreferenceSchema),
  uncertainties: z.array(z.string()),
  conflicts: z.array(z.string()),
});
export type TripSummary = z.infer<typeof TripSummarySchema>;

export const TrailDifficultySchema = z.enum(["easy", "moderate", "hard", "expert"]);
export type TrailDifficulty = z.infer<typeof TrailDifficultySchema>;

// Trekking metadata trekkers actually decide on, attached to a "trail" stop.
export const TrailMetaSchema = z.object({
  distanceKm: z.number().positive().nullable().default(null),
  elevationGainM: z.number().nonnegative().nullable().default(null),
  maxAltitudeM: z.number().nonnegative().nullable().default(null),
  difficulty: TrailDifficultySchema.nullable().default(null),
  durationHours: z.number().positive().nullable().default(null),
  trailhead: z.string().nullable().default(null),
  bestMonths: z.array(z.number().int().min(1).max(12)).default([]),
  permitRequired: z.boolean().default(false),
  guideRecommended: z.boolean().default(false),
  routeType: z.enum(["loop", "out-and-back", "point-to-point"]).nullable().default(null),
  routeUrl: z.string().url().nullable().default(null),
  // true when this is a low-traffic / community-recommended offbeat trail.
  hidden: z.boolean().default(false),
});
export type TrailMeta = z.infer<typeof TrailMetaSchema>;

export const ItineraryStopSchema = z.object({
  name: z.string(),
  kind: z
    .enum(["sight", "hidden-gem", "activity", "food", "transport", "stay", "trail"])
    .default("sight"),
  note: z.string().default(""),
  // Per-person estimate for this stop in INR (null when free / already counted).
  approxInr: z.number().nonnegative().nullable().default(null),
  // Verification surfaced from the gem in hand (Google Places etc.) so the plan
  // the group sees looks credible. All optional — null when the source had none.
  rating: z.number().min(0).max(5).nullable().default(null),
  reviewCount: z.number().nonnegative().nullable().default(null),
  reviewSnippet: z.string().nullable().default(null),
  mapsUrl: z.string().url().nullable().default(null),
  // The signature dish to order at a food stop (Part B), e.g. "galouti kebab".
  mustTry: z.string().nullable().default(null),
  // Trekking metadata when kind === "trail" (Part C). Null for non-trail stops.
  trail: TrailMetaSchema.nullable().default(null),
  // V1.2 storyboard fields (all optional). `time` is a clock label ("8:00 AM");
  // `description` is the richer 2–3 line "why it's worth it" (the LLM fills it,
  // else falls back to `note`). Crowd intelligence is a labeled estimate.
  time: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  bestTime: z.string().nullable().default(null),
  crowdLevel: z.enum(["low", "medium", "high"]).nullable().default(null),
  photoScore: z.number().int().min(1).max(5).nullable().default(null),
});
export type ItineraryStop = z.infer<typeof ItineraryStopSchema>;

export const ItineraryStaySchema = z.object({
  name: z.string(),
  area: z.string().default(""),
  approxInrPerNight: z.number().nonnegative().nullable().default(null),
});

// A small "highlight reel" per day (#9 Group Moments).
export const GroupMomentsSchema = z.object({
  photoSpot: z.string().nullable().default(null),
  sunset: z.string().nullable().default(null),
  dish: z.string().nullable().default(null),
  cafe: z.string().nullable().default(null),
  experience: z.string().nullable().default(null),
});

export const ItineraryDaySchema = z.object({
  day: z.number().int().positive(),
  title: z.string(),
  stops: z.array(ItineraryStopSchema).min(1),
  stay: ItineraryStaySchema.nullable().default(null),
  // V1.2: each day gets a personality (#1) and an optional narrative (#14).
  theme: z.string().default(""),
  goal: z.string().default(""),
  narrative: z.string().default(""),
  moments: GroupMomentsSchema.default({
    photoSpot: null,
    sunset: null,
    dish: null,
    cafe: null,
    experience: null,
  }),
});
export type ItineraryDay = z.infer<typeof ItineraryDaySchema>;

export const CostBreakdownSchema = z.object({
  transportInr: z.number().nonnegative(),
  stayInr: z.number().nonnegative(),
  activitiesInr: z.number().nonnegative(),
  foodInr: z.number().nonnegative(),
});

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  retrievedAt: z.string(),
  sourceType: z.enum(["curated", "search", "reddit", "supplier"]),
});

export const CostEstimateSchema = z.object({
  lowInr: z.number().nonnegative(),
  likelyInr: z.number().nonnegative(),
  highInr: z.number().nonnegative(),
  live: z.boolean(),
  quotedAt: z.string(),
  expiresAt: z.string().nullable(),
  assumptions: z.array(z.string()),
  deepLinks: z.array(z.string().url()),
  breakdown: CostBreakdownSchema.nullable().default(null),
  // Per-meal split of the daily food spend (#10), a labeled estimate.
  foodBreakdown: z
    .object({
      breakfastInr: z.number().nonnegative(),
      lunchInr: z.number().nonnegative(),
      dinnerInr: z.number().nonnegative(),
      snacksInr: z.number().nonnegative(),
      dailyTotalInr: z.number().nonnegative(),
    })
    .nullable()
    .default(null),
});

// A synthesized, clearly-labeled door-to-door transport plan (#6).
export const TransportLegSchema = z.object({
  mode: z.string(),
  from: z.string(),
  to: z.string(),
  hours: z.number().nonnegative().nullable().default(null),
  inr: z.number().nonnegative().nullable().default(null),
});
export const TransportPlanSchema = z.object({
  legs: z.array(TransportLegSchema),
  totalHours: z.number().nonnegative().nullable().default(null),
  perPersonInr: z.number().nonnegative().nullable().default(null),
});

export const GeneratedPlanSchema = z.object({
  optionNumber: z.number().int().min(1).max(3),
  title: z.string(),
  destinationSlug: z.string(),
  destinationName: z.string(),
  // State/region the destination sits in ("Himachal Pradesh"); "" for ad-hoc
  // cities and already-stored plans generated before this field existed.
  destinationState: z.string().default(""),
  angle: z.enum(["balanced", "adventurous", "relaxed"]),
  // 0-100 weighted match score + a one-line reason it was recommended.
  matchScore: z.number().int().min(0).max(100).default(0),
  whyRecommended: z.string().default(""),
  summary: z.string(),
  preferenceCoverage: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  itinerary: z.array(ItineraryDaySchema),
  sources: z.array(SourceSchema),
  cost: CostEstimateSchema,
  // Four reference images: hero, a popular sight, a hidden gem, food/culture.
  destinationImages: z
    .array(
      z.object({
        type: z.enum(["hero", "popular", "hidden_gem", "culture"]),
        url: z.string().url(),
      }),
    )
    .default([]),
  // ── V1.2 storyboard (all defaulted for back-compat) ──
  // Ticked reasons this destination was picked (#4) + how many were considered.
  whyReasons: z.array(z.string()).default([]),
  destinationsAnalysed: z.number().int().nonnegative().default(0),
  // The "AI thinking" paragraph (#19): why this over the alternatives.
  reasoning: z.string().default(""),
  // Who the trip suits — and doesn't (#16).
  perfectFor: z.array(z.string()).default([]),
  notIdealFor: z.array(z.string()).default([]),
  // Summary-card vitals (#18).
  difficulty: z.enum(["easy", "moderate", "challenging"]).default("moderate"),
  pace: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
  travelHours: z.number().nonnegative().nullable().default(null),
  // Per-dimension 1–5 ratings for the comparison stars (#17).
  dimensions: z
    .object({
      adventure: z.number().int().min(0).max(5),
      relaxation: z.number().int().min(0).max(5),
      culture: z.number().int().min(0).max(5),
      crowd: z.number().int().min(0).max(5),
    })
    .nullable()
    .default(null),
  transport: TransportPlanSchema.nullable().default(null),
});
export type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>;

export interface NormalizedInboundMessage {
  eventKey: string;
  messageId: string;
  groupWaId: string;
  participantWaId: string;
  profileName: string | null;
  type: "text" | "image" | "audio" | "video" | "document" | "unknown";
  text: string | null;
  mediaId: string | null;
  timestamp: string;
  raw: Record<string, unknown>;
}

export interface ParticipantChange {
  eventKey: string;
  groupWaId: string;
  action: "joined" | "left";
  participantWaIds: string[];
  timestamp: string;
  raw: Record<string, unknown>;
}

export type NormalizedWhatsAppEvent =
  | { kind: "message"; message: NormalizedInboundMessage }
  | { kind: "participants"; change: ParticipantChange };
