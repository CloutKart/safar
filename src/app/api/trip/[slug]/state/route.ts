import { NextResponse } from "next/server";
import { loadRoomState } from "@/lib/trip/room";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const state = await loadRoomState(slug);
  if (!state) {
    return NextResponse.json({ error: "Trip room not found." }, { status: 404 });
  }
  return NextResponse.json(state);
}
