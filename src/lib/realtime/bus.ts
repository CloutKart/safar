import type { ReactionSummary, ThreadMessage } from "@/lib/store/types";
import { env } from "@/lib/env";

// Events pushed to every open browser tab in a trip room, in real time.
export type RoomEvent =
  | { type: "message"; message: ThreadMessage }
  | { type: "reaction"; messageId: string; reactions: ReactionSummary[] }
  | { type: "typing"; who: string; on: boolean };

// Mirror every event to a Supabase Realtime channel so it reaches tabs on other
// serverless instances / devices (the in-process bus only covers one instance).
function broadcastToSupabase(groupId: string, event: RoomEvent): void {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  void fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { topic: `room-${groupId}`, event: "room_event", payload: event, private: false },
      ],
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Best-effort; same-instance tabs already got it via the in-process bus.
  });
}

type Listener = (event: RoomEvent) => void;

// An in-process pub/sub keyed by groupId. Each SSE connection registers a
// listener here; outbound sends, inbound messages, and reactions publish to it.
// This keeps live updates self-hosted and dependency-free, and works with the
// memory store in local dev. (A multi-instance deployment would swap this for a
// shared broker such as Supabase Realtime — out of scope for Phase 1.)
const globalBus = globalThis as typeof globalThis & {
  __safarRoomListeners?: Map<string, Set<Listener>>;
};

function registry(): Map<string, Set<Listener>> {
  globalBus.__safarRoomListeners ??= new Map();
  return globalBus.__safarRoomListeners;
}

export function publishRoomEvent(groupId: string, event: RoomEvent): void {
  broadcastToSupabase(groupId, event);
  const listeners = registry().get(groupId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A single broken listener must not stop the others.
    }
  }
}

export function subscribeRoom(groupId: string, listener: Listener): () => void {
  const all = registry();
  let listeners = all.get(groupId);
  if (!listeners) {
    listeners = new Set();
    all.set(groupId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) all.delete(groupId);
  };
}
