"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedPlan } from "@/lib/domain";
import type { ReactionSummary, ThreadMessage } from "@/lib/store/types";
import type { RoomState } from "@/lib/trip/room";
import { vibesLabel } from "@/lib/trip/vibe";
import { VibeStage } from "@/components/vibe-scene";

// Client-side Supabase Realtime — cross-device live updates + typing. Falls back
// to SSE when not configured. Created once per tab.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let realtimeClient: SupabaseClient | null = null;
function getRealtimeClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnon) return null;
  realtimeClient ??= createClient(supabaseUrl, supabaseAnon, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return realtimeClient;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥"];

const STATUS_LABEL: Record<RoomState["status"], string> = {
  forming: "Forming",
  listening: "Listening",
  summary_review: "Reviewing summary",
  researching: "Researching plans",
  voting: "Voting open",
  completed: "Trip decided",
  archived: "Archived",
};

const AVATAR_COLORS = [
  "#2f7d5b", "#3b6ea5", "#b9603f", "#8a5cb0",
  "#c08a2e", "#3a8f8f", "#a8506e", "#5a7d3a",
];

type RoomEvent =
  | { type: "message"; message: ThreadMessage }
  | { type: "reaction"; messageId: string; reactions: ReactionSummary[] }
  | { type: "typing"; who: string; on: boolean };

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initial(name: string | null): string {
  return (name ?? "T").trim().slice(0, 1).toUpperCase() || "T";
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function photoLabel(type: "hero" | "popular" | "hidden_gem" | "culture"): string {
  return type === "hidden_gem"
    ? "Hidden gem"
    : type === "culture"
      ? "Food"
      : "Popular";
}

// The bot speaks light markdown (*bold*). Render that inline, preserving newlines.
function renderText(text: string): ReactNode {
  return text.split(/(\*[^*]+\*)/g).map((part, index) =>
    part.length > 2 && part.startsWith("*") && part.endsWith("*") ? (
      <strong key={index}>{part.slice(1, -1)}</strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

const IconBack = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const IconShare = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
    <path d="M16 6l-4-4-4 4" />
    <path d="M12 2v13" />
  </svg>
);
const IconCheck = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IconSend = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);
const IconPlus = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconPoll = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 20V11M12 20V4M19 20v-6" />
  </svg>
);

export function TripRoom({
  slug,
  initialState,
}: {
  slug: string;
  initialState: RoomState;
}) {
  const [state, setState] = useState<RoomState>(initialState);
  const [messages, setMessages] = useState<Map<string, ThreadMessage>>(
    () => new Map(initialState.thread.map((message) => [message.id, message])),
  );
  const [identity, setIdentity] = useState<{
    participantId: string | null;
    displayName: string;
  }>({ participantId: null, displayName: "" });
  const { participantId, displayName } = identity;
  const groupId = initialState.groupId;
  const [draftName, setDraftName] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [typingActors, setTypingActors] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [myVote, setMyVote] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // Browser-local identity: a persistent id + a display name asked once. Loaded
  // after hydration so the server and first client render agree (both gate).
  useEffect(() => {
    let pid = localStorage.getItem("safar:pid");
    if (!pid) {
      pid = crypto.randomUUID();
      localStorage.setItem("safar:pid", pid);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of a browser-only external store
    setIdentity({
      participantId: pid,
      displayName: localStorage.getItem("safar:name") ?? "",
    });
  }, []);

  const mergeMessages = useCallback((incoming: ThreadMessage[]) => {
    setMessages((prev) => {
      const next = new Map(prev);
      for (const message of incoming) {
        next.set(message.id, message);
        // Drop the optimistic placeholder once the real message confirms.
        if (message.participantId) {
          for (const [id, pending] of next) {
            if (
              id.startsWith("pending:") &&
              pending.participantId === message.participantId &&
              pending.text === message.text
            ) {
              next.delete(id);
            }
          }
        }
      }
      return next;
    });
  }, []);

  const refetchState = useCallback(async () => {
    const response = await fetch(`/api/trip/${slug}/state`, { cache: "no-store" });
    if (!response.ok) return;
    const fresh = (await response.json()) as RoomState;
    setState(fresh);
    mergeMessages(fresh.thread);
  }, [slug, mergeMessages]);

  // One handler for both transports (Supabase Realtime broadcast and SSE).
  const handleRoomEvent = useCallback(
    (payload: RoomEvent) => {
      if (payload.type === "message") {
        mergeMessages([payload.message]);
        setTypingActors((prev) =>
          prev.filter((name) => name !== (payload.message.displayName ?? "")),
        );
        if (payload.message.participantId === null) {
          setBotThinking(false);
          setTypingActors((prev) => prev.filter((name) => name !== "Safar"));
          void refetchState();
        }
      } else if (payload.type === "reaction") {
        setMessages((prev) => {
          const existing = prev.get(payload.messageId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(payload.messageId, { ...existing, reactions: payload.reactions });
          return next;
        });
      } else if (payload.type === "typing") {
        setTypingActors((prev) => {
          const others = prev.filter((name) => name !== payload.who);
          return payload.on ? [...others, payload.who] : others;
        });
      }
    },
    [mergeMessages, refetchState],
  );

  // Cross-device live updates via Supabase Realtime (works across serverless
  // instances). Falls back to SSE when Supabase isn't configured.
  const client = getRealtimeClient();
  useEffect(() => {
    if (!client) return;
    const channel = client.channel(`room-${groupId}`);
    channel.on("broadcast", { event: "room_event" }, ({ payload }) => {
      handleRoomEvent(payload as RoomEvent);
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") void refetchState();
    });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [client, groupId, handleRoomEvent, refetchState]);

  useEffect(() => {
    if (client) return; // Realtime handles it
    const source = new EventSource(`/api/trip/${slug}/stream`);
    source.onopen = () => void refetchState();
    source.onmessage = (event) =>
      handleRoomEvent(JSON.parse(event.data) as RoomEvent);
    return () => source.close();
  }, [client, slug, handleRoomEvent, refetchState]);

  const sorted = useMemo(
    () =>
      [...messages.values()].sort((a, b) =>
        a.occurredAt.localeCompare(b.occurredAt),
      ),
    [messages],
  );

  // Distinct human participants (for the avatar stack + people count).
  const participants = useMemo(() => {
    const byId = new Map<string, string>();
    for (const message of sorted) {
      if (message.participantId) {
        byId.set(message.participantId, message.displayName ?? "Traveller");
      }
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [sorted]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [sorted.length]);

  const ready = Boolean(participantId && displayName);

  const postMessage = useCallback(
    async (body: string) => {
      if (!participantId || !displayName) return;
      // If the server takes a beat (the bot is summarizing or planning), show a
      // "Safar is typing" indicator until it responds.
      const thinkingTimer = setTimeout(() => setBotThinking(true), 700);
      try {
        const response = await fetch(`/api/trip/${slug}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId, displayName, text: body }),
        });
        if (!response.ok) throw new Error("Message failed to send");
        void refetchState();
      } finally {
        clearTimeout(thinkingTimer);
        setBotThinking(false);
      }
    },
    [participantId, displayName, slug, refetchState],
  );

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastTyping = useCallback(
    (on: boolean) => {
      const channel = channelRef.current;
      if (!channel || !displayName) return;
      void channel.send({
        type: "broadcast",
        event: "room_event",
        payload: { type: "typing", who: displayName, on },
      });
    },
    [displayName],
  );
  const onTyping = useCallback(() => {
    broadcastTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => broadcastTyping(false), 2500);
  }, [broadcastTyping]);

  async function sendDraft(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending || !participantId || !displayName) return;
    setText("");
    setEmojiOpen(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    broadcastTyping(false);
    // Optimistic: render the message instantly, before the server round-trip.
    // It's reconciled away when the real message arrives over SSE / refetch.
    const pendingId = `pending:${crypto.randomUUID()}`;
    setMessages((prev) => {
      const next = new Map(prev);
      next.set(pendingId, {
        id: pendingId,
        participantId,
        displayName,
        text: body,
        occurredAt: new Date().toISOString(),
        reactions: [],
      });
      return next;
    });
    setSending(true);
    try {
      await postMessage(body);
    } catch {
      // Roll back the placeholder and restore the draft so they can retry.
      setMessages((prev) => {
        const next = new Map(prev);
        next.delete(pendingId);
        return next;
      });
      setText(body);
    } finally {
      setSending(false);
    }
  }

  function saveName(event: FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (name.length < 2) return;
    localStorage.setItem("safar:name", name);
    setIdentity((prev) => ({ ...prev, displayName: name }));
  }

  async function react(messageId: string, emoji: string) {
    setPaletteFor(null);
    if (!participantId || !displayName) return;
    const response = await fetch(`/api/trip/${slug}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, displayName, messageId, emoji }),
    });
    if (!response.ok) return;
    const { reactions } = (await response.json()) as { reactions: ReactionSummary[] };
    setMessages((prev) => {
      const existing = prev.get(messageId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(messageId, { ...existing, reactions });
      return next;
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; ignore.
    }
  }

  const votable = (option: number) =>
    state.status === "voting" &&
    (state.runoffOptions.length === 0 || state.runoffOptions.includes(option));

  const tallyFor = (option: number) =>
    state.vote?.tally.find((item) => item.optionNumber === option)?.count ?? 0;

  function castVote(option: number) {
    if (!votable(option)) return;
    setMyVote(option);
    void postMessage(`vote ${option}`);
  }

  if (!ready) {
    return (
      <main className="room-gate" data-vibe={initialState.vibe}>
        <div className="gate-scene">
          <VibeStage vibes={initialState.vibes} />
          <div className="island-veil" />
        </div>
        <form className="gate-card" onSubmit={saveName}>
          <span className="gate-eyebrow">{vibesLabel(initialState.vibes)}</span>
          <h1>{initialState.title}</h1>
          <p>Pick a name your group will recognise. No account, no app.</p>
          <label htmlFor="name">Display name</label>
          <input
            id="name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="e.g. Asha"
            minLength={2}
            maxLength={40}
            required
            autoFocus
          />
          <button type="submit">Enter the room</button>
          <small>
            Trip-relevant messages build the brief. Raw chat is deleted 30 days
            after the trip is completed.
          </small>
        </form>
      </main>
    );
  }

  const hasPlans = state.plans.length > 0;

  return (
    <main className="room" data-vibe={state.vibe}>
      <header className="island">
        <VibeStage vibes={state.vibes} />
        <div className="island-veil" />
        <div className="island-content">
          <div className="island-bar">
            <Link className="icon-btn" href="/" aria-label="Back to home">
              {IconBack}
            </Link>
            <div className="island-heading">
              <h1>{state.title}</h1>
              <span className="vibe-tag">{vibesLabel(state.vibes)}</span>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={copyLink}
              aria-label="Share trip link"
            >
              {copied ? IconCheck : IconShare}
            </button>
          </div>
          <div className="island-presence">
            <div className="avatar-stack">
              {participants.slice(0, 4).map((member) => (
                <span
                  key={member.id}
                  className="stack-avatar"
                  style={{ background: avatarColor(member.id) }}
                  title={member.name}
                >
                  {initial(member.name)}
                </span>
              ))}
              {participants.length > 4 && (
                <span className="stack-avatar more">+{participants.length - 4}</span>
              )}
              {participants.length === 0 && (
                <span className="stack-avatar more">+0</span>
              )}
            </div>
            <div className="presence-meta">
              <span className="presence-status">
                <span className="presence-dot" />
                {STATUS_LABEL[state.status]}
              </span>
              <span className="presence-count">
                {participants.length} {participants.length === 1 ? "person" : "people"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="room-body">
        <section className="chat-panel">
          <div className="chat-log" ref={chatRef}>
            {sorted.map((message) => {
              const bot = message.participantId === null;
              const mine = message.participantId === participantId;
              const tone = bot ? "bot" : mine ? "out" : "in";
              const pending = message.id.startsWith("pending:");
              return (
                <article
                  key={message.id}
                  className={`msg msg-${tone}${pending ? " msg-pending" : ""}`}
                >
                  {!mine && (
                    <span
                      className={`msg-avatar${bot ? " bot" : ""}`}
                      style={
                        bot ? undefined : { background: avatarColor(message.participantId!) }
                      }
                    >
                      {bot ? "S" : initial(message.displayName)}
                    </span>
                  )}
                  <div className="msg-main">
                    {!mine && (
                      <span className="msg-author">
                        {bot ? "Safar" : (message.displayName ?? "Traveller")}
                      </span>
                    )}
                    <div className="bubble">
                      {message.text && (
                        <span className="bubble-text">{renderText(message.text)}</span>
                      )}
                      <span className="bubble-time">
                        {pending ? "sending…" : timeLabel(message.occurredAt)}
                      </span>
                      {message.reactions.length > 0 && (
                        <div className="bubble-reactions">
                          {message.reactions.map((reaction) => {
                            const owned = reaction.participantIds.includes(
                              participantId ?? "",
                            );
                            return (
                              <button
                                type="button"
                                key={reaction.emoji}
                                className={`reaction-chip${owned ? " owned" : ""}`}
                                onClick={() => react(message.id, reaction.emoji)}
                              >
                                {reaction.emoji} {reaction.count}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="react-add">
                      <button
                        type="button"
                        className="reaction-toggle"
                        aria-label="Add reaction"
                        onClick={() =>
                          setPaletteFor(paletteFor === message.id ? null : message.id)
                        }
                      >
                        ☺
                      </button>
                      {paletteFor === message.id && (
                        <div className="reaction-palette">
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              type="button"
                              key={emoji}
                              onClick={() => react(message.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {(botThinking || typingActors.includes("Safar")) && (
              <article className="msg msg-bot msg-typing">
                <span className="msg-avatar bot">S</span>
                <div className="msg-main">
                  <span className="msg-author">Safar</span>
                  <div className="bubble typing-bubble" aria-label="Safar is typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </article>
            )}
            {typingActors.filter((name) => name !== "Safar" && name !== displayName)
              .length > 0 && (
              <p className="human-typing">
                {typingActors
                  .filter((name) => name !== "Safar" && name !== displayName)
                  .join(", ")}{" "}
                {typingActors.filter((name) => name !== "Safar" && name !== displayName)
                  .length === 1
                  ? "is typing…"
                  : "are typing…"}
              </p>
            )}
            {sorted.length === 0 && (
              <p className="chat-empty">
                Say hello and start sharing dates, budgets, and the kind of trip
                you want. Safar is listening.
              </p>
            )}
            {hasPlans && (
              <div className="poll-inline">
                <div className="poll">
                  <div className="poll-head">
                    {IconPoll}
                    <strong>
                      {state.status === "completed" ? "Final result" : "Tap to vote"}
                    </strong>
                    {state.vote && (
                      <span className="poll-meta">
                        {state.vote.votesCast}/{state.vote.activeParticipants} voted
                        {state.status === "voting" && state.runoffOptions.length > 0
                          ? ` · runoff ${state.runoffOptions.join(" & ")}`
                          : ""}
                      </span>
                    )}
                  </div>
                  {state.plans.map((plan) => {
                    const votes = tallyFor(plan.optionNumber);
                    const active = state.vote?.activeParticipants ?? 0;
                    const share = active > 0 ? Math.round((votes / active) * 100) : 0;
                    const mine = myVote === plan.optionNumber;
                    const won =
                      state.status === "completed" &&
                      state.vote?.winner?.optionNumber === plan.optionNumber;
                    return (
                      <button
                        type="button"
                        key={plan.optionNumber}
                        className={`poll-option${mine ? " mine" : ""}${won ? " won" : ""}`}
                        disabled={!votable(plan.optionNumber) && state.status !== "completed"}
                        onClick={() => castVote(plan.optionNumber)}
                      >
                        <span className="poll-bar" style={{ width: `${share}%` }} />
                        <span className="poll-num">{plan.optionNumber}</span>
                        <span className="poll-title">{plan.title}</span>
                        {(mine || won) && <span className="poll-check">✓</span>}
                        <span className="poll-count">{votes}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="quick-actions">
            <button type="button" onClick={() => postMessage("Safar, summarize the trip")}>
              Summarize the trip
            </button>
            {state.status === "summary_review" && (
              <button
                type="button"
                className="primary"
                onClick={() => postMessage("approve")}
              >
                Approve summary
              </button>
            )}
          </div>

          <form className="composer" onSubmit={sendDraft}>
            <div className="composer-plus">
              <button
                type="button"
                className="icon-btn ghost"
                aria-label="Insert emoji"
                onClick={() => setEmojiOpen((open) => !open)}
              >
                {IconPlus}
              </button>
              {emojiOpen && (
                <div className="reaction-palette up">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => setText((value) => value + emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              className="composer-input"
              onInput={onTyping}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type your message…"
              maxLength={4000}
            />
            <button
              type="submit"
              className="send-btn"
              disabled={sending || !text.trim()}
              aria-label="Send message"
            >
              {IconSend}
            </button>
          </form>
        </section>

        <aside className={`plans-panel${hasPlans ? "" : " empty"}`}>
          <h2>Plans &amp; voting</h2>
          {!hasPlans && (
            <p className="plans-empty">
              Once the group approves a summary, Safar researches and posts three
              plans here to vote on.
            </p>
          )}
          {state.vote && (
            <p className="vote-status">
              {state.vote.votesCast}/{state.vote.activeParticipants} voted
              {state.status === "voting" && state.runoffOptions.length > 0
                ? ` · runoff: ${state.runoffOptions.join(" & ")}`
                : ""}
            </p>
          )}
          {state.plans.map((plan) => (
            <PlanCard
              key={plan.optionNumber}
              plan={plan}
              groupSize={Math.max(1, participants.length)}
              votes={tallyFor(plan.optionNumber)}
              activeParticipants={state.vote?.activeParticipants ?? 0}
              canVote={votable(plan.optionNumber)}
              winner={
                state.status === "completed" &&
                state.vote?.winner?.optionNumber === plan.optionNumber
              }
              onVote={() => postMessage(`vote ${plan.optionNumber}`)}
            />
          ))}
        </aside>
      </div>
    </main>
  );
}

function PlanCard({
  plan,
  groupSize,
  votes,
  activeParticipants,
  canVote,
  winner,
  onVote,
}: {
  plan: GeneratedPlan;
  groupSize: number;
  votes: number;
  activeParticipants: number;
  canVote: boolean;
  winner: boolean;
  onVote: () => void;
}) {
  const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;
  return (
    <article className={`plan-card${winner ? " winner" : ""}`} data-angle={plan.angle}>
      <header>
        <span className="plan-num">{plan.optionNumber}</span>
        <div>
          <h3>{plan.title}</h3>
          <p>
            {plan.destinationName} · {plan.angle}
            {plan.matchScore > 0 && (
              <span className="plan-match">{plan.matchScore}% match</span>
            )}
          </p>
        </div>
        <span className="plan-cost">
          {inr(plan.cost.lowInr)}–{inr(plan.cost.highInr)}
          <small>{plan.cost.live ? "live" : "estimate"}</small>
        </span>
      </header>
      {plan.destinationImages && plan.destinationImages.length > 0 && (
        <div className="plan-photos">
          {plan.destinationImages.map((image) => (
            <div className="plan-photo" key={image.url}>
              {/* eslint-disable-next-line @next/next/no-img-element -- external dynamic photo URLs */}
              <img
                src={image.url}
                alt={`${plan.destinationName} — ${image.type.replace("_", " ")}`}
                loading="lazy"
              />
              {image.type !== "hero" && (
                <span className="plan-photo-tag">{photoLabel(image.type)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {plan.whyRecommended && (
        <p className="plan-why">
          <strong>Why this:</strong> {plan.whyRecommended}
        </p>
      )}
      <p className="plan-summary">{plan.summary}</p>
      <div className="plan-days">
        {plan.itinerary.map((day) => (
          <div className="plan-day" key={day.day}>
            <p className="plan-day-title">
              <strong>Day {day.day}</strong> · {day.title}
            </p>
            <ul>
              {day.stops.map((stop, index) => (
                <li key={index} className={`stop stop-${stop.kind}`}>
                  <span className="stop-name">{stop.name}</span>
                  {stop.kind === "hidden-gem" && (
                    <span className="badge badge-hidden">💎 Hidden gem</span>
                  )}
                  {stop.kind === "sight" && (
                    <span className="badge badge-popular">Popular</span>
                  )}
                  {stop.note && <span className="stop-note"> — {stop.note}</span>}
                  {stop.approxInr != null && (
                    <span className="stop-cost">~{inr(stop.approxInr)}</span>
                  )}
                </li>
              ))}
            </ul>
            {day.stay && (
              <p className="plan-stay">
                🛏 {day.stay.name}
                {day.stay.area ? `, ${day.stay.area}` : ""}
                {day.stay.approxInrPerNight != null
                  ? ` · ${inr(day.stay.approxInrPerNight)}/night`
                  : ""}
              </p>
            )}
          </div>
        ))}
      </div>
      {plan.cost.breakdown && (
        <div className="plan-breakdown">
          <span>Transport {inr(plan.cost.breakdown.transportInr)}</span>
          <span>Stay {inr(plan.cost.breakdown.stayInr)}</span>
          <span>Activities {inr(plan.cost.breakdown.activitiesInr)}</span>
          <span>Food {inr(plan.cost.breakdown.foodInr)}</span>
        </div>
      )}
      <p className="plan-totals">
        <span>
          <strong>{inr(plan.cost.likelyInr)}</strong>/person
        </span>
        {groupSize > 1 && (
          <span>
            · Group total <strong>{inr(plan.cost.likelyInr * groupSize)}</strong> ({groupSize})
          </span>
        )}
        <span className={`conf conf-${plan.cost.live ? "high" : "med"}`}>
          {plan.cost.live ? "High confidence" : "Medium confidence"}
        </span>
      </p>
      {plan.preferenceCoverage.length > 0 && (
        <p className="plan-meta">Matches: {plan.preferenceCoverage.join(", ")}</p>
      )}
      {plan.tradeoffs.length > 0 && (
        <p className="plan-meta muted">Trade-offs: {plan.tradeoffs.join("; ")}</p>
      )}
      <footer>
        <button type="button" onClick={onVote} disabled={!canVote}>
          {winner ? "Winner" : `Vote for ${plan.optionNumber}`}
        </button>
        <span className="plan-tally" aria-label="votes">
          {"●".repeat(votes)}
          {"○".repeat(Math.max(0, activeParticipants - votes))} {votes}
        </span>
      </footer>
      {plan.sources.length > 0 && (
        <div className="plan-sources">
          {plan.sources.slice(0, 4).map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.publisher}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
