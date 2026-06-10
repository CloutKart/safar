import { NextResponse } from "next/server";
import { z } from "zod";
import { publishRoomEvent } from "@/lib/realtime/bus";
import { getStore } from "@/lib/store";

const ReactionSchema = z.object({
  participantId: z.string().min(1),
  displayName: z.string().trim().min(1).max(40).nullable().default(null),
  messageId: z.string().min(1),
  emoji: z.string().trim().min(1).max(8),
});

// Toggle an emoji reaction on a message. Reactions are a web-only chat feature
// and deliberately bypass the conversation engine — the bot never sees them.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = ReactionSchema.safeParse(await request.json());
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
  const reactions = await store.toggleReaction({
    groupId: group.id,
    messageId: parsed.data.messageId,
    participantId: participant.id,
    emoji: parsed.data.emoji,
  });
  publishRoomEvent(group.id, {
    type: "reaction",
    messageId: parsed.data.messageId,
    reactions,
  });
  return NextResponse.json({ ok: true, reactions });
}
