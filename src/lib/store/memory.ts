import { randomUUID } from "node:crypto";
import type {
  GeneratedPlan,
  InterestTag,
  MessageExtraction,
  NormalizedInboundMessage,
  TripSummary,
} from "@/lib/domain";
import type {
  QueuedWebhook,
  ReactionSummary,
  SafarStore,
  StoredFact,
  StoredGroup,
  StoredMessage,
  StoredParticipant,
  StoredPlan,
  StoredPreference,
  StoredSummary,
  ThreadMessage,
  VoteResult,
} from "@/lib/store/types";

interface MemoryState {
  groups: StoredGroup[];
  participants: StoredParticipant[];
  messages: StoredMessage[];
  facts: Array<StoredFact & { groupId: string }>;
  preferences: Array<StoredPreference & { groupId: string; waId: string }>;
  summaries: StoredSummary[];
  approvals: Array<{
    summaryId: string;
    participantId: string;
    approved: boolean;
  }>;
  plans: StoredPlan[];
  votes: Array<{
    groupId: string;
    participantId: string;
    planId: string;
    round: number;
  }>;
  reactions: Array<{
    groupId: string;
    messageId: string;
    participantId: string;
    emoji: string;
  }>;
  webhooks: Array<QueuedWebhook & { status: "pending" | "processed" | "failed" }>;
}

function emptyState(): MemoryState {
  return {
    groups: [],
    participants: [],
    messages: [],
    facts: [],
    preferences: [],
    summaries: [],
    approvals: [],
    plans: [],
    votes: [],
    reactions: [],
    webhooks: [],
  };
}

const globalMemory = globalThis as typeof globalThis & {
  __safarMemoryState?: MemoryState;
};

export class MemorySafarStore implements SafarStore {
  constructor(private readonly state = emptyState()) {}

  static shared(): MemorySafarStore {
    globalMemory.__safarMemoryState ??= emptyState();
    return new MemorySafarStore(globalMemory.__safarMemoryState);
  }

  async ensureGroup(input: {
    waGroupId: string;
    subject?: string;
    description?: string | null;
    inviteLink?: string | null;
  }): Promise<StoredGroup> {
    const existing = this.state.groups.find(
      (group) => group.waGroupId === input.waGroupId,
    );
    if (existing) {
      existing.subject = input.subject ?? existing.subject;
      existing.description = input.description ?? existing.description;
      existing.inviteLink = input.inviteLink ?? existing.inviteLink;
      if (existing.status === "forming") existing.status = "listening";
      return structuredClone(existing);
    }
    const group: StoredGroup = {
      id: randomUUID(),
      waGroupId: input.waGroupId,
      subject: input.subject ?? "Safar trip",
      description: input.description ?? null,
      inviteLink: input.inviteLink ?? null,
      status: "listening",
      activeSummaryId: null,
      votingClosesAt: null,
      votingRound: 1,
      runoffOptions: [],
      reminderCount: 0,
      lastCoordinatorMessageAt: null,
    };
    this.state.groups.push(group);
    return structuredClone(group);
  }

  async getGroupByWaId(waGroupId: string): Promise<StoredGroup | null> {
    const group = this.state.groups.find((item) => item.waGroupId === waGroupId);
    return group ? structuredClone(group) : null;
  }

  async getGroup(groupId: string): Promise<StoredGroup | null> {
    const group = this.state.groups.find((item) => item.id === groupId);
    return group ? structuredClone(group) : null;
  }

  async updateGroup(
    groupId: string,
    patch: Partial<
      Pick<
        StoredGroup,
        | "subject"
        | "description"
        | "inviteLink"
        | "status"
        | "activeSummaryId"
        | "votingClosesAt"
        | "votingRound"
        | "runoffOptions"
        | "reminderCount"
        | "lastCoordinatorMessageAt"
      >
    >,
  ): Promise<void> {
    const group = this.state.groups.find((item) => item.id === groupId);
    if (!group) throw new Error("Group not found");
    Object.assign(group, patch);
  }

  async upsertParticipant(input: {
    groupId: string;
    waId: string;
    displayName?: string | null;
  }): Promise<StoredParticipant> {
    const existing = this.state.participants.find(
      (participant) =>
        participant.groupId === input.groupId &&
        participant.waId === input.waId,
    );
    if (existing) {
      existing.isActive = true;
      if (input.displayName) existing.displayName = input.displayName;
      return structuredClone(existing);
    }
    const participant: StoredParticipant = {
      id: randomUUID(),
      groupId: input.groupId,
      waId: input.waId,
      displayName: input.displayName ?? null,
      isActive: true,
      nicknameRequestedAt: null,
    };
    this.state.participants.push(participant);
    return structuredClone(participant);
  }

