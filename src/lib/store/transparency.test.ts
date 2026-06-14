import { beforeEach, describe, expect, it } from "vitest";
import { processNormalizedEvent } from "@/lib/conversation/engine";
import { MemorySafarStore } from "@/lib/store/memory";

function join(store: MemorySafarStore) {
  return processNormalizedEvent(
    {
      kind: "participants",
      change: {
        eventKey: "join-1",
        groupWaId: "group-demo",
        action: "joined",
        participantWaIds: ["wa-asha"],
        timestamp: new Date().toISOString(),
        raw: {},
      },
    },
    store,
  );
}

function message(id: string, text: string) {
  return {
    kind: "message" as const,
    message: {
      eventKey: id,
      messageId: id,
      groupWaId: "group-demo",
      participantWaId: "wa-asha",
      profileName: "Asha",
      type: "text" as const,
      text,
      mediaId: null,
      timestamp: new Date().toISOString(),
      raw: {},
    },
  };
}

describe("transparency store reads", () => {
  let store: MemorySafarStore;

  beforeEach(async () => {
    store = new MemorySafarStore();
    await join(store);
  });

  it("reconstructs per-message 'heard' signals keyed by wa_message_id", async () => {
    await processNormalizedEvent(
      message("m1", "From Delhi, I love cafe hopping, budget 15k max"),
      store,
    );
    const group = await store.getGroupByWaId("group-demo");
    const heard = await store.getHeard(group!.id);
    const m1 = heard.get("m1");
    expect(m1).toBeDefined();
    expect(m1!.interests).toContain("cafes");
    expect(m1!.facts.map((f) => f.kind)).toEqual(
      expect.arrayContaining(["origin", "budget_max"]),
    );
  });

  it("round-trips availability, mapping the internal id back to the waId", async () => {
    const group = await store.getGroupByWaId("group-demo");
    const participant = await store.upsertParticipant({
      groupId: group!.id,
      waId: "wa-asha",
      displayName: "Asha",
    });
    await store.setAvailability({
      groupId: group!.id,
      participantId: participant.id,
      unavailableDates: ["2026-07-04", "2026-07-05"],
    });
    const availability = await store.getAvailability(group!.id);
    expect(availability).toEqual([
      {
        participantId: "wa-asha",
        displayName: "Asha",
        unavailableDates: ["2026-07-04", "2026-07-05"],
      },
    ]);
  });
});
