import { NextResponse } from "next/server";
import { z } from "zod";
import { getGems } from "@/lib/research/gems";

export const dynamic = "force-dynamic";
// Aggregates Google Places + Atlas + the Reddit scraper (+ LLM extraction).
export const maxDuration = 60;

const Schema = z.object({ city: z.string().trim().min(2).max(80) });

// POST /api/gems { city } -> scored, deduped, typed "places to visit" for a city.
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A city is required." }, { status: 400 });
  }
  const gems = await getGems(parsed.data.city);
  return NextResponse.json({ city: parsed.data.city, count: gems.length, gems });
}
