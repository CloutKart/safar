import type {
  MessageExtraction,
  NormalizedInboundMessage,
  NormalizedWhatsAppEvent,
} from "@/lib/domain";
import { parseCommand } from "@/lib/conversation/commands";
import { extractMessage } from "@/lib/conversation/extractor";
import {
  formatPlans,
  formatVoteTally,
} from "@/lib/conversation/formatters";
import {
  buildTripSummary,
  formatTripSummary,
} from "@/lib/conversation/summary";
import { refineSummaryWithLlm } from "@/lib/conversation/refine";
import { generatePlans } from "@/lib/research/planner";
import { getStore } from "@/lib/store";
import type {
  SafarStore,
  StoredGroup,
  StoredParticipant,
} from "@/lib/store/types";
import { sendWeb } from "@/lib/transport/web";
import { publishRoomEvent } from "@/lib/realtime/bus";

const DISCLOSURE = `*Safar is now coordinating this trip.*

By joining this Safar-created group, messages relevant to trip planning are processed to infer dates, budgets, constraints, and preferences. Raw trip chat is deleted 30 days after the trip is completed. Reusable travel preferences remain until you ask Safar to remove them.

Commands:
• *Safar, summarize the trip*
• *what do you remember about me*
• *forget trekking*
• *forget me*
• *Safar, help*

Safar may ask short follow-up questions when the group is stuck.`;

const HELP = `*Safar commands*
• “Safar, summarize the trip”
• Reply “approve” after checking the summary
• Correct facts in normal English, Hindi, or Hinglish
• “vote 1”, “vote 2”, or “vote 3”
• “what do you remember about me”
• “forget <preference>” or “forget me”`;

async function send(
  store: SafarStore,
  group: StoredGroup,
  text: string,
): Promise<void> {
  const chunks =
    text.length <= 3500
      ? [text]
      : text.split("\n\n——————————\n\n").flatMap((chunk) => {
          if (chunk.length <= 3500) return [chunk];
          return chunk.match(/[\s\S]{1,3400}(?:\n|$)/g) ?? [chunk];
        });
  for (const chunk of chunks) {
    const occurredAt = new Date().toISOString();
    const messageId = await sendWeb(group.id, chunk, occurredAt);
    await store.logOutboundMessage({
      groupId: group.id,
      waMessageId: messageId,
      text: chunk,
      occurredAt,
    });
  }
}

async function currentSummaryData(store: SafarStore, groupId: string) {
  const [participants, facts, preferences] = await Promise.all([
    store.getActiveParticipants(groupId),
    store.getFacts(groupId),
    store.getPreferences(groupId),
  ]);
  return {
    participants,
    summary: buildTripSummary({ participants, facts, preferences }),
  };
}

async function postFreshSummary(
  store: SafarStore,
  group: StoredGroup,
): Promise<void> {
  const [{ participants, summary: base }, messages] = await Promise.all([
    currentSummaryData(store, group.id),
    store.getRecentMessages(group.id, 80),
  ]);
  // One LLM pass over the whole conversation at summarize time (not per message):
  // corrects Hinglish/fuzzy facts the heuristics miss. Falls back to the
  // deterministic baseline when no LLM is configured or the call fails.
  const summary = await refineSummaryWithLlm({ base, messages, participants });
  const stored = await store.createSummary(group.id, summary);
  await send(store, group, formatTripSummary(summary, stored.version));
}

async function startResearch(
  store: SafarStore,
  group: StoredGroup,
): Promise<void> {
  const summary = await store.getCurrentSummary(group.id);
  if (!summary) return;
  await store.updateGroup(group.id, { status: "researching" });
  await send(
    store,
    group,
    "Majority reached. I’m checking the curated destination catalog, current access information, traveller reports, and available supplier prices. I’ll return with three distinct plans.",
  );
  // Show "Safar is typing" to everyone while the (slow) planning runs.
  publishRoomEvent(group.id, { type: "typing", who: "Safar", on: true });
  try {
    const plans = await generatePlans(summary.content);
    await store.savePlans(group.id, summary.id, plans);
    await send(store, group, formatPlans(plans));
  } finally {
    publishRoomEvent(group.id, { type: "typing", who: "Safar", on: false });
  }
}

