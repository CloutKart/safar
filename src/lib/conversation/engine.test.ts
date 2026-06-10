import { beforeEach, describe, expect, it } from "vitest";
import { processNormalizedEvent } from "@/lib/conversation/engine";
import { MemorySafarStore } from "@/lib/store/memory";

function message(
  id: string,
  participantWaId: string,
  profileName: string,
  text: string,
) {
  return {
    kind: "message" as const,
    message: {
      eventKey: id,
      messageId: id,
      groupWaId: "group-demo",
      participantWaId,
      profileName,
      type: "text" as const,
      text,
      mediaId: null,
      timestamp: new Date().toISOString(),
      raw: {},
    },
  };
}

describe("conversation-native trip lifecycle", () => {
  let store: MemorySafarStore;

  beforeEach(async () => {
    store = new MemorySafarStore();
    await processNormalizedEvent(
      {
        kind: "participants",
        change: {
          eventKey: "join-1",
          groupWaId: "group-demo",
          action: "joined",
          participantWaIds: ["wa-asha", "wa-kabir"],
          timestamp: new Date().toISOString(),
          raw: {},
        },
      },
      store,
    );
  });

  it("moves from chat evidence to plans and a winning vote", async () => {
    await processNormalizedEvent(
      message(
        "m1",
        "wa-asha",
        "Asha",
        "I am from DEL. I like cafe hopping. Budget INR 12000 max.",
      ),
      store,
    );
    await processNormalizedEvent(
      message(
        "m2",
        "wa-kabir",
        "Kabir",
        "Mujhe trekking aur adventure pasand hai. We can do 3 days.",
      ),
      store,
    );
    await processNormalizedEvent(
      message("m3", "wa-asha", "Asha", "Safar, summarize the trip"),
      store,
    );

    const group = await store.getGroupByWaId("group-demo");
    expect(group?.status).toBe("summary_review");
    const summary = await store.getCurrentSummary(group!.id);
    expect(summary?.content.budget.maxInr).toBe(12000);
    expect(summary?.content.memberPreferences).toHaveLength(2);

    await processNormalizedEvent(
      message("m4", "wa-asha", "Asha", "approve"),
      store,
    );
    expect((await store.getGroup(group!.id))?.status).toBe("summary_review");
    await processNormalizedEvent(
      message("m5", "wa-kabir", "Kabir", "approve"),
      store,
    );

    expect((await store.getGroup(group!.id))?.status).toBe("voting");
    expect(await store.getPlans(group!.id)).toHaveLength(3);

    await processNormalizedEvent(
      message("m6", "wa-asha", "Asha", "vote 1"),
      store,
    );
    await processNormalizedEvent(
      message("m7", "wa-kabir", "Kabir", "vote 1"),
      store,
    );
    expect((await store.getGroup(group!.id))?.status).toBe("completed");
  });

  it("supersedes a participant's corrected fact", async () => {
    await processNormalizedEvent(
      message("c1", "wa-asha", "Asha", "We can do 3 days"),
      store,
    );
    await processNormalizedEvent(
      message("c2", "wa-asha", "Asha", "Actually we can do 4 days"),
      store,
    );
    const group = await store.getGroupByWaId("group-demo");
    const facts = await store.getFacts(group!.id);
    expect(
      facts.filter((fact) => fact.kind === "duration_days").map((fact) => fact.value),
    ).toEqual([4]);
  });
});
