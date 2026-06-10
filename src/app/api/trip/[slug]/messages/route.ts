import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { processNormalizedEvent } from "@/lib/conversation/engine";
import { publishRoomEvent } from "@/lib/realtime/bus";
import { getStore } from "@/lib/store";

const MessageSchema = z.object({
  participantId: z.string().min(1),
  displayName: z.string().trim().min(1).max(40).nullable().default(null),
  text: z.string().trim().min(1).max(4000),
});

// The real inbound entry point (promoted from the dev-only simulate route).
// It wraps a chat-box submission as a NormalizedInboundMessage and runs the
// transport-agnostic engine, exactly as the WhatsApp webhook used to.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = MessageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const store = getStore();
  const group = await store.getGroupByWaId(slug);
  if (!group) {
    return NextResponse.json({ error: "Trip room not found." }, { status: 404 });
  }

  const messageId = randomUUID();
  const occurredAt = new Date().toISOString();

  // Ensure the participant row exists (so the engine and getThread can resolve
  // the display name); the thread speaks in browser-local participant ids.
  const participant = await store.upsertParticipant({
    groupId: group.id,
    waId: parsed.data.participantId,
    displayName: parsed.data.displayName,
  });

  // Push the sender's own message to every other open tab immediately...
  publishRoomEvent(group.id, {
    type: "message",
    message: {
      id: messageId,
      participantId: parsed.data.participantId,
      displayName: participant.displayName,
      text: parsed.data.text,
      occurredAt,
      reactions: [],
    },
  });

  // ...then run the engine, which persists it and may emit bot replies (each
  // broadcast via sendWeb). The wa_message_id matches the broadcast id above,
  // so a refetch reconciles to the same message with no duplicate.
  await processNormalizedEvent(
    {
      kind: "message",
      message: {
        eventKey: messageId,
        messageId,
        groupWaId: slug,
        participantWaId: parsed.data.participantId,
        profileName: parsed.data.displayName,
        type: "text",
        text: parsed.data.text,
        mediaId: null,
        timestamp: occurredAt,
        raw: {},
      },
    },
    store,
  );

  return NextResponse.json({ ok: true, messageId });
}