  async deactivateParticipants(groupId: string, waIds: string[]): Promise<void> {
    for (const participant of this.state.participants) {
      if (participant.groupId === groupId && waIds.includes(participant.waId)) {
        participant.isActive = false;
      }
    }
  }

  async getActiveParticipants(groupId: string): Promise<StoredParticipant[]> {
    return structuredClone(
      this.state.participants.filter(
        (participant) =>
          participant.groupId === groupId && participant.isActive,
      ),
    );
  }

  async markNicknameRequested(participantId: string): Promise<void> {
    const participant = this.state.participants.find(
      (item) => item.id === participantId,
    );
    if (participant) participant.nicknameRequestedAt = new Date().toISOString();
  }

  async insertInboundMessage(
    groupId: string,
    participantId: string,
    message: NormalizedInboundMessage,
  ): Promise<StoredMessage | null> {
    if (
      this.state.messages.some(
        (existing) => existing.waMessageId === message.messageId,
      )
    ) {
      return null;
    }
    const stored: StoredMessage = {
      id: randomUUID(),
      groupId,
      participantId,
      waMessageId: message.messageId,
      text: message.text,
      messageType: message.type,
      occurredAt: message.timestamp,
    };
    this.state.messages.push(stored);
    return structuredClone(stored);
  }

  async logOutboundMessage(input: {
    groupId: string;
    waMessageId: string;
    text: string;
    occurredAt: string;
  }): Promise<void> {
    if (
      this.state.messages.some(
        (message) => message.waMessageId === input.waMessageId,
      )
    ) {
      return;
    }
    this.state.messages.push({
      id: randomUUID(),
      groupId: input.groupId,
      participantId: null,
      waMessageId: input.waMessageId,
      text: input.text,
      messageType: "text",
      occurredAt: input.occurredAt,
    });
  }

  async saveExtraction(input: {
    groupId: string;
    participant: StoredParticipant;
    messageId: string;
    extraction: MessageExtraction;
  }): Promise<void> {
    for (const fact of input.extraction.facts) {
      this.state.facts = this.state.facts.filter(
        (existing) =>
          !(
            existing.groupId === input.groupId &&
            existing.participantId === input.participant.id &&
            existing.kind === fact.kind
          ),
      );
      this.state.facts.push({
        groupId: input.groupId,
        participantId: input.participant.id,
        kind: fact.kind,
        value: fact.value,
        confidence: fact.confidence,
        isHard: fact.isHard,
      });
    }
    for (const preference of input.extraction.preferences) {
      if (!preference.directFirstPerson) continue;
      this.state.preferences.push({
        groupId: input.groupId,
        participantId: input.participant.id,
        waId: input.participant.waId,
        tag: preference.tag,
        weight: preference.weight,
        confidence: preference.confidence,
      });
    }
  }

  async getFacts(groupId: string): Promise<StoredFact[]> {
    return structuredClone(
      this.state.facts
        .filter((fact) => fact.groupId === groupId)
        .map((fact) => ({
          participantId: fact.participantId,
          kind: fact.kind,
          value: fact.value,
          confidence: fact.confidence,
          isHard: fact.isHard,
        })),
    );
  }

  async getPreferences(groupId: string): Promise<StoredPreference[]> {
    return structuredClone(
      this.state.preferences
        .filter((preference) => preference.groupId === groupId)
        .map((preference) => ({
          participantId: preference.participantId,
          tag: preference.tag,
          weight: preference.weight,
          confidence: preference.confidence,
        })),
    );
  }

  async getRecentMessages(
    groupId: string,
    limit = 80,
  ): Promise<StoredMessage[]> {
    return structuredClone(
      this.state.messages
        .filter(
          (message) => message.groupId === groupId && message.participantId,
        )
        .slice(-limit),
    );
  }

  // Reactions are reported in browser-local participant ids (waId), so the chat
  // client — which only knows its own waId — can tell which it owns.
  private reactionsFor(messageId: string): ReactionSummary[] {
    const waIdOf = (storeId: string) =>
      this.state.participants.find((participant) => participant.id === storeId)
        ?.waId ?? storeId;
    const byEmoji = new Map<string, string[]>();
    for (const reaction of this.state.reactions.filter(
      (item) => item.messageId === messageId,
    )) {
      byEmoji.set(reaction.emoji, [
        ...(byEmoji.get(reaction.emoji) ?? []),
        waIdOf(reaction.participantId),
      ]);
    }
    return [...byEmoji.entries()].map(([emoji, participantIds]) => ({
      emoji,
      count: participantIds.length,
      participantIds,
    }));
  }