function forwarded(message: NormalizedInboundMessage): boolean {
  const context =
    message.raw.context && typeof message.raw.context === "object"
      ? (message.raw.context as Record<string, unknown>)
      : {};
  return Boolean(context.forwarded || context.frequently_forwarded);
}

async function maybeCoordinate(
  store: SafarStore,
  group: StoredGroup,
): Promise<void> {
  if (!["listening", "forming"].includes(group.status)) return;
  const last = group.lastCoordinatorMessageAt
    ? new Date(group.lastCoordinatorMessageAt).getTime()
    : 0;
  if (Date.now() - last < 6 * 60 * 60 * 1000) return;
  const messages = await store.getRecentMessages(group.id, 12);
  if (messages.length < 4) return;
  const { summary } = await currentSummaryData(store, group.id);
  const nextQuestion = summary.uncertainties[0];
  if (!nextQuestion) return;
  await send(
    store,
    group,
    `Quick coordination check: *${nextQuestion}.* Share it naturally in the chat and I’ll update the trip brief.`,
  );
  await store.updateGroup(group.id, {
    lastCoordinatorMessageAt: new Date().toISOString(),
  });
}

async function handleMemoryCommand(
  store: SafarStore,
  group: StoredGroup,
  participant: StoredParticipant,
  command:
    | { type: "memory" }
    | { type: "forget_all" }
    | { type: "forget_preference"; preference: string },
): Promise<void> {
  if (command.type === "forget_all") {
    await store.forgetParticipant(participant.waId);
    await send(
      store,
      group,
      `${participant.displayName ?? "Done"}, I deleted your reusable preference profile. Trip messages still follow the group’s 30-day retention period.`,
    );
    return;
  }
  if (command.type === "forget_preference") {
    const count = await store.forgetPreference(
      participant.waId,
      command.preference,
    );
    await send(
      store,
      group,
      count
        ? `Forgot your saved preference for *${command.preference}*.`
        : `I don’t have a saved preference called *${command.preference}*.`,
    );
    return;
  }
  const memory = await store.getMemory(participant.waId);
  const positive = memory.filter((item) => item.weight > 0);
  const negative = memory.filter((item) => item.weight < 0);
  await send(
    store,
    group,
    memory.length
      ? `I remember that you like: ${positive.map((item) => item.tag).join(", ") || "nothing confirmed"}.\nYou tend to avoid: ${negative.map((item) => item.tag).join(", ") || "nothing confirmed"}.\nSay *forget <preference>* or *forget me* to remove it.`
      : "I don’t have any reusable preferences saved for you yet.",
  );
}

