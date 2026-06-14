import { NextResponse } from "next/server";
import { z } from "zod";
import { publishRoomEvent } from "@/lib/realtime/bus";
import { getStore } from "@/lib/store";

const AvailabilitySchema = z.object({
  participantId: z.string().min(1),
  displayName: z.string().trim().min(1).max(40).nullable().default(null),
  // ISO yyyy-mm-dd dates the member is unavailable.
  unavailableDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(120),
});

// Save one member's unavailable dates. Mirrors the auth-light pattern of the
// messages route: the participant is keyed by their browser-local pid (waId).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = AvailabilitySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const store = getStore();
  const group = await store.getGroupByWaId(slug);
  if (!group) {
    return NextResponse.json({ error: "Trip room not found." }, { status: 404 });
  }
  const participant = await store.upsertParticipant({
    groupId: group.id,
    waId: parsed.data.participantId,
    displayName: parsed.data.displayName,
  });
  await store.setAvailability({
    groupId: group.id,
    participantId: participant.id,
    unavailableDates: parsed.data.unavailableDates,
  });
  // Nudge every open tab to refetch the room state (picks up the new window).
  publishRoomEvent(group.id, { type: "refresh" });
  return NextResponse.json({ ok: true });
}