  async getThread(groupId: string, limit = 200): Promise<ThreadMessage[]> {
    const byStoreId = new Map(
      this.state.participants
        .filter((participant) => participant.groupId === groupId)
        .map((participant) => [participant.id, participant]),
    );
    return this.state.messages
      .filter((message) => message.groupId === groupId)
      .slice(-limit)
      .map((message) => {
        const participant = message.participantId
          ? byStoreId.get(message.participantId)
          : null;
        return {
          id: message.waMessageId,
          participantId: participant?.waId ?? null,
          displayName: participant?.displayName ?? null,
          text: message.text,
          occurredAt: message.occurredAt,
          reactions: this.reactionsFor(message.waMessageId),
        };
      });
  }

  async toggleReaction(input: {
    groupId: string;
    messageId: string;
    participantId: string;
    emoji: string;
  }): Promise<ReactionSummary[]> {
    const index = this.state.reactions.findIndex(
      (reaction) =>
        reaction.messageId === input.messageId &&
        reaction.participantId === input.participantId &&
        reaction.emoji === input.emoji,
    );
    if (index >= 0) {
      this.state.reactions.splice(index, 1);
    } else {
      this.state.reactions.push({
        groupId: input.groupId,
        messageId: input.messageId,
        participantId: input.participantId,
        emoji: input.emoji,
      });
    }
    return this.reactionsFor(input.messageId);
  }

  async createSummary(
    groupId: string,
    content: TripSummary,
  ): Promise<StoredSummary> {
    for (const summary of this.state.summaries) {
      if (summary.groupId === groupId && summary.status === "review") {
        summary.status = "superseded";
      }
    }
    const summary: StoredSummary = {
      id: randomUUID(),
      groupId,
      version:
        Math.max(
          0,
          ...this.state.summaries
            .filter((item) => item.groupId === groupId)
            .map((item) => item.version),
        ) + 1,
      content,
      status: "review",
    };
    this.state.summaries.push(summary);
    await this.updateGroup(groupId, {
      activeSummaryId: summary.id,
      status: "summary_review",
    });
    return structuredClone(summary);
  }

  async getCurrentSummary(groupId: string): Promise<StoredSummary | null> {
    const group = this.state.groups.find((item) => item.id === groupId);
    const summary = this.state.summaries.find(
      (item) => item.id === group?.activeSummaryId,
    );
    return summary ? structuredClone(summary) : null;
  }

  async recordSummaryApproval(input: {
    summaryId: string;
    participantId: string;
    approved: boolean;
  }): Promise<{ approvals: number; activeParticipants: number; reached: boolean }> {
    const existing = this.state.approvals.find(
      (approval) =>
        approval.summaryId === input.summaryId &&
        approval.participantId === input.participantId,
    );
    if (existing) existing.approved = input.approved;
    else this.state.approvals.push({ ...input });
    const summary = this.state.summaries.find(
      (item) => item.id === input.summaryId,
    );
    if (!summary) throw new Error("Summary not found");
    const participants = await this.getActiveParticipants(summary.groupId);
    const activeIds = new Set(participants.map((participant) => participant.id));
    const approvals = this.state.approvals.filter(
      (approval) =>
        approval.summaryId === input.summaryId &&
        approval.approved &&
        activeIds.has(approval.participantId),
    ).length;
    return {
      approvals,
      activeParticipants: participants.length,
      reached: approvals >= Math.floor(participants.length / 2) + 1,
    };
  }

  async savePlans(
    groupId: string,
    summaryId: string,
    plans: GeneratedPlan[],
  ): Promise<StoredPlan[]> {
    const stored = plans.map((content) => ({
      id: randomUUID(),
      groupId,
      summaryId,
      optionNumber: content.optionNumber,
      content,
    }));
    this.state.plans.push(...stored);
    await this.updateGroup(groupId, {
      status: "voting",
      votingClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      votingRound: 1,
      runoffOptions: [],
      reminderCount: 0,
    });
    return structuredClone(stored);
  }

  async getPlans(groupId: string): Promise<StoredPlan[]> {
    const candidates = this.state.plans.filter((plan) => plan.groupId === groupId);
    const latestSummaryId = candidates.at(-1)?.summaryId;
    return structuredClone(
      candidates
        .filter((plan) => plan.summaryId === latestSummaryId)
        .sort((a, b) => a.optionNumber - b.optionNumber),
    );
  }

