import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverCandidates } from "@/lib/trek/discovery";

export const dynamic = "force-dynamic";
// Live Overpass/OSM + Reddit aggregation can take a moment.
export const maxDuration = 30;

const Schema = z.object({ near: z.string().trim().min(2).max(80) });

// POST /api/treks/discover { near } -> unverified offbeat-trail candidates from
// live sources (OSM/Reddit) that aren't already in the curated seed.
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A place to search near is required." }, { status: 400 });
  }
  const result = await discoverCandidates(parsed.data.near);
  return NextResponse.json(result);
}
