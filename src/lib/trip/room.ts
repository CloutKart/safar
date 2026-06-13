import type { GeneratedPlan } from "@/lib/domain";
import { getStore } from "@/lib/store";
import type { StoredGroup, ThreadMessage, VoteResult } from "@/lib/store/types";
import { detectVibes, type Vibe } from "@/lib/trip/vibe";
import { tripTitle } from "@/lib/trip/title";

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
  summaryStatus: "review" | "approved" | "superseded" | null;
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
  const [thread, plans, summary] = await Promise.all([
    store.getThread(group.id),
    store.getPlans(group.id),
    store.getCurrentSummary(group.id),
  ]);
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
    summaryStatus: summary?.status ?? null,
    vibe: vibes[0],
    vibes,
    thread,
    plans: planContents,
    vote,
  };
}
