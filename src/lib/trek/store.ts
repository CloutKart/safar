import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TrekSchema, type Trek } from "@/lib/trek/schema";
import { treks as seedTreks, getSeedTrek } from "@/data/treks";

// Trek persistence — a thin, trek-specific store (kept out of the group-centric
// SafarStore). Production reads the Supabase `treks` table + `match_treks` RPC;
// dev (and prod-before-seed) falls back to the in-repo seed corpus, so the
// explorer always works even with Supabase off and the LLM rate-limited.

function parseRow(row: { data: unknown }): Trek | null {
  const parsed = TrekSchema.safeParse(row.data);
  return parsed.success ? parsed.data : null;
}

export async function getTrek(slug: string): Promise<Trek | null> {
  const key = slug.toLowerCase();
  if (hasSupabase) {
    try {
      const { data, error } = await getSupabaseAdmin()
        .from("treks")
        .select("data")
        .eq("slug", key)
        .maybeSingle();
      if (!error && data) return parseRow(data as { data: unknown });
    } catch {
      // fall through to the seed
    }
  }
  return getSeedTrek(key);
}

export async function listTreks(): Promise<Trek[]> {
  if (hasSupabase) {
    try {
      const { data, error } = await getSupabaseAdmin().from("treks").select("data");
      if (!error && data && data.length > 0) {
        const parsed = data
          .map((row) => parseRow(row as { data: unknown }))
          .filter((t): t is Trek => t != null);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // fall through to the seed
    }
  }
  return seedTreks;
}

// Upsert a trek (+ its embedding) into the Supabase table. The embedding lives in
// the pgvector column; the jsonb payload stores the trek with embedding nulled out
// to avoid duplicating the vector. Returns false when Supabase isn't configured.
export async function upsertTrek(trek: Trek, embedding: number[] | null): Promise<boolean> {
  if (!hasSupabase) return false;
  try {
    const { error } = await getSupabaseAdmin().from("treks").upsert(
      {
        slug: trek.slug,
        name: trek.name,
        state: trek.state,
        data: { ...trek, embedding: null },
        embedding,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );
    return !error;
  } catch {
    return false;
  }
}

// Semantic recall via pgvector. Returns null when unavailable (no Supabase, no
// embedding, or the table isn't seeded) so the caller uses deterministic recall.
export async function matchTreks(
  embedding: number[] | null,
  limit = 12,
): Promise<Trek[] | null> {
  if (!hasSupabase || !embedding) return null;
  try {
    const { data, error } = await getSupabaseAdmin().rpc("match_treks", {
      query_embedding: embedding,
      match_count: limit,
    });
    if (error || !data || data.length === 0) return null;
    const parsed = (data as Array<{ data: unknown }>)
      .map((row) => parseRow(row))
      .filter((t): t is Trek => t != null);
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}
