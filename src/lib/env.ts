import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  LLM_API_URL: optionalUrl,
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  // Safety caps to stay under the Gemini free-tier rate limits (so billing
  // doesn't kick in). Defaults sit just below the 2.0-flash free tier.
  LLM_MAX_RPM: z.coerce.number().int().positive().optional(),
  LLM_MAX_RPD: z.coerce.number().int().positive().optional(),
  // Per-message LLM extraction is high-frequency; off by default to reserve the
  // LLM budget for plan generation. Set to "true" to enable.
  LLM_EXTRACT_MESSAGES: z.string().optional(),
  SEARCH_API_URL: optionalUrl,
  SEARCH_API_KEY: z.string().optional(),
  // "Places to visit" gem recommender sources (all optional).
  GOOGLE_PLACES_KEY: z.string().optional(),
  // Standalone Playwright scraper service (see /scraper) for the Reddit source.
  REDDIT_SCRAPER_URL: optionalUrl,
  SCRAPER_TOKEN: z.string().optional(),
  AMADEUS_CLIENT_ID: z.string().optional(),
  AMADEUS_CLIENT_SECRET: z.string().optional(),
  BOOKING_API_URL: optionalUrl,
  BOOKING_API_KEY: z.string().optional(),
  // RapidAPI "Booking.com" (apidojo) for live stay prices. Host is overridable
  // for testing against a local mock.
  RAPIDAPI_KEY: z.string().optional(),
  RAPIDAPI_BOOKING_HOST: z.string().default("booking-com.p.rapidapi.com"),
  VIATOR_API_URL: optionalUrl,
  VIATOR_API_KEY: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const hasSupabase = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
);