async function handleVote(
  store: SafarStore,
  group: StoredGroup,
  participant: StoredParticipant,
  option: number,
): Promise<void> {
  if (group.status === "completed") {
    await send(store, group, "This trip is already decided — the winning plan stands.");
    return;
  }
  // Voting is "open" whenever plans exist. savePlans flips status to "voting" in
  // a *separate* write that can lag or fail on Supabase, leaving the plans saved
  // but the status stuck at "researching"; gating on status alone would then
  // wrongly reject votes. Derive openness from the plans themselves.
  const plans = await store.getPlans(group.id);
  if (plans.length === 0) {
    await send(store, group, "Voting is not open yet.");
    return;
  }
  const round = group.votingRound || 1;
  // Self-heal a desynced row so loadRoomState and other devices converge to "voting".
  if (group.status !== "voting") {
    await store.updateGroup(group.id, {
      status: "voting",
      votingRound: round,
      votingClosesAt:
        group.votingClosesAt ??
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  if (group.runoffOptions.length > 0 && !group.runoffOptions.includes(option)) {
    await send(
      store,
      group,
      `This runoff only includes options ${group.runoffOptions.join(" and ")}.`,
    );
    return;
  }
  const result = await store.upsertVote({
    groupId: group.id,
    participantId: participant.id,
    optionNumber: option,
    round,
  });
  if (!result.changed) {
    await send(store, group, "That plan option is not available.");
    return;
  }
  await send(store, group, formatVoteTally(result));
  if (result.winner) {
    await store.updateGroup(group.id, {
      status: "completed",
      runoffOptions: [],
    });
    await send(
      store,
      group,
      `*Plan ${result.winner.optionNumber} wins: ${result.winner.content.title}.*\n\nThe supplier links and retrieval times in the plan are the source of truth for current availability and price.`,
    );
    return;
  }
  if (result.tied.length > 1) {
    const options = result.tied.map((plan) => plan.optionNumber);
    const nextRound = round + 1;
    await store.updateGroup(group.id, {
      votingRound: nextRound,
      runoffOptions: options,
      votingClosesAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      reminderCount: 0,
    });
    await send(
      store,
      group,
      `It’s a tie. Runoff round ${nextRound} is now open between options ${options.join(" and ")}. Reply with your choice again.`,
    );
  }
}

function formatMinutes(total: number): string {
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${mins ? ` ${mins}m` : ""}`;
  return `${mins}m`;
}

// Any member can set/extend the voting deadline; the coordinator cron already
// auto-tallies the result when votingClosesAt passes.
async function handleDeadline(
  store: SafarStore,
  group: StoredGroup,
  minutes: number | null,
): Promise<void> {
  const plans = await store.getPlans(group.id);
  if (plans.length === 0) {
    await send(store, group, "I can set a voting deadline once the plans are posted.");
    return;
  }
  if (minutes == null) {
    await send(
      store,
      group,
      "Tell me how long to keep voting open — e.g. *deadline 6h*, *deadline 2 days*, or *deadline tomorrow*.",
    );
    return;
  }
  const clamped = Math.min(14 * 24 * 60, Math.max(15, minutes));
  const closesAt = new Date(Date.now() + clamped * 60_000).toISOString();
  await store.updateGroup(group.id, {
    status: "voting",
    votingClosesAt: closesAt,
    votingRound: group.votingRound || 1,
    reminderCount: 0,
  });
  await send(
    store,
    group,
    `Voting deadline set — closes in *${formatMinutes(clamped)}*. I’ll tally the result automatically when time’s up.`,
  );
}

async function processMessage(
  store: SafarStore,
  inbound: NormalizedInboundMessage,
): Promise<void> {
  const group = await store.ensureGroup({ waGroupId: inbound.groupWaId });
  const participant = await store.upsertParticipant({
    groupId: group.id,
    waId: inbound.participantWaId,
    displayName: inbound.profileName,
  });

  const text = inbound.text;
  const storedMessage = await store.insertInboundMessage(
    group.id,
    participant.id,
    inbound,
  );
  if (!storedMessage) return;

  if (!text) return;

  const command = parseCommand(text);
  if (command.type === "nickname") {
    await store.upsertParticipant({
      groupId: group.id,
      waId: participant.waId,
      displayName: command.name,
    });
    await send(store, group, `Got it. I’ll call you ${command.name}.`);
    return;
  }
  if (!participant.displayName && !participant.nicknameRequestedAt) {
    await store.markNicknameRequested(participant.id);
    await send(
      store,
      group,
      "I couldn’t read your WhatsApp display name. Reply *call me <name>* once so I can attribute preferences correctly.",
    );
  }
  if (
    command.type === "memory" ||
    command.type === "forget_all" ||
    command.type === "forget_preference"
  ) {
    await handleMemoryCommand(store, group, participant, command);
    return;
  }
  if (command.type === "help") {
    await send(store, group, HELP);
    return;
  }
  if (command.type === "vote") {
    await handleVote(store, group, participant, command.option);
    return;
  }
  if (command.type === "deadline") {
    await handleDeadline(store, group, command.minutes);
    return;
  }
  if (command.type === "approve" || command.type === "reject") {
    const summary = await store.getCurrentSummary(group.id);
    if (!summary) {
      await send(store, group, "There is no summary awaiting approval yet.");
      return;
    }
    const approval = await store.recordSummaryApproval({
      summaryId: summary.id,
      participantId: participant.id,
      approved: command.type === "approve",
    });
    if (command.type === "reject") {
      await send(
        store,
        group,
        "Approval removed. Send the correction in normal language, then ask me to summarize again.",
      );
      return;
    }
    if (summary.content.conflicts.length > 0) {
      await send(
        store,
        group,
        `Approval recorded (${approval.approvals}/${approval.activeParticipants}), but I cannot research until the listed conflicts are corrected.`,
      );
      return;
    }
    if (approval.reached) {
      await startResearch(store, group);
    } else {
      await send(
        store,
        group,
        `Approval recorded: ${approval.approvals}/${approval.activeParticipants}. Need ${Math.floor(approval.activeParticipants / 2) + 1} for a majority.`,
      );
    }
    return;
  }

  let extraction: MessageExtraction | null = null;
  if (command.type !== "summary") {
    extraction = await extractMessage({ text, isForwarded: forwarded(inbound) });
    await store.saveExtraction({
      groupId: group.id,
      participant,
      messageId: storedMessage.id,
      extraction,
    });
  }

  if (command.type === "summary") {
    await postFreshSummary(store, group);
    return;
  }

  if (
    group.status === "summary_review" &&
    extraction &&
    (extraction.facts.length > 0 || extraction.preferences.length > 0)
  ) {
    await postFreshSummary(store, group);
    return;
  }
  await maybeCoordinate(store, group);
}

async function processParticipantChange(
  store: SafarStore,
  event: Extract<NormalizedWhatsAppEvent, { kind: "participants" }>,
): Promise<void> {
  const group = await store.ensureGroup({ waGroupId: event.change.groupWaId });
  if (event.change.action === "left") {
    await store.deactivateParticipants(
      group.id,
      event.change.participantWaIds,
    );
    return;
  }
  const existing = await store.getActiveParticipants(group.id);
  const remainingSlots = Math.max(0, 8 - existing.length);
  const accepted = event.change.participantWaIds.slice(0, remainingSlots);
  for (const waId of accepted) {
    await store.upsertParticipant({ groupId: group.id, waId });
  }
  if (accepted.length > 0) await send(store, group, DISCLOSURE);
  if (accepted.length < event.change.participantWaIds.length) {
    await send(
      store,
      group,
      "This official WhatsApp group has reached the current eight-participant API limit.",
    );
  }
}

export async function processNormalizedEvent(
  event: NormalizedWhatsAppEvent,
  store = getStore(),
): Promise<void> {
  if (event.kind === "message") {
    await processMessage(store, event.message);
  } else {
    await processParticipantChange(store, event);
  }
}

export function deserializeEvent(
  payload: Record<string, unknown>,
): NormalizedWhatsAppEvent {
  if (payload.kind === "message") {
    return {
      kind: "message",
      message: payload.message as NormalizedInboundMessage,
    };
  }
  return {
    kind: "participants",
    change: payload.change as Extract<
      NormalizedWhatsAppEvent,
      { kind: "participants" }
    >["change"],
  };
}

export async function drainWebhookQueue(limit = 20): Promise<{
  processed: number;
  failed: number;
}> {
  const store = getStore();
  const events = await store.getPendingWebhooks(limit);
  let processed = 0;
  let failed = 0;
  for (const queued of events) {
    try {
      await processNormalizedEvent(deserializeEvent(queued.payload), store);
      await store.markWebhookProcessed(queued.id);
      processed += 1;
    } catch (error) {
      await store.markWebhookFailed(
        queued.id,
        error instanceof Error ? error.message : "Unknown processing error",
      );
      failed += 1;
    }
  }
  return { processed, failed };
}
