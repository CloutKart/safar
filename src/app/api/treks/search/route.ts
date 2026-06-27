import { NextResponse } from "next/server";
import { z } from "zod";
import { recommendTreks } from "@/lib/trek/recommend";
import { TrekFiltersSchema } from "@/lib/trek/schema";

export const dynamic = "force-dynamic";
// Embeddings recall + LLM intent parse can each take a moment; allow headroom.
export const maxDuration = 30;

const Schema = z
  .object({
    query: z.string().trim().max(200).optional(),
    filters: TrekFiltersSchema.optional(),
  })
  .refine((d) => (d.query && d.query.length >= 2) || d.filters, {
    message: "Provide a search query or some filters.",
  });

// POST /api/treks/search { query?, filters? } -> ranked treks with a "why",
// proximity, and nearby alternatives. Works with no LLM/embeddings (deterministic
// keyword + filter path), and with filters only (no NL text).
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A search query or filters are required." }, { status: 400 });
  }
  const result = await recommendTreks({ query: parsed.data.query, filters: parsed.data.filters });
  return NextResponse.json(result);
}
