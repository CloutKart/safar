import { NextResponse } from "next/server";
import { z } from "zod";
import { recommendTreks } from "@/lib/trek/recommend";

export const dynamic = "force-dynamic";
// Embeddings recall + LLM intent parse can each take a moment; allow headroom.
export const maxDuration = 30;

const Schema = z.object({ query: z.string().trim().min(2).max(200) });

// POST /api/treks/search { query } -> ranked treks with a "why", proximity, and
// nearby alternatives. Works with no LLM/embeddings via the deterministic path.
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A search query is required." }, { status: 400 });
  }
  const result = await recommendTreks(parsed.data.query);
  return NextResponse.json(result);
}
