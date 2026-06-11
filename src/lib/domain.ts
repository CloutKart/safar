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
] as const;

export const InterestTagSchema = z.enum(interestTags);
export type InterestTag = z.infer<typeof InterestTagSchema>;

export const FactKindSchema = z.enum([
  "origin",
  "destination",
  "start_date",
  "end_date",
  "duration_days",
  "budget_min",
  "budget_max",
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

export const ItineraryStopSchema = z.object({
  name: z.string(),
  kind: z
    .enum(["sight", "hidden-gem", "activity", "food", "transport", "stay"])
    .default("sight"),
  note: z.string().default(""),
  // Per-person estimate for this stop in INR (null when free / already counted).
  approxInr: z.number().nonnegative().nullable().default(null),
});
export type ItineraryStop = z.infer<typeof ItineraryStopSchema>;

export const ItineraryStaySchema = z.object({
  name: z.string(),
  area: z.string().default(""),
  approxInrPerNight: z.number().nonnegative().nullable().default(null),
});

export const ItineraryDaySchema = z.object({
  day: z.number().int().positive(),
  title: z.string(),
  stops: z.array(ItineraryStopSchema).min(1),
  stay: ItineraryStaySchema.nullable().default(null),
});

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
});

export const GeneratedPlanSchema = z.object({
  optionNumber: z.number().int().min(1).max(3),
  title: z.string(),
  destinationSlug: z.string(),
  destinationName: z.string(),
  angle: z.enum(["balanced", "adventurous", "relaxed"]),
  summary: z.string(),
  preferenceCoverage: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  itinerary: z.array(ItineraryDaySchema),
  sources: z.array(SourceSchema),
  cost: CostEstimateSchema,
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
