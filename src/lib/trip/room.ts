import type { GeneratedPlan, InterestTag } from "@/lib/domain";
import { getStore } from "@/lib/store";
import type {
  MemberAvailability,
  StoredGroup,
  ThreadMessage,
  VoteResult,
} from "@/lib/store/types";
import { detectVibes, type Vibe } from "@/lib/trip/vibe";
import { tripTitle } from "@/lib/trip/title";
import {
  commonFreeWindow,
  datesConflicting,
  type FreeWindow,
} from "@/lib/trip/availability";

// A member's extracted interests, keyed by waId so it lines up with the thread
// avatars on the client (the stored summary uses the internal participant id).
export interface RoomMemberPreference {
  participantId: string;
  displayName: string;
  interests: Array<{ tag: InterestTag; weight: number; confidence: number }>;
}

// The structured summary the client renders (preference cards, conflict cards).
export interface RoomSummary {
  memberPreferences: RoomMemberPreference[];
  conflicts: string[];
  hardConstraints: string[];
}

export interface RoomState {
  slug: string;
  groupId: string;
  subject: string;
  title: string;
  status: StoredGroup["status"];
  votingRound: number;
  runoffOptions: number[];
  votingClosesAt: string | null;
  // Where the group is travelling from — used by the journey map and chips.
  departureCities: string[];
  // Travel window — used for the per-plan weather lookup.
  tripDates: { start: string | null; end: string | null };
  summaryStatus: "review" | "approved" | "superseded" | null;
  // Structured summary for the transparency UI (null until one is built).
  summary: RoomSummary | null;
  // Each member's unavailable dates + the group's common free window.
  availability: MemberAvailability[];
  availabilityWindow: FreeWindow | null;
  vibe: Vibe;
  vibes: Vibe[];
  thread: ThreadMessage[];
  plans: GeneratedPlan[];
  vote: VoteResult | null;
}

// Single source of truth for the trip room snapshot, shared by the page's
// initial server render and the /state refetch endpoint the client polls on
// each incoming bot message.
export async function loadRoomState(slug: string): Promise<RoomState | null> {
  const store = getStore();
  const group = await store.getGroupByWaId(slug);
  if (!group) return null;
  const [thread, plans, summary, heard, availability, participants] =
    await Promise.all([
      store.getThread(group.id),
      store.getPlans(group.id),
      store.getCurrentSummary(group.id),
      store.getHeard(group.id),
      store.getAvailability(group.id),
      store.getActiveParticipants(group.id),
    ]);
  // Attach "Safar heard …" signals to each human message (keyed by wa id).
  const threadWithHeard: ThreadMessage[] = thread.map((message) => {
    const signals = heard.get(message.id);
    return signals ? { ...message, heard: signals } : message;
  });
  // Voting tallies are available whenever plans exist — not only once the group
  // row's status has caught up to "voting" (that write can lag behind savePlans
  // on Supabase). Deriving from plans keeps the panel correct on first load.
  const vote =
    plans.length > 0 || group.status === "completed"
      ? await store.getVoteResult(group.id, group.votingRound || 1)
      : null;
  const planContents = plans.map((plan) => plan.content);
  // One vibe set drives both the crossfading island scene and the title, so the
  // header reads consistently. Plan signals are capped (see vibe.ts) so a
  // blended group stays blended even after research lands on a place.
  const vibes = detectVibes({ summary: summary?.content, plans: planContents });
  // "Approved" = research has started or moved past it (the engine advances the
  // group out of summary_review only once a majority approves).
  const approved = ["researching", "voting", "completed"].includes(group.status);
  const title = tripTitle({
    subject: group.subject,
    summary: summary?.content ?? null,
    vibes,
    seed: slug,
    approved,
  });

  // Remap the stored summary's internal participant ids to waIds so the client
  // can match preference cards to avatars; fold any date clash into conflicts.
  const waById = new Map(participants.map((p) => [p.id, p.waId]));
  const availabilityWindow = commonFreeWindow(
    availability,
    summary?.content.dates.start ?? null,
  );
  let roomSummary: RoomSummary | null = null;
  if (summary) {
    const dateClashes = datesConflicting(
      availability,
      summary.content.dates.start,
      summary.content.dates.end,
    );
    const conflicts = [
      ...summary.content.conflicts,
      ...(dateClashes.length > 0
        ? [
            `Trip dates clash with a member's unavailable day${dateClashes.length > 1 ? "s" : ""} (${dateClashes.slice(0, 3).join(", ")})`,
          ]
        : []),
    ];
    roomSummary = {
      memberPreferences: summary.content.memberPreferences.map((member) => ({
        participantId: waById.get(member.participantId) ?? member.participantId,
        displayName: member.displayName,
        interests: member.interests,
      })),
      conflicts,
      hardConstraints: summary.content.hardConstraints,
    };
  }

  return {
    slug,
    groupId: group.id,
    subject: group.subject,
    title,
    status: group.status,
    votingRound: group.votingRound,
    runoffOptions: group.runoffOptions,
    votingClosesAt: group.votingClosesAt,
    departureCities: summary?.content.departureCities ?? [],
    tripDates: {
      start: summary?.content.dates.start ?? null,
      end: summary?.content.dates.end ?? null,
    },
    summaryStatus: summary?.status ?? null,
    summary: roomSummary,
    availability,
    availabilityWindow,
    vibe: vibes[0],
    vibes,
    thread: threadWithHeard,
    plans: planContents,
    vote,
  };
}
