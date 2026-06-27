import { z } from "zod";
import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Crowdsourced trail-condition reports — real, user-submitted, and auto-expiring
// after 72h so what's shown is always recent. Production uses Supabase; dev (and
// prod-before-table) falls back to an in-memory ring per process. No fabricated
// data; reports are condition-focused (no emergency phone numbers).

export const TRAIL_STATUS = ["clear", "muddy", "snow", "blocked", "washed-out"] as const;
export const WATER_STATUS = ["flowing", "low", "dry", "unknown"] as const;

export const TrekReportInputSchema = z.object({
  name: z.string().trim().max(40).optional(),
  trailStatus: z.enum(TRAIL_STATUS),
  waterStatus: z.enum(WATER_STATUS).default("unknown"),
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().max(280).default(""),
});
export type TrekReportInput = z.infer<typeof TrekReportInputSchema>;

export interface TrekReport extends TrekReportInput {
  id: string;
  trekSlug: string;
  createdAt: string;
}

const TTL_MS = 72 * 60 * 60 * 1000;

// Survive HMR in dev by hanging the buffer off globalThis.
const g = globalThis as typeof globalThis & { __safarTrekReports?: TrekReport[] };
const mem = (): TrekReport[] => (g.__safarTrekReports ??= []);

function mapRow(row: Record<string, unknown>): TrekReport {
  return {
    id: String(row.id),
    trekSlug: String(row.trek_slug),
    name: (row.reporter_name as string) ?? undefined,
    trailStatus: row.trail_status as TrekReport["trailStatus"],
    waterStatus: row.water_status as TrekReport["waterStatus"],
    rating: Number(row.rating),
    note: (row.note as string) ?? "",
    createdAt: String(row.created_at),
  };
}

export async function addTrekReport(slug: string, input: TrekReportInput): Promise<TrekReport> {
  const now = new Date();
  const report: TrekReport = {
    ...input,
    id: crypto.randomUUID(),
    trekSlug: slug.toLowerCase(),
    createdAt: now.toISOString(),
  };
  if (hasSupabase) {
    try {
      await getSupabaseAdmin().from("trek_reports").insert({
        trek_slug: report.trekSlug,
        reporter_name: input.name ?? null,
        trail_status: input.trailStatus,
        water_status: input.waterStatus,
        rating: input.rating,
        note: input.note,
        expires_at: new Date(now.getTime() + TTL_MS).toISOString(),
      });
      return report;
    } catch {
      // fall through to memory
    }
  }
  mem().push(report);
  return report;
}

export async function getTrekReports(slug: string): Promise<TrekReport[]> {
  const key = slug.toLowerCase();
  if (hasSupabase) {
    try {
      const { data, error } = await getSupabaseAdmin()
        .from("trek_reports")
        .select("*")
        .eq("trek_slug", key)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data) return data.map((r) => mapRow(r as Record<string, unknown>));
    } catch {
      // fall through to memory
    }
  }
  const cutoff = Date.now() - TTL_MS;
  return mem()
    .filter((r) => r.trekSlug === key && Date.parse(r.createdAt) >= cutoff)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// A freshness/condition-confidence derived from report recency + volume.
export interface ConditionConfidence {
  level: "fresh" | "recent" | "stale" | "none";
  label: string;
  count: number;
}

export function conditionConfidence(reports: TrekReport[]): ConditionConfidence {
  const count = reports.length;
  if (count === 0) return { level: "none", label: "No recent reports — curated baseline", count: 0 };
  const hours = (Date.now() - Date.parse(reports[0].createdAt)) / 3_600_000;
  const plural = count > 1 ? "s" : "";
  if (hours <= 24) return { level: "fresh", label: `Verified by ${count} trekker${plural} in the last day`, count };
  if (hours <= 72) return { level: "recent", label: `${count} report${plural} in the last 3 days`, count };
  return { level: "stale", label: "Reports are a few days old", count };
}
