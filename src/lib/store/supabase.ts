import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { GeneratedPlanSchema } from "@/lib/domain";
import type {
  GeneratedPlan,
  InterestTag,
  MessageExtraction,
  NormalizedInboundMessage,
  TripSummary,
} from "@/lib/domain";
import type {
  MemberAvailability,
  MessageHeard,
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

function mapGroup(row: Record<string, unknown>): StoredGroup {
  return {
    id: String(row.id),
    waGroupId: String(row.wa_group_id),
    subject: String(row.subject),
    description: row.description ? String(row.description) : null,
    inviteLink: row.invite_link ? String(row.invite_link) : null,
    status: row.status as StoredGroup["status"],
    activeSummaryId: row.active_summary_id ? String(row.active_summary_id) : null,
    votingClosesAt: row.voting_closes_at ? String(row.voting_closes_at) : null,
    votingRound: Number(row.voting_round ?? 1),
    runoffOptions: Array.isArray(row.runoff_options)
      ? row.runoff_options.map(Number)
      : [],
    reminderCount: Number(row.reminder_count ?? 0),
    lastCoordinatorMessageAt: row.last_coordinator_message_at
      ? String(row.last_coordinator_message_at)
      : null,
  };
}

function mapParticipant(row: Record<string, unknown>): StoredParticipant {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    waId: String(row.wa_id),
    displayName: row.display_name ? String(row.display_name) : null,
    isActive: Boolean(row.is_active),
    nicknameRequestedAt: row.nickname_requested_at
      ? String(row.nickname_requested_at)
      : null,
  };
}

function mapPlan(row: Record<string, unknown>): StoredPlan {
  // Re-parse so plans stored before a schema field existed (V1.2 storyboard
  // fields, etc.) backfill their defaults and never crash the newer UI.
  const parsed = GeneratedPlanSchema.safeParse(row.content);
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    summaryId: String(row.summary_id),
    optionNumber: Number(row.option_number),
    content: parsed.success ? parsed.data : (row.content as GeneratedPlan),
  };
}

export class SupabaseSafarStore implements SafarStore {
  private get db() {
    return getSupabaseAdmin();
  }

  async ensureGroup(input: {
    waGroupId: string;
    subject?: string;
    description?: string | null;
    inviteLink?: string | null;
  }): Promise<StoredGroup> {
    const { data, error } = await this.db
      .from("whatsapp_groups")
      .upsert(
        {
          wa_group_id: input.waGroupId,
          subject: input.subject ?? "Safar trip",
          description: input.description ?? null,
          invite_link: input.inviteLink ?? null,
          status: "listening",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "wa_group_id" },
      )
      .select()
      .single();
    if (error) throw error;
    return mapGroup(data);
  }

  async getGroupByWaId(waGroupId: string): Promise<StoredGroup | null> {
    const { data, error } = await this.db
      .from("whatsapp_groups")
      .select()
      .eq("wa_group_id", waGroupId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapGroup(data) : null;
  }

  async getGroup(groupId: string): Promise<StoredGroup | null> {
    const { data, error } = await this.db
      .from("whatsapp_groups")
      .select()
      .eq("id", groupId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapGroup(data) : null;
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
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.subject !== undefined) payload.subject = patch.subject;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.inviteLink !== undefined) payload.invite_link = patch.inviteLink;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.status === "completed") {
      payload.completed_at = new Date().toISOString();
    }
    if (patch.activeSummaryId !== undefined)
      payload.active_summary_id = patch.activeSummaryId;
    if (patch.votingClosesAt !== undefined)
      payload.voting_closes_at = patch.votingClosesAt;
    if (patch.votingRound !== undefined)
      payload.voting_round = patch.votingRound;
    if (patch.runoffOptions !== undefined)
      payload.runoff_options = patch.runoffOptions;
    if (patch.reminderCount !== undefined)
      payload.reminder_count = patch.reminderCount;
    if (patch.lastCoordinatorMessageAt !== undefined)
      payload.last_coordinator_message_at = patch.lastCoordinatorMessageAt;

