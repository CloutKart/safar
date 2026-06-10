import type {
  GeneratedPlan,
  InterestTag,
  MessageExtraction,
  NormalizedInboundMessage,
  TripSummary,
} from "@/lib/domain";

export interface StoredGroup {
  id: string;
  waGroupId: string;
  subject: string;
  description: string | null;
  inviteLink: string | null;
  status:
    | "forming"
    | "listening"
    | "summary_review"
    | "researching"
    | "voting"
    | "completed"
    | "archived";
  activeSummaryId: string | null;
  votingClosesAt: string | null;
  votingRound: number;
  runoffOptions: number[];
  reminderCount: number;
  lastCoordinatorMessageAt: string | null;
}

export interface StoredParticipant {
  id: string;
  groupId: string;
  waId: string;
  displayName: string | null;
  isActive: boolean;
  nicknameRequestedAt: string | null;
}

export interface StoredMessage {
  id: string;
  groupId: string;
  participantId: string | null;
  waMessageId: string;
  text: string | null;
  messageType: string;
  occurredAt: string;
}

export interface StoredFact {
  participantId: string | null;
  kind: string;
  value: string | number | string[];
  confidence: number;
  isHard: boolean;
}

export interface StoredPreference {
  participantId: string;
  tag: InterestTag;
  weight: number;
  confidence: number;
}

export interface StoredSummary {
  id: string;
  groupId: string;
  version: number;
  content: TripSummary;
  status: "review" | "approved" | "superseded";
}

export interface StoredPlan {
  id: string;
  groupId: string;
  summaryId: string;
  optionNumber: number;
  content: GeneratedPlan;
}

export interface VoteResult {
  changed: boolean;
  activeParticipants: number;
  votesCast: number;
  tally: Array<{ optionNumber: number; count: number }>;
  winner: StoredPlan | null;
  tied: StoredPlan[];
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  participantIds: string[];
}

// A chat-thread message for the web UI. Unlike getRecentMessages (human-only,
// fed to the LLM), the thread includes bot replies (participantId === null).
// `id` is the public message id (the wa_message_id), which is also the key
// used by reactions — never the internal row uuid.
export interface ThreadMessage {
  id: string;
  participantId: string | null;
  displayName: string | null;
  text: string | null;
  occurredAt: string;
  reactions: ReactionSummary[];
}

export interface QueuedWebhook {
  id: string;
  eventKey: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface SafarStore {
  ensureGroup(input: {
    waGroupId: string;
    subject?: string;
    description?: string | null;
    inviteLink?: string | null;
  }): Promise<StoredGroup>;
  getGroupByWaId(waGroupId: string): Promise<StoredGroup | null>;
  getGroup(groupId: string): Promise<StoredGroup | null>;
  updateGroup(
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
  ): Promise<void>;
  upsertParticipant(input: {
    groupId: string;
    waId: string;
    displayName?: string | null;
  }): Promise<StoredParticipant>;
  deactivateParticipants(groupId: string, waIds: string[]): Promise<void>;
  getActiveParticipants(groupId: string): Promise<StoredParticipant[]>;
  markNicknameRequested(participantId: string): Promise<void>;
  insertInboundMessage(
    groupId: string,
    participantId: string,
    message: NormalizedInboundMessage,
  ): Promise<StoredMessage | null>;
  logOutboundMessage(input: {
    groupId: string;
    waMessageId: string;
    text: string;
    occurredAt: string;
    raw?: Record<string, unknown>;
  }): Promise<void>;
  saveExtraction(input: {
    groupId: string;
    participant: StoredParticipant;
    messageId: string;
    extraction: MessageExtraction;
  }): Promise<void>;
  getFacts(groupId: string): Promise<StoredFact[]>;
  getPreferences(groupId: string): Promise<StoredPreference[]>;
  getRecentMessages(groupId: string, limit?: number): Promise<StoredMessage[]>;
  getThread(groupId: string, limit?: number): Promise<ThreadMessage[]>;
  toggleReaction(input: {
    groupId: string;
    messageId: string;
    participantId: string;
    emoji: string;
  }): Promise<ReactionSummary[]>;
  createSummary(groupId: string, content: TripSummary): Promise<StoredSummary>;
  getCurrentSummary(groupId: string): Promise<StoredSummary | null>;
  recordSummaryApproval(input: {
    summaryId: string;
    participantId: string;
    approved: boolean;
  }): Promise<{ approvals: number; activeParticipants: number; reached: boolean }>;
  savePlans(
    groupId: string,
    summaryId: string,
    plans: GeneratedPlan[],
  ): Promise<StoredPlan[]>;
  getPlans(groupId: string): Promise<StoredPlan[]>;
  upsertVote(input: {
    groupId: string;
    participantId: string;
    optionNumber: number;
    round?: number;
  }): Promise<VoteResult>;
  getVoteResult(groupId: string, round?: number): Promise<VoteResult>;
  getMemory(waId: string): Promise<StoredPreference[]>;
  forgetPreference(waId: string, tag: string): Promise<number>;
  forgetParticipant(waId: string): Promise<void>;
  enqueueWebhook(input: {
    eventKey: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<boolean>;
  getPendingWebhooks(limit?: number): Promise<QueuedWebhook[]>;
  markWebhookProcessed(id: string): Promise<void>;
  markWebhookFailed(id: string, error: string): Promise<void>;
  getDashboardSnapshot(): Promise<{
    groups: StoredGroup[];
    participants: number;
    pendingEvents: number;
    plans: number;
  }>;
}
