import { NextResponse } from "next/server";
import { getTrek } from "@/lib/trek/store";

export const dynamic = "force-dynamic";

// GET /api/treks/[slug] -> a single full Trek record (seed or Supabase).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const trek = await getTrek(slug);
  if (!trek) {
    return NextResponse.json({ error: "Trek not found." }, { status: 404 });
  }
  return NextResponse.json({ trek });
}