    const { error } = await this.db
      .from("whatsapp_groups")
      .update(payload)
      .eq("id", groupId);
    if (error) throw error;
  }

  async upsertParticipant(input: {
    groupId: string;
    waId: string;
    displayName?: string | null;
  }): Promise<StoredParticipant> {
    const payload: Record<string, unknown> = {
      group_id: input.groupId,
      wa_id: input.waId,
      is_active: true,
      left_at: null,
    };
    if (input.displayName) payload.display_name = input.displayName;
    const { data, error } = await this.db
      .from("participants")
      .upsert(payload, { onConflict: "group_id,wa_id" })
      .select()
      .single();
    if (error) throw error;
    return mapParticipant(data);
  }

  async deactivateParticipants(groupId: string, waIds: string[]): Promise<void> {
    if (waIds.length === 0) return;
    const { error } = await this.db
      .from("participants")
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq("group_id", groupId)
      .in("wa_id", waIds);
    if (error) throw error;
  }

  async getActiveParticipants(groupId: string): Promise<StoredParticipant[]> {
    const { data, error } = await this.db
      .from("participants")
      .select()
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("joined_at");
    if (error) throw error;
    return (data ?? []).map(mapParticipant);
  }

  async markNicknameRequested(participantId: string): Promise<void> {
    const { error } = await this.db
      .from("participants")
      .update({ nickname_requested_at: new Date().toISOString() })
      .eq("id", participantId);
    if (error) throw error;
  }

  async insertInboundMessage(
    groupId: string,
    participantId: string,
    message: NormalizedInboundMessage,
  ): Promise<StoredMessage | null> {
    const { data, error } = await this.db
      .from("messages")
      .insert({
        group_id: groupId,
        participant_id: participantId,
        wa_message_id: message.messageId,
        message_type: message.type,
        text_content: message.text,
        media_id: message.mediaId,
        raw_payload: message.raw,
        occurred_at: message.timestamp,
      })
      .select()
      .maybeSingle();
    if (error?.code === "23505") return null;
    if (error) throw error;
    if (!data) return null;
    return {
      id: String(data.id),
      groupId,
      participantId,
      waMessageId: message.messageId,
      text: message.text,
      messageType: message.type,
      occurredAt: message.timestamp,
    };
  }

  async logOutboundMessage(input: {
    groupId: string;
    waMessageId: string;
    text: string;
    occurredAt: string;
    raw?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db.from("messages").upsert(
      {
        group_id: input.groupId,
        participant_id: null,
        wa_message_id: input.waMessageId,
        direction: "outbound",
        message_type: "text",
        text_content: input.text,
        raw_payload: input.raw ?? {},
        occurred_at: input.occurredAt,
      },
      { onConflict: "wa_message_id" },
    );
    if (error) throw error;
  }

  async saveExtraction(input: {
    groupId: string;
    participant: StoredParticipant;
    messageId: string;
    extraction: MessageExtraction;
  }): Promise<void> {
    if (input.extraction.facts.length > 0) {
      for (const fact of input.extraction.facts) {
        const { error: supersedeError } = await this.db
          .from("trip_facts")
          .update({ superseded_at: new Date().toISOString() })
          .eq("group_id", input.groupId)
          .eq("participant_id", input.participant.id)
          .eq("kind", fact.kind)
          .is("superseded_at", null);
        if (supersedeError) throw supersedeError;
      }
      const { error } = await this.db.from("trip_facts").insert(
        input.extraction.facts.map((fact) => ({
          group_id: input.groupId,
          participant_id: input.participant.id,
          evidence_message_id: input.messageId,
          kind: fact.kind,
          value: fact.value,
          confidence: fact.confidence,
          is_hard: fact.isHard,
        })),
      );
      if (error) throw error;
    }

    const validPreferences = input.extraction.preferences.filter(
      (preference) => preference.directFirstPerson,
    );
    if (validPreferences.length === 0) return;

    const { error: evidenceError } = await this.db
      .from("preference_evidence")
      .insert(
        validPreferences.map((preference) => ({
          group_id: input.groupId,
          participant_id: input.participant.id,
          evidence_message_id: input.messageId,
          tag: preference.tag,
          weight: preference.weight,
          confidence: preference.confidence,
          direct_first_person: true,
        })),
      );
    if (evidenceError) throw evidenceError;

    for (const preference of validPreferences) {
      const existing = await this.getMemory(input.participant.waId);
      const current = existing.find((item) => item.tag === preference.tag);
      const evidenceCount = (current ? 2 : 1);
      const weight = current
        ? (current.weight + preference.weight) / 2
        : preference.weight;
      const confidence = Math.max(
        current?.confidence ?? 0,
        preference.confidence,
      );
      const { error } = await this.db.from("reusable_preferences").upsert(
        {
          wa_id: input.participant.waId,
          tag: preference.tag,
          weight,
          confidence,
          evidence_count: evidenceCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "wa_id,tag" },
      );
      if (error) throw error;
    }
  }

  async getFacts(groupId: string): Promise<StoredFact[]> {
    const { data, error } = await this.db
      .from("trip_facts")
      .select("participant_id,kind,value,confidence,is_hard")
      .eq("group_id", groupId)
      .is("superseded_at", null)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      participantId: row.participant_id ? String(row.participant_id) : null,
      kind: String(row.kind),
      value: row.value as string | number | string[],
      confidence: Number(row.confidence),
      isHard: Boolean(row.is_hard),
    }));
  }

  async getPreferences(groupId: string): Promise<StoredPreference[]> {
    const { data, error } = await this.db
      .from("preference_evidence")
      .select("participant_id,tag,weight,confidence")
      .eq("group_id", groupId)
      .eq("direct_first_person", true);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      participantId: String(row.participant_id),
      tag: String(row.tag) as InterestTag,
      weight: Number(row.weight),
      confidence: Number(row.confidence),
    }));
  }

  async getHeard(groupId: string): Promise<Map<string, MessageHeard>> {
    const [facts, prefs, messages] = await Promise.all([
      this.db
        .from("trip_facts")
        .select("evidence_message_id,kind,value")
        .eq("group_id", groupId)
        .is("superseded_at", null),
      this.db
        .from("preference_evidence")
        .select("evidence_message_id,tag")
        .eq("group_id", groupId)
        .eq("direct_first_person", true),
      this.db.from("messages").select("id,wa_message_id").eq("group_id", groupId),
    ]);
    if (facts.error) throw facts.error;
    if (prefs.error) throw prefs.error;
    if (messages.error) throw messages.error;
    // evidence rows carry the internal message id; the thread is keyed by wa id.
    const idToWa = new Map(
      (messages.data ?? []).map((row) => [String(row.id), String(row.wa_message_id)]),
    );
    const result = new Map<string, MessageHeard>();
    const ensure = (wa: string) => {
      const entry = result.get(wa) ?? { facts: [], interests: [] };
      result.set(wa, entry);
      return entry;
    };
    for (const row of facts.data ?? []) {
      if (!row.evidence_message_id) continue;
      const wa = idToWa.get(String(row.evidence_message_id));
      if (!wa) continue;
      ensure(wa).facts.push({
        kind: String(row.kind),
        value: row.value as string | number | string[],
      });
    }
    for (const row of prefs.data ?? []) {
      if (!row.evidence_message_id) continue;
      const wa = idToWa.get(String(row.evidence_message_id));
      if (!wa) continue;
      const entry = ensure(wa);
      const tag = String(row.tag);
      if (!entry.interests.includes(tag)) entry.interests.push(tag);
    }
    return result;
  }

  async setAvailability(input: {
    groupId: string;
    participantId: string;
    unavailableDates: string[];
  }): Promise<void> {
    const { error } = await this.db.from("group_availability").upsert(
      {
        group_id: input.groupId,
        participant_id: input.participantId,
        unavailable_dates: input.unavailableDates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id,participant_id" },
    );
    if (error) throw error;
  }

  async getAvailability(groupId: string): Promise<MemberAvailability[]> {
    const [avail, participants] = await Promise.all([
      this.db
        .from("group_availability")
        .select("participant_id,unavailable_dates")
        .eq("group_id", groupId),
      this.db
        .from("participants")
        .select("id,wa_id,display_name")
        .eq("group_id", groupId),
    ]);
    if (avail.error) throw avail.error;
    if (participants.error) throw participants.error;
    const byId = new Map(
      (participants.data ?? []).map((row) => [
        String(row.id),
        {
          waId: String(row.wa_id),
          displayName: row.display_name ? String(row.display_name) : null,
        },
      ]),
    );
    return (avail.data ?? []).map((row) => {
      const participant = byId.get(String(row.participant_id));
      return {
        participantId: participant?.waId ?? String(row.participant_id),
        displayName: participant?.displayName ?? null,
        unavailableDates: Array.isArray(row.unavailable_dates)
          ? row.unavailable_dates.map(String)
          : [],
      };
    });
  }

  async getRecentMessages(
    groupId: string,
    limit = 80,
  ): Promise<StoredMessage[]> {
    const { data, error } = await this.db
      .from("messages")
      .select("id,group_id,participant_id,wa_message_id,text_content,message_type,occurred_at")
      .eq("group_id", groupId)
      .eq("direction", "inbound")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).reverse().map((row) => ({
      id: String(row.id),
      groupId: String(row.group_id),
      participantId: row.participant_id ? String(row.participant_id) : null,
      waMessageId: String(row.wa_message_id),
      text: row.text_content ? String(row.text_content) : null,
      messageType: String(row.message_type),
      occurredAt: String(row.occurred_at),
    }));
  }

  // store participant uuid -> browser-local participant id (wa_id)
  private async waIdByStoreId(groupId: string): Promise<Map<string, string>> {
    const { data, error } = await this.db
      .from("participants")
      .select("id,wa_id")
      .eq("group_id", groupId);
    if (error) throw error;
    return new Map(
      (data ?? []).map((row) => [String(row.id), String(row.wa_id)]),
    );
  }

  // Reactions are reported in browser-local participant ids (wa_id) so the chat
  // client — which only knows its own wa_id — can tell which it owns.
  private async reactionsForMessages(
    groupId: string,
    messageIds: string[],
    waIdByStoreId: Map<string, string>,
  ): Promise<Map<string, ReactionSummary[]>> {
    const result = new Map<string, ReactionSummary[]>();
    if (messageIds.length === 0) return result;
    const { data, error } = await this.db
      .from("message_reactions")
      .select("message_wa_id,participant_id,emoji")
      .eq("group_id", groupId)
      .in("message_wa_id", messageIds);
    if (error) throw error;
    const byMessage = new Map<string, Map<string, string[]>>();
    for (const row of data ?? []) {
      const messageId = String(row.message_wa_id);
      const emoji = String(row.emoji);
      const waId =
        waIdByStoreId.get(String(row.participant_id)) ??
        String(row.participant_id);
      const byEmoji = byMessage.get(messageId) ?? new Map<string, string[]>();
      byEmoji.set(emoji, [...(byEmoji.get(emoji) ?? []), waId]);
      byMessage.set(messageId, byEmoji);
    }
    for (const [messageId, byEmoji] of byMessage) {
      result.set(
        messageId,
        [...byEmoji.entries()].map(([emoji, participantIds]) => ({
          emoji,
          count: participantIds.length,
          participantIds,
        })),
      );
    }
    return result;
  }

  async getThread(groupId: string, limit = 200): Promise<ThreadMessage[]> {
    const [messages, participants] = await Promise.all([
      this.db
        .from("messages")
        .select("wa_message_id,participant_id,text_content,occurred_at")
        .eq("group_id", groupId)
        .order("occurred_at", { ascending: false })
        .limit(limit),
      this.db
        .from("participants")
        .select("id,wa_id,display_name")
        .eq("group_id", groupId),
    ]);
    if (messages.error) throw messages.error;
    if (participants.error) throw participants.error;
    const byStoreId = new Map(
      (participants.data ?? []).map((row) => [
        String(row.id),
        {
          waId: String(row.wa_id),
          displayName: row.display_name ? String(row.display_name) : null,
        },
      ]),
    );
    const waIdByStoreId = new Map(
      [...byStoreId.entries()].map(([id, info]) => [id, info.waId]),
    );
    const ordered = (messages.data ?? []).slice().reverse();
    const reactions = await this.reactionsForMessages(
      groupId,
      ordered.map((row) => String(row.wa_message_id)),
      waIdByStoreId,
    );
    return ordered.map((row) => {
      const participant = row.participant_id
        ? byStoreId.get(String(row.participant_id))
        : null;
      return {
        id: String(row.wa_message_id),
        participantId: participant?.waId ?? null,
        displayName: participant?.displayName ?? null,
        text: row.text_content ? String(row.text_content) : null,
        occurredAt: String(row.occurred_at),
        reactions: reactions.get(String(row.wa_message_id)) ?? [],
      };
    });
  }

  async toggleReaction(input: {
    groupId: string;
    messageId: string;
    participantId: string;
    emoji: string;
  }): Promise<ReactionSummary[]> {
    const { data: existing, error: selectError } = await this.db
      .from("message_reactions")
      .select("id")
      .eq("message_wa_id", input.messageId)
      .eq("participant_id", input.participantId)
      .eq("emoji", input.emoji)
      .maybeSingle();
    if (selectError) throw selectError;
    if (existing) {
      const { error } = await this.db
        .from("message_reactions")
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await this.db.from("message_reactions").insert({
        group_id: input.groupId,
        message_wa_id: input.messageId,
        participant_id: input.participantId,
        emoji: input.emoji,
      });
      if (error && error.code !== "23505") throw error;
    }
    const waIdByStoreId = await this.waIdByStoreId(input.groupId);
    const reactions = await this.reactionsForMessages(
      input.groupId,
      [input.messageId],
      waIdByStoreId,
    );
    return reactions.get(input.messageId) ?? [];
  }

  async createSummary(
    groupId: string,
    content: TripSummary,
  ): Promise<StoredSummary> {
    const { data: latest, error: latestError } = await this.db
      .from("summary_versions")
      .select("version")
      .eq("group_id", groupId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    const version = Number(latest?.version ?? 0) + 1;

    await this.db
      .from("summary_versions")
      .update({ status: "superseded" })
      .eq("group_id", groupId)
      .eq("status", "review");

    const { data, error } = await this.db
      .from("summary_versions")
      .insert({ group_id: groupId, version, content, status: "review" })
      .select()
      .single();
    if (error) throw error;
    await this.updateGroup(groupId, {
      activeSummaryId: String(data.id),
      status: "summary_review",
    });
    return {
      id: String(data.id),
      groupId,
      version,
      content,
      status: "review",
    };
  }

  async getCurrentSummary(groupId: string): Promise<StoredSummary | null> {
    const group = await this.getGroup(groupId);
    if (!group?.activeSummaryId) return null;
    const { data, error } = await this.db
      .from("summary_versions")
      .select()
      .eq("id", group.activeSummaryId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          id: String(data.id),
          groupId: String(data.group_id),
          version: Number(data.version),
          content: data.content as TripSummary,
          status: data.status as StoredSummary["status"],
        }
      : null;
  }

  async recordSummaryApproval(input: {
    summaryId: string;
    participantId: string;
    approved: boolean;
  }): Promise<{ approvals: number; activeParticipants: number; reached: boolean }> {
    const { data: summary, error: summaryError } = await this.db
      .from("summary_versions")
      .select("group_id")
      .eq("id", input.summaryId)
      .single();
    if (summaryError) throw summaryError;
    const { error } = await this.db.from("summary_approvals").upsert(
      {
        summary_id: input.summaryId,
        participant_id: input.participantId,
        approved: input.approved,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "summary_id,participant_id" },
    );
    if (error) throw error;

    const participants = await this.getActiveParticipants(String(summary.group_id));
    const { count, error: countError } = await this.db
      .from("summary_approvals")
      .select("*", { count: "exact", head: true })
      .eq("summary_id", input.summaryId)
      .eq("approved", true)
      .in(
        "participant_id",
        participants.map((participant) => participant.id),
      );
    if (countError) throw countError;
    const approvals = count ?? 0;
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
    const { data, error } = await this.db
      .from("generated_plans")
      .upsert(
        plans.map((plan) => ({
          group_id: groupId,
          summary_id: summaryId,
          option_number: plan.optionNumber,
          content: plan,
        })),
        { onConflict: "group_id,summary_id,option_number" },
      )
      .select();
    if (error) throw error;
    await this.updateGroup(groupId, {
      status: "voting",
      votingClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      votingRound: 1,
      runoffOptions: [],
      reminderCount: 0,
    });
    return (data ?? []).map(mapPlan);
  }

  async getPlans(groupId: string): Promise<StoredPlan[]> {
    const { data, error } = await this.db
      .from("generated_plans")
      .select()
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const latestSummary = data?.[0]?.summary_id;
    return (data ?? [])
      .filter((row) => row.summary_id === latestSummary)
      .sort((a, b) => Number(a.option_number) - Number(b.option_number))
      .map(mapPlan);
  }

  async upsertVote(input: {
    groupId: string;
    participantId: string;
    optionNumber: number;
    round?: number;
  }): Promise<VoteResult> {
    const plans = await this.getPlans(input.groupId);
    const plan = plans.find(
      (candidate) => candidate.optionNumber === input.optionNumber,
    );
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
    const { error } = await this.db.from("votes").upsert(
      {
        group_id: input.groupId,
        participant_id: input.participantId,
        plan_id: plan.id,
        round,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id,participant_id,round" },
    );
    if (error) throw error;

    return this.getVoteResult(input.groupId, round);
  }

  async getVoteResult(groupId: string, round = 1): Promise<VoteResult> {
    const plans = await this.getPlans(groupId);
    const participants = await this.getActiveParticipants(groupId);
    const { data: votes, error: votesError } = await this.db
      .from("votes")
      .select("plan_id,participant_id")
      .eq("group_id", groupId)
      .eq("round", round)
      .in(
        "participant_id",
        participants.map((participant) => participant.id),
      );
    if (votesError) throw votesError;
    const tally = plans.map((candidate) => ({
      optionNumber: candidate.optionNumber,
      count: (votes ?? []).filter((vote) => vote.plan_id === candidate.id).length,
    }));
    const highest = Math.max(...tally.map((item) => item.count), 0);
    const tied = plans.filter(
      (candidate) =>
        tally.find((item) => item.optionNumber === candidate.optionNumber)?.count ===
        highest,
    );
    return {
      changed: true,
      activeParticipants: participants.length,
      votesCast: votes?.length ?? 0,
      tally,
      winner:
        votes?.length === participants.length && tied.length === 1 ? tied[0] : null,
      tied:
        votes?.length === participants.length && tied.length > 1 ? tied : [],
    };
  }

  async getMemory(waId: string): Promise<StoredPreference[]> {
    const { data, error } = await this.db
      .from("reusable_preferences")
      .select("tag,weight,confidence")
      .eq("wa_id", waId)
      .order("weight", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      participantId: waId,
      tag: String(row.tag) as InterestTag,
      weight: Number(row.weight),
      confidence: Number(row.confidence),
    }));
  }

  async forgetPreference(waId: string, tag: string): Promise<number> {
    const { data, error } = await this.db
      .from("reusable_preferences")
      .delete()
      .eq("wa_id", waId)
      .eq("tag", tag)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  }

  async forgetParticipant(waId: string): Promise<void> {
    const { error: memoryError } = await this.db
      .from("reusable_preferences")
      .delete()
      .eq("wa_id", waId);
    if (memoryError) throw memoryError;

    const { data: participants, error: participantError } = await this.db
      .from("participants")
      .select("id")
      .eq("wa_id", waId);
    if (participantError) throw participantError;
    const participantIds = (participants ?? []).map((row) => String(row.id));
    if (participantIds.length > 0) {
      const { error } = await this.db
        .from("preference_evidence")
        .delete()
        .in("participant_id", participantIds);
      if (error) throw error;
    }
  }

  async enqueueWebhook(input: {
    eventKey: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<boolean> {
    const { error } = await this.db.from("webhook_events").insert({
      event_key: input.eventKey,
      event_type: input.eventType,
      payload: input.payload,
    });
    if (error?.code === "23505") return false;
    if (error) throw error;
    return true;
  }

  async getPendingWebhooks(limit = 20): Promise<QueuedWebhook[]> {
    const { data, error } = await this.db
      .from("webhook_events")
      .select("id,event_key,event_type,payload,attempts")
      .in("status", ["pending", "failed"])
      .lte("available_at", new Date().toISOString())
      .order("created_at")
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: String(row.id),
      eventKey: String(row.event_key),
      eventType: String(row.event_type),
      payload: row.payload as Record<string, unknown>,
      attempts: Number(row.attempts),
    }));
  }

  async markWebhookProcessed(id: string): Promise<void> {
    const { error } = await this.db
      .from("webhook_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", id);
    if (error) throw error;
  }

  async markWebhookFailed(id: string, errorMessage: string): Promise<void> {
    const { data } = await this.db
      .from("webhook_events")
      .select("attempts")
      .eq("id", id)
      .single();
    const attempts = Number(data?.attempts ?? 0) + 1;
    const delaySeconds = Math.min(3600, 2 ** attempts * 15);
    const { error } = await this.db
      .from("webhook_events")
      .update({
        status: "failed",
        attempts,
        last_error: errorMessage.slice(0, 1000),
        available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  }

  async getDashboardSnapshot(): Promise<{
    groups: StoredGroup[];
    participants: number;
    pendingEvents: number;
    plans: number;
  }> {
    const [
      { data: groups, error: groupsError },
      { count: participants, error: participantsError },
      { count: pendingEvents, error: pendingError },
      { count: plans, error: plansError },
    ] = await Promise.all([
      this.db.from("whatsapp_groups").select().order("created_at", { ascending: false }),
      this.db.from("participants").select("*", { count: "exact", head: true }),
      this.db
        .from("webhook_events")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "failed"]),
      this.db.from("generated_plans").select("*", { count: "exact", head: true }),
    ]);
    if (groupsError) throw groupsError;
    if (participantsError) throw participantsError;
    if (pendingError) throw pendingError;
    if (plansError) throw plansError;
    return {
      groups: (groups ?? []).map(mapGroup),
      participants: participants ?? 0,
      pendingEvents: pendingEvents ?? 0,
      plans: plans ?? 0,
    };
  }
}
