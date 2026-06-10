import { randomUUID } from "node:crypto";
import { publishRoomEvent } from "@/lib/realtime/bus";

// Web replacement for whatsapp.sendText. It mints a public message id and
// pushes the bot reply to every open tab over the room bus. Persistence stays
// where it already was: the caller's store.logOutboundMessage writes the same
// id (as wa_message_id) into the unified messages thread. Returning the id +
// occurredAt lets the caller persist with values identical to what was
// broadcast, so a later getThread reconciles cleanly (same id, same time).
export async function sendWeb(
  groupId: string,
  text: string,
  occurredAt: string,
): Promise<string> {
  const messageId = randomUUID();
  publishRoomEvent(groupId, {
    type: "message",
    message: {
      id: messageId,
      participantId: null,
      displayName: null,
      text,
      occurredAt,
      reactions: [],
    },
  });
  return messageId;
}
