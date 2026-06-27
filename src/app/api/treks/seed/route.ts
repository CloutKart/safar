import { NextResponse } from "next/server";
import { generateEmbedding } from "@/lib/ai/client";
import { env, hasSupabase } from "@/lib/env";
import { treks } from "@/data/treks";
import { trekEmbeddingText } from "@/lib/trek/schema";
import { upsertTrek } from "@/lib/trek/store";

export const dynamic = "force-dynamic";
// Embeds + upserts ~20 treks; give it room.
export const maxDuration = 60;

// Same guard shape as the cron route: in production, require the CRON_SECRET.
function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

// POST /api/treks/seed — embed every seed trek and upsert it into the Supabase
// `treks` table so pgvector recall (match_treks) goes live. Idempotent: re-run to
// fill any treks that didn't get an embedding (e.g. a transient provider hiccup).
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabase) {
    return NextResponse.json(
      { error: "Supabase is not configured — nothing to seed into." },
      { status: 400 },
    );
  }

  let upserted = 0;
  let embedded = 0;
  const missingEmbedding: string[] = [];
  for (const trek of treks) {
    const embedding = await generateEmbedding(trekEmbeddingText(trek));
    if (embedding) embedded += 1;
    else missingEmbedding.push(trek.slug);
    if (await upsertTrek(trek, embedding)) upserted += 1;
  }

  return NextResponse.json({
    total: treks.length,
    upserted,
    embedded,
    embeddingsConfigured: Boolean(env.LLM_EMBED_URL && env.LLM_EMBED_MODEL),
    missingEmbedding,
  });
}