  async upsertVote(input: {
    groupId: string;
    participantId: string;
    optionNumber: number;
    round?: number;
  }): Promise<VoteResult> {
    const plans = await this.getPlans(input.groupId);
    const plan = plans.find((item) => item.optionNumber === input.optionNumber);
    if (!plan) {
      return {
        changed: false,
        activeParticipants: 0,
        votesCast: 0,
        tally: [],
        winner: null,
        tied: [],
      };
    }
    const round = input.round ?? 1;
    const existing = this.state.votes.find(
      (vote) =>
        vote.groupId === input.groupId &&
        vote.participantId === input.participantId &&
        vote.round === round,
    );
    if (existing) existing.planId = plan.id;
    else
      this.state.votes.push({
        groupId: input.groupId,
        participantId: input.participantId,
        planId: plan.id,
        round,
      });
    return this.getVoteResult(input.groupId, round);
  }

  async getVoteResult(groupId: string, round = 1): Promise<VoteResult> {
    const plans = await this.getPlans(groupId);
    const participants = await this.getActiveParticipants(groupId);
    const activeIds = new Set(participants.map((participant) => participant.id));
    const votes = this.state.votes.filter(
      (vote) =>
        vote.groupId === groupId &&
        vote.round === round &&
        activeIds.has(vote.participantId),
    );
    const tally = plans.map((candidate) => ({
      optionNumber: candidate.optionNumber,
      count: votes.filter((vote) => vote.planId === candidate.id).length,
    }));
    const highest = Math.max(...tally.map((item) => item.count), 0);
    const tied = plans.filter(
      (candidate) =>
        tally.find((item) => item.optionNumber === candidate.optionNumber)
          ?.count === highest,
    );
    const complete = votes.length === participants.length;
    return {
      changed: true,
      activeParticipants: participants.length,
      votesCast: votes.length,
      tally,
      winner: complete && tied.length === 1 ? tied[0] : null,
      tied: complete && tied.length > 1 ? tied : [],
    };
  }

  async getMemory(waId: string): Promise<StoredPreference[]> {
    const grouped = new Map<InterestTag, StoredPreference[]>();
    for (const preference of this.state.preferences.filter(
      (item) => item.waId === waId,
    )) {
      grouped.set(preference.tag, [
        ...(grouped.get(preference.tag) ?? []),
        preference,
      ]);
    }
    return [...grouped.entries()].map(([tag, items]) => ({
      participantId: waId,
      tag,
      weight:
        items.reduce((sum, item) => sum + item.weight, 0) / items.length,
      confidence: Math.max(...items.map((item) => item.confidence)),
    }));
  }

  async forgetPreference(waId: string, tag: string): Promise<number> {
    const before = this.state.preferences.length;
    this.state.preferences = this.state.preferences.filter(
      (item) => !(item.waId === waId && item.tag === tag),
    );
    return before - this.state.preferences.length;
  }

  async forgetParticipant(waId: string): Promise<void> {
    this.state.preferences = this.state.preferences.filter(
      (item) => item.waId !== waId,
    );
  }

  async enqueueWebhook(input: {
    eventKey: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<boolean> {
    if (
      this.state.webhooks.some(
        (webhook) => webhook.eventKey === input.eventKey,
      )
    ) {
      return false;
    }
    this.state.webhooks.push({
      id: randomUUID(),
      eventKey: input.eventKey,
      eventType: input.eventType,
      payload: input.payload,
      attempts: 0,
      status: "pending",
    });
    return true;
  }

  async getPendingWebhooks(limit = 20): Promise<QueuedWebhook[]> {
    return structuredClone(
      this.state.webhooks
        .filter((webhook) => webhook.status !== "processed")
        .slice(0, limit)
        .map((webhook) => ({
          id: webhook.id,
          eventKey: webhook.eventKey,
          eventType: webhook.eventType,
          payload: webhook.payload,
          attempts: webhook.attempts,
        })),
    );
  }

  async markWebhookProcessed(id: string): Promise<void> {
    const webhook = this.state.webhooks.find((item) => item.id === id);
    if (webhook) webhook.status = "processed";
  }

  async markWebhookFailed(id: string): Promise<void> {
    const webhook = this.state.webhooks.find((item) => item.id === id);
    if (webhook) {
      webhook.status = "failed";
      webhook.attempts += 1;
    }
  }

  async getDashboardSnapshot(): Promise<{
    groups: StoredGroup[];
    participants: number;
    pendingEvents: number;
    plans: number;
  }> {
    return {
      groups: structuredClone(this.state.groups),
      participants: this.state.participants.length,
      pendingEvents: this.state.webhooks.filter(
        (webhook) => webhook.status !== "processed",
      ).length,
      plans: this.state.plans.length,
    };
  }
}
