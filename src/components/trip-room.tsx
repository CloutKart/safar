"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedPlan } from "@/lib/domain";
import type {
  MemberAvailability,
  MessageHeard,
  ReactionSummary,
  ThreadMessage,
} from "@/lib/store/types";
import type { RoomState, RoomSummary } from "@/lib/trip/room";
import type { FreeWindow } from "@/lib/trip/availability";
import { vibesLabel } from "@/lib/trip/vibe";
import { VibeStage } from "@/components/vibe-scene";
import { JourneyMapHeader } from "@/components/journey-map";
import { lookupCoords } from "@/lib/cityCoords";
import { fetchWeather, type WeatherSummary } from "@/lib/weather";

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
  | { type: "typing"; who: string; on: boolean }
  | { type: "refresh" };

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

// A subtle buzz on key actions — the tactile layer that makes it feel like an
// app, not a webpage. No-ops where unsupported (desktop, iOS Safari).
function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw if called without a user gesture; ignore.
    }
  }
}

function photoLabel(type: "hero" | "popular" | "hidden_gem" | "culture"): string {
  return type === "hidden_gem"
    ? "Hidden gem"
    : type === "culture"
      ? "Food"
      : "Popular";
}

// Display labels for the internal interest tags — surfaces the marketed wording
// ("slow travel", "heritage") so the chips read the way the group spoke.
const TAG_LABEL: Record<string, string> = {
  relaxation: "slow travel",
  culture: "heritage",
};
function interestLabel(tag: string): string {
  return TAG_LABEL[tag] ?? tag.replace(/-/g, " ");
}

// One-token rendering of a parsed trip fact for the "Safar heard" chip.
function heardFactLabel(kind: string, value: unknown): string | null {
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  const inr = (raw: string) => `₹${Number(raw).toLocaleString("en-IN")}`;
  switch (kind) {
    case "origin":
      return `📍 from ${text}`;
    case "destination":
      return `🎯 ${text}`;
    case "exclude_destination":
      return `🚫 ${text}`;
    case "start_date":
      return `🗓 ${text}`;
    case "end_date":
      return `→ ${text}`;
    case "duration_days":
      return `🗓 ${text} days`;
    case "budget_max":
      return `💰 ≤ ${inr(text)}`;
    case "budget_min":
      return `💰 ≥ ${inr(text)}`;
    case "transport":
      return `🚗 ${text}`;
    case "restriction":
      return `⚠ ${text}`;
    default:
      return null;
  }
}

// "2026-06-18" + "2026-06-22" → "Jun 18–22".
function fmtRange(startISO: string, endISO: string): string {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const left = start.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  if (startISO === endISO) return left;
  const right =
    end.getMonth() === start.getMonth()
      ? String(end.getDate())
      : end.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${left}–${right}`;
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
const IconSearch = (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

// The trip's five legible stages. A mid-conversation joiner can orient at a
// glance — and first-timers learn the app's model ("oh, we're still planning").
const STAGES = ["Chatting", "Summarized", "Planning", "Voted", "Done"] as const;
function stageIndex(status: RoomState["status"]): number {
  switch (status) {
    case "summary_review":
      return 1;
    case "researching":
      return 2;
    case "voting":
      return 3;
    case "completed":
    case "archived":
      return 4;
    default:
      return 0; // forming / listening
  }
}
function StageBar({ status }: { status: RoomState["status"] }) {
  const active = stageIndex(status);
  return (
    <div className="stage-bar" role="group" aria-label="Trip progress">
      {STAGES.map((label, index) => {
        const phase = index < active ? "done" : index === active ? "current" : "upcoming";
        return (
          <div key={label} className={`stage stage-${phase}`} aria-current={index === active}>
            {index < STAGES.length - 1 && <span className="stage-line" />}
            <span className="stage-dot">{index < active ? "✓" : index + 1}</span>
            <span className="stage-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
// Live "voting closes in …" pill — the deadline urgency that actually gets
// groups to decide. Ticks client-side; the cron tallies the result on expiry.
function Countdown({ closesAt }: { closesAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);
  const remaining = new Date(closesAt).getTime() - now;
  const urgent = remaining <= 60 * 60 * 1000;
  return (
    <div className={`vote-countdown${urgent ? " urgent" : ""}`} role="timer">
      <span className="vote-countdown-dot" />
      {remaining <= 0
        ? "Voting is closing — tallying now…"
        : `Voting closes in ${formatRemaining(remaining)}`}
    </div>
  );
}

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
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  const [replyTo, setReplyTo] = useState<{ id: string; author: string; text: string } | null>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [memberPopFor, setMemberPopFor] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchPos, setSearchPos] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{
    x: number;
    y: number;
    el: HTMLElement;
    timer: ReturnType<typeof setTimeout> | null;
    moved: boolean;
  } | null>(null);

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
          haptic([0, 22]); // Safar replied
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
      } else if (payload.type === "refresh") {
        void refetchState();
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
  }, [sorted.length, state.plans.length]);

  // Photo lightbox: close on Escape, and lock background scroll while open.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightbox]);

  // In-room search: message ids whose text contains the term (case-insensitive).
  const searchHits = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [] as string[];
    return sorted
      .filter((message) => (message.text ?? "").toLowerCase().includes(q))
      .map((message) => message.id);
  }, [sorted, searchTerm]);
  const activeHitId =
    searchHits.length > 0 ? searchHits[searchPos % searchHits.length] : null;

  // Scroll the current search hit into view.
  useEffect(() => {
    if (!searchOpen || !activeHitId) return;
    const safe =
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(activeHitId) : activeHitId;
    document
      .querySelector(`[data-mid="${safe}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [searchOpen, activeHitId]);

  // Close the member-preference popover on Escape or an outside click.
  useEffect(() => {
    if (!memberPopFor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMemberPopFor(null);
    };
    const onClick = () => setMemberPopFor(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [memberPopFor]);

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

  // Prefill + focus the composer (used by action chips and the slash menu);
  // scroll the thread to the plans. These query the DOM rather than holding a
  // React ref so the chip/menu closures don't trip the "no ref during render" rule.
  const prefill = useCallback((value: string) => {
    setText(value);
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(".composer-input")?.focus(),
    );
  }, []);
  const scrollToPlans = useCallback(() => {
    const log = document.querySelector(".chat-log");
    log?.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, []);
  // Track which card is centred in the mobile carousel for the dot indicator.
  const onCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || el.children.length === 0) return;
    const cardWidth = el.scrollWidth / el.children.length;
    setActiveCard(Math.round(el.scrollLeft / cardWidth));
  }, []);

  // Quote a message into the composer (swipe-right, or Reply in the sheet).
  const startReply = useCallback((message: ThreadMessage) => {
    const author =
      message.participantId === null ? "Safar" : message.displayName ?? "Traveller";
    setReplyTo({ id: message.id, author, text: (message.text ?? "").slice(0, 140) });
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(".composer-input")?.focus(),
    );
  }, []);

  // Touch gestures on a message: right-swipe → reply, long-press → action sheet.
  const onMsgTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>, message: ThreadMessage) => {
      const point = event.touches[0];
      const el = event.currentTarget;
      const timer = setTimeout(() => {
        haptic(18);
        setSheetFor(message.id);
        if (touchRef.current) touchRef.current.timer = null;
      }, 450);
      touchRef.current = { x: point.clientX, y: point.clientY, el, timer, moved: false };
    },
    [],
  );
  const onMsgTouchMove = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const ref = touchRef.current;
    if (!ref) return;
    const point = event.touches[0];
    const dx = point.clientX - ref.x;
    const dy = point.clientY - ref.y;
    if (!ref.moved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) ref.moved = true;
    if (ref.moved && ref.timer) {
      clearTimeout(ref.timer);
      ref.timer = null;
    }
    if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
      ref.el.style.transition = "none";
      ref.el.style.transform = `translateX(${Math.min(dx, 72)}px)`;
    }
  }, []);
  const onMsgTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>, message: ThreadMessage) => {
      const ref = touchRef.current;
      if (!ref) return;
      if (ref.timer) clearTimeout(ref.timer);
      const point = event.changedTouches[0];
      const dx = point.clientX - ref.x;
      const dy = point.clientY - ref.y;
      ref.el.style.transition = "transform .2s ease";
      ref.el.style.transform = "";
      if (dx > 56 && Math.abs(dy) < 40) {
        haptic(12);
        startReply(message);
      }
      touchRef.current = null;
    },
    [startReply],
  );

  async function sendDraft(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending || !participantId || !displayName) return;
    haptic(8); // sent
    // A swipe-reply quotes the message inline (there's no separate threading model).
    const outgoing = replyTo ? `> ${replyTo.author}: ${replyTo.text}\n${body}` : body;
    setText("");
    setReplyTo(null);
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
        text: outgoing,
        occurredAt: new Date().toISOString(),
        reactions: [],
      });
      return next;
    });
    setSending(true);
    try {
      await postMessage(outgoing);
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

  // Nudge members who haven't voted: a prefilled share (native sheet → WhatsApp).
  async function nudge() {
    haptic(8);
    const url = window.location.href;
    const text = `We still need your vote on our trip plans 👉 ${url}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Safar — vote on our trip", text, url });
        return;
      } catch {
        // cancelled or unsupported; fall through to wa.me
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  // Voting is open as soon as plans exist (mirrors the server) — don't wait for
  // the group row's status to catch up to "voting", which can lag on Supabase.
  const votingOpen = state.plans.length > 0 && state.status !== "completed";
  const votable = (option: number) =>
    votingOpen &&
    (state.runoffOptions.length === 0 || state.runoffOptions.includes(option));

  const tallyFor = (option: number) =>
    state.vote?.tally.find((item) => item.optionNumber === option)?.count ?? 0;

  function castVote(option: number) {
    if (!votable(option)) return;
    haptic([0, 14]); // vote cast
    setMyVote(option);
    void postMessage(`vote ${option}`);
  }

  // One PlanCard renderer, shared by the desktop side panel and the mobile
  // in-chat feed, so plans (photos + per-stop pricing) show on every screen.
  const renderPlan = (plan: GeneratedPlan) => (
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
      tripDates={state.tripDates}
      onVote={() => postMessage(`vote ${plan.optionNumber}`)}
      onOpenPhoto={(url, alt) => setLightbox({ url, alt })}
    />
  );

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

  // Contextual next-step chips, driven purely by the room's stage.
  const actionChips: { label: string; onClick: () => void }[] = [];
  if (state.status === "summary_review") {
    actionChips.push({ label: "Approve ✓", onClick: () => postMessage("approve") });
    actionChips.push({ label: "Change budget →", onClick: () => prefill("Our budget is ₹") });
  } else if (votingOpen) {
    actionChips.push({ label: "Vote now →", onClick: scrollToPlans });
    actionChips.push({ label: "Set deadline →", onClick: () => prefill("/deadline ") });
  } else if (state.status === "completed") {
    actionChips.push({ label: "Share trip →", onClick: () => void copyLink() });
  }

  // Slash menu: typing "/" surfaces Safar's commands, so the app self-documents.
  const slashCommands: { cmd: string; desc: string; run: () => void }[] = [
    { cmd: "/summarize", desc: "Post the current trip brief", run: () => postMessage("Safar, summarize the trip") },
    { cmd: "/approve", desc: "Approve the summary to start planning", run: () => postMessage("approve") },
    { cmd: "/vote", desc: "Vote for a plan (1–3)", run: () => prefill("vote ") },
    { cmd: "/deadline", desc: "Set when voting closes (e.g. 6h)", run: () => prefill("/deadline ") },
    { cmd: "/budget", desc: "Tell Safar your budget", run: () => prefill("Our budget is ₹") },
    { cmd: "/remember", desc: "See what Safar remembers about you", run: () => postMessage("what do you remember about me") },
    { cmd: "/help", desc: "List what you can say", run: () => postMessage("help") },
  ];
  const slashOpen = /^\/[a-z]*$/i.test(text);
  const slashMatches = slashOpen
    ? slashCommands.filter((item) => item.cmd.slice(1).startsWith(text.slice(1).toLowerCase()))
    : [];
  const activeSlash = Math.min(slashIndex, Math.max(0, slashMatches.length - 1));
  const runSlash = (item: { run: () => void }) => {
    setText("");
    setSlashIndex(0);
    item.run();
  };
  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!slashOpen || slashMatches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((i) => (i + 1) % slashMatches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runSlash(slashMatches[activeSlash]);
    } else if (event.key === "Escape") {
      setText("");
    }
  };

  return (
    <main className="room" data-vibe={state.vibe}>
      <header className="island">
        <VibeStage vibes={state.vibes} />
        {state.status === "completed" && state.vote?.winner && (
          <JourneyMapHeader
            departure={state.departureCities[0] ?? null}
            destinationSlug={state.vote.winner.content.destinationSlug}
            destinationName={state.vote.winner.content.destinationName}
          />
        )}
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
              onClick={() => {
                setSearchOpen((open) => !open);
                setSearchTerm("");
              }}
              aria-label="Search messages"
            >
              {IconSearch}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={copyLink}
              aria-label="Share trip link"
            >
              {copied ? IconCheck : IconShare}
            </button>
          </div>
          {searchOpen && (
            <div className="room-search">
              <input
                className="room-search-input"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setSearchPos(0);
                }}
                placeholder="Search this chat…"
                autoFocus
              />
              <span className="room-search-count">
                {searchHits.length > 0 ? `${(searchPos % searchHits.length) + 1}/${searchHits.length}` : "0/0"}
              </span>
              <button
                type="button"
                className="icon-btn ghost"
                aria-label="Previous match"
                disabled={searchHits.length === 0}
                onClick={() => setSearchPos((p) => (p - 1 + searchHits.length) % searchHits.length)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn ghost"
                aria-label="Next match"
                disabled={searchHits.length === 0}
                onClick={() => setSearchPos((p) => (p + 1) % searchHits.length)}
              >
                ↓
              </button>
            </div>
          )}
          <div className="island-presence">
            <div className="avatar-stack">
              {participants.slice(0, 4).map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="stack-avatar"
                  style={{ background: avatarColor(member.id) }}
                  title={`${member.name} — tap for preferences`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMemberPopFor((open) => (open === member.id ? null : member.id));
                  }}
                >
                  {initial(member.name)}
                </button>
              ))}
              {participants.length > 4 && (
                <span className="stack-avatar more">+{participants.length - 4}</span>
              )}
              {participants.length === 0 && (
                <span className="stack-avatar more">+0</span>
              )}
            </div>
            {memberPopFor &&
              (() => {
                const member = participants.find((p) => p.id === memberPopFor);
                if (!member) return null;
                const colour = avatarColor(member.id);
                const prefs = state.summary?.memberPreferences.find(
                  (m) => m.participantId === memberPopFor,
                );
                const likes = prefs?.interests.filter((i) => i.weight > 0) ?? [];
                const avoids = prefs?.interests.filter((i) => i.weight < 0) ?? [];
                return (
                  <div className="member-pop" onClick={(event) => event.stopPropagation()}>
                    <p className="member-pop-name">
                      <span className="summary-dot" style={{ background: colour }} />
                      {member.name}
                    </p>
                    {likes.length === 0 && avoids.length === 0 ? (
                      <p className="member-pop-empty">Nothing captured yet.</p>
                    ) : (
                      <div className="member-pop-tags">
                        {likes.map((interest) => (
                          <span
                            key={interest.tag}
                            className="ptag"
                            style={{ borderColor: colour, color: colour }}
                          >
                            {interestLabel(interest.tag)}
                          </span>
                        ))}
                        {avoids.map((interest) => (
                          <span key={interest.tag} className="ptag avoid">
                            ✕ {interestLabel(interest.tag)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
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

      <StageBar status={state.status} />
      {votingOpen && state.votingClosesAt && (
        <Countdown closesAt={state.votingClosesAt} />
      )}
      {(() => {
        // Manual pin wins; otherwise auto-surface the decided winner.
        const pinnedText = pinnedMessageId
          ? messages.get(pinnedMessageId)?.text ?? null
          : null;
        const winnerText =
          !pinnedText && state.status === "completed" && state.vote?.winner
            ? `Winner: ${state.vote.winner.content.destinationName}`
            : null;
        const text = pinnedText ?? winnerText;
        if (!text) return null;
        return (
          <div className="pinned-rail">
            <span className="pinned-icon">{pinnedText ? "📌" : "🏆"}</span>
            <span className="pinned-text">{text}</span>
            {pinnedText && (
              <button
                type="button"
                className="pinned-x"
                onClick={() => setPinnedMessageId(null)}
                aria-label="Unpin"
              >
                ✕
              </button>
            )}
          </div>
        );
      })()}

      <div className="room-body">
        <section className="chat-panel">
          <div className="chat-log" ref={chatRef}>
            {sorted.map((message) => {
              const bot = message.participantId === null;
              const mine = message.participantId === participantId;
              const tone = bot ? "bot" : mine ? "out" : "in";
              const pending = message.id.startsWith("pending:");
              const hit = message.id === activeHitId;
              return (
                <article
                  key={message.id}
                  data-mid={message.id}
                  className={`msg msg-${tone}${pending ? " msg-pending" : ""}${hit ? " msg-hit" : ""}`}
                  onTouchStart={(event) => onMsgTouchStart(event, message)}
                  onTouchMove={onMsgTouchMove}
                  onTouchEnd={(event) => onMsgTouchEnd(event, message)}
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
                    {!bot && !pending && message.heard && (
                      <HeardChip heard={message.heard} />
                    )}
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
            {state.summary &&
              state.summary.memberPreferences.length > 0 &&
              ["summary_review", "researching"].includes(state.status) && (
                <SummaryCard summary={state.summary} />
              )}
            {state.summary && state.summary.conflicts.length > 0 && (
              <ConflictCards
                conflicts={state.summary.conflicts}
                onAsk={(conflict) =>
                  void postMessage(`Safar, how should we resolve: ${conflict}`)
                }
                onDiscuss={(conflict) => prefill(`About "${conflict}", I think `)}
              />
            )}
            {!hasPlans && participantId && (
              <AvailabilityPicker
                slug={slug}
                myId={participantId}
                displayName={displayName}
                availability={state.availability}
                freeWindow={state.availabilityWindow}
              />
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
                    {votingOpen &&
                      state.vote &&
                      state.vote.votesCast < state.vote.activeParticipants && (
                        <button type="button" className="nudge-btn" onClick={nudge}>
                          Nudge
                        </button>
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
            {hasPlans && (
              <div className="plans-feed">
                {state.plans.length > 1 && (
                  <button
                    type="button"
                    className="cmp-toggle"
                    onClick={() => setCompareOpen((open) => !open)}
                  >
                    {compareOpen ? "← Back to cards" : "Compare side-by-side"}
                  </button>
                )}
                {compareOpen ? (
                  <PlanCompare plans={state.plans} />
                ) : (
                  <>
                    <div
                      className="plan-carousel"
                      ref={carouselRef}
                      onScroll={onCarouselScroll}
                    >
                      {state.plans.map(renderPlan)}
                    </div>
                    {state.plans.length > 1 && (
                      <div className="carousel-dots" aria-hidden="true">
                        {state.plans.map((plan, index) => (
                          <span
                            key={plan.optionNumber}
                            className={`carousel-dot${index === activeCard ? " active" : ""}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="quick-actions">
            {["forming", "listening", "summary_review"].includes(state.status) && (
              <button type="button" onClick={() => postMessage("Safar, summarize the trip")}>
                Summarize the trip
              </button>
            )}
            {actionChips.map((chip) => (
              <button
                type="button"
                key={chip.label}
                className={chip.label.startsWith("Approve") ? "primary" : ""}
                onClick={chip.onClick}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {replyTo && (
            <div className="reply-preview">
              <div className="reply-preview-body">
                <span className="reply-preview-author">Replying to {replyTo.author}</span>
                <span className="reply-preview-text">{replyTo.text}</span>
              </div>
              <button
                type="button"
                className="reply-preview-x"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
              >
                ✕
              </button>
            </div>
          )}
          <form className="composer" onSubmit={sendDraft}>
            {slashOpen && slashMatches.length > 0 && (
              <div className="slash-menu" role="listbox" aria-label="Commands">
                {slashMatches.map((item, index) => (
                  <button
                    type="button"
                    key={item.cmd}
                    role="option"
                    aria-selected={index === activeSlash}
                    className={`slash-item${index === activeSlash ? " active" : ""}`}
                    onMouseEnter={() => setSlashIndex(index)}
                    onClick={() => runSlash(item)}
                  >
                    <span className="slash-cmd">{item.cmd}</span>
                    <span className="slash-desc">{item.desc}</span>
                  </button>
                ))}
              </div>
            )}
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
              onKeyDown={onComposerKeyDown}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type your message… (/ for commands)"
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
          <div className="plans-head">
            <h2>Plans &amp; voting</h2>
            {state.plans.length > 1 && (
              <button
                type="button"
                className="cmp-toggle"
                onClick={() => setCompareOpen((open) => !open)}
              >
                {compareOpen ? "Cards" : "Compare"}
              </button>
            )}
          </div>
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
          {compareOpen ? (
            <PlanCompare plans={state.plans} />
          ) : (
            state.plans.map(renderPlan)
          )}
        </aside>
      </div>

      {sheetFor && messages.get(sheetFor) && (
        <div className="sheet-backdrop" onClick={() => setSheetFor(null)}>
          <div
            className="action-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Message actions"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-emojis">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => {
                    void react(sheetFor, emoji);
                    setSheetFor(null);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="sheet-action"
              onClick={() => {
                const message = messages.get(sheetFor);
                if (message) startReply(message);
                setSheetFor(null);
              }}
            >
              ↩ Reply
            </button>
            <button
              type="button"
              className="sheet-action"
              onClick={() => {
                setPinnedMessageId(sheetFor);
                setSheetFor(null);
              }}
            >
              📌 Pin
            </button>
            <button
              type="button"
              className="sheet-action"
              onClick={() => {
                void navigator.clipboard?.writeText(messages.get(sheetFor)?.text ?? "");
                setSheetFor(null);
              }}
            >
              ⧉ Copy
            </button>
            <button
              type="button"
              className="sheet-cancel"
              onClick={() => setSheetFor(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="lightbox-close"
            aria-label="Close photo"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- external dynamic photo URL */}
          <img src={lightbox.url} alt={lightbox.alt} onClick={(event) => event.stopPropagation()} />
          <p className="lightbox-caption">{lightbox.alt}</p>
        </div>
      )}
    </main>
  );
}

const inrShort = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const hiddenGemCount = (plan: GeneratedPlan) =>
  plan.itinerary.flatMap((day) => day.stops).filter((stop) => stop.kind === "hidden-gem").length;

// Lines the three plans up attribute-by-attribute so voters can compare budget
// vs budget, Day 1 vs Day 1, match vs match — the best cell per row highlighted.
function PlanCompare({ plans }: { plans: GeneratedPlan[] }) {
  const maxBest = (values: number[]) => Math.max(...values);
  const minBest = (values: number[]) => Math.min(...values);
  const rows: {
    label: string;
    values: number[];
    best: ((values: number[]) => number) | null;
    render: (value: number) => string;
  }[] = [
    { label: "Match", values: plans.map((p) => p.matchScore), best: maxBest, render: (v) => `${v}%` },
    { label: "Per person", values: plans.map((p) => p.cost.likelyInr), best: minBest, render: inrShort },
    { label: "Days", values: plans.map((p) => p.itinerary.length), best: null, render: (v) => `${v}` },
    { label: "Hidden gems", values: plans.map(hiddenGemCount), best: maxBest, render: (v) => `${v}` },
    { label: "Transport", values: plans.map((p) => p.cost.breakdown?.transportInr ?? 0), best: minBest, render: inrShort },
    { label: "Stay", values: plans.map((p) => p.cost.breakdown?.stayInr ?? 0), best: minBest, render: inrShort },
    { label: "Food", values: plans.map((p) => p.cost.breakdown?.foodInr ?? 0), best: minBest, render: inrShort },
  ];
  const maxDays = Math.max(...plans.map((p) => p.itinerary.length));
  return (
    <div className="plan-compare">
      <div
        className="cmp-grid"
        style={{ gridTemplateColumns: `auto repeat(${plans.length}, minmax(0, 1fr))` }}
      >
        <div className="cmp-corner" />
        {plans.map((plan) => (
          <div className="cmp-head" key={plan.optionNumber}>
            <span className="cmp-num">{plan.optionNumber}</span>
            {plan.destinationName}
          </div>
        ))}
        {rows.map((row) => {
          const best = row.best ? row.best(row.values) : null;
          return (
            <Fragment key={row.label}>
              <div className="cmp-label">{row.label}</div>
              {row.values.map((value, index) => (
                <div
                  key={index}
                  className={`cmp-cell${best != null && value === best ? " cmp-best" : ""}`}
                >
                  {row.render(value)}
                </div>
              ))}
            </Fragment>
          );
        })}
        {Array.from({ length: maxDays }).map((_, dayIndex) => (
          <Fragment key={`day-${dayIndex}`}>
            <div className="cmp-label">Day {dayIndex + 1}</div>
            {plans.map((plan, index) => (
              <div key={index} className="cmp-cell cmp-day">
                {plan.itinerary[dayIndex]?.title ?? "—"}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// Expected weather for the travel window, fetched lazily per card (Open-Meteo,
// free/keyless). A practical decision-driver right on the plan.
function PlanWeather({
  slug,
  name,
  start,
  end,
}: {
  slug: string;
  name: string;
  start: string | null;
  end: string | null;
}) {
  const [wx, setWx] = useState<WeatherSummary | null>(null);
  useEffect(() => {
    const coords = lookupCoords(slug) ?? lookupCoords(name);
    if (!coords || !start) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    fetchWeather(coords, start, end ?? start, controller.signal).then((data) => {
      if (!cancelled && data) setWx(data);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, name, start, end]);
  if (!wx) return null;
  const icon = wx.rainPct >= 50 ? "🌧️" : wx.rainPct >= 20 ? "🌦️" : "☀️";
  return (
    <p className="plan-weather">
      <span className="wx-icon">{icon}</span>
      {wx.lowC}–{wx.highC}°C · {wx.rainPct}% rain
      {wx.typical && <span className="wx-typical">typical</span>}
    </p>
  );
}

// Match score as a ring that fills from 0 on mount, so 92% vs 74% lands
// viscerally rather than as a bare number.
function MatchRing({ score }: { score: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const radius = 15.5;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="match-ring" title={`${score}% match`} aria-label={`${score}% match`}>
      <svg viewBox="0 0 40 40" width="38" height="38">
        <circle className="match-ring-track" cx="20" cy="20" r={radius} />
        <circle
          className="match-ring-fill"
          cx="20"
          cy="20"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
        />
      </svg>
      <span className="match-ring-num">{score}</span>
    </span>
  );
}

function PlanCard({
  plan,
  groupSize,
  votes,
  activeParticipants,
  canVote,
  winner,
  tripDates,
  onVote,
  onOpenPhoto,
}: {
  plan: GeneratedPlan;
  groupSize: number;
  votes: number;
  activeParticipants: number;
  canVote: boolean;
  winner: boolean;
  tripDates: { start: string | null; end: string | null };
  onVote: () => void;
  onOpenPhoto: (url: string, alt: string) => void;
}) {
  const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;
  const [timeline, setTimeline] = useState(false);
  return (
    <article className={`plan-card${winner ? " winner" : ""}`} data-angle={plan.angle}>
      <header>
        <span className="plan-num">{plan.optionNumber}</span>
        <div>
          <h3>{plan.title}</h3>
          <p>
            {plan.destinationName} · {plan.angle}
          </p>
          <span className="plan-cost-line">
            {inr(plan.cost.lowInr)}–{inr(plan.cost.highInr)}
            <small>{plan.cost.live ? "live" : "estimate"}</small>
          </span>
        </div>
        {plan.matchScore > 0 && <MatchRing score={plan.matchScore} />}
      </header>
      {plan.destinationImages && plan.destinationImages.length > 0 && (
        <div className="plan-photos">
          {plan.destinationImages.map((image) => {
            const alt = `${plan.destinationName} — ${image.type.replace("_", " ")}`;
            return (
              <button
                type="button"
                className="plan-photo"
                key={image.url}
                onClick={() => onOpenPhoto(image.url, alt)}
                aria-label={`Enlarge photo: ${alt}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- external dynamic photo URLs */}
                <img src={image.url} alt={alt} loading="lazy" />
                {image.type !== "hero" && (
                  <span className="plan-photo-tag">{photoLabel(image.type)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <PlanWeather
        slug={plan.destinationSlug}
        name={plan.destinationName}
        start={tripDates.start}
        end={tripDates.end}
      />
      {plan.whyRecommended && (
        <p className="plan-why">
          <strong>Why this:</strong> {plan.whyRecommended}
        </p>
      )}
      <p className="plan-summary">{plan.summary}</p>
      {plan.itinerary.length > 1 && (
        <button
          type="button"
          className="timeline-toggle"
          onClick={() => setTimeline((on) => !on)}
        >
          {timeline ? "List view" : "Timeline view"}
        </button>
      )}
      <div className={`plan-days${timeline ? " timeline" : ""}`}>
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

// What Safar extracted, per member — colour-coded so the group can see (and
// correct) how it read each person. Makes the preference detection visible.
function SummaryCard({ summary }: { summary: RoomSummary }) {
  return (
    <div className="summary-card">
      <p className="summary-card-head">📋 What Safar heard</p>
      <ul className="summary-members">
        {summary.memberPreferences.map((member) => {
          const colour = avatarColor(member.participantId);
          const likes = member.interests.filter((i) => i.weight > 0);
          const avoids = member.interests.filter((i) => i.weight < 0);
          return (
            <li key={member.participantId} className="summary-member">
              <span className="summary-dot" style={{ background: colour }} />
              <span className="summary-name">{member.displayName}</span>
              <span className="summary-tags">
                {likes.map((interest) => (
                  <span
                    key={interest.tag}
                    className="ptag"
                    style={{ borderColor: colour, color: colour }}
                  >
                    {interestLabel(interest.tag)}
                  </span>
                ))}
                {avoids.map((interest) => (
                  <span key={interest.tag} className="ptag avoid">
                    ✕ {interestLabel(interest.tag)}
                  </span>
                ))}
                {member.interests.length === 0 && (
                  <span className="summary-none">no preferences yet</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {summary.hardConstraints.length > 0 && (
        <p className="summary-constraints">
          Must-haves: {summary.hardConstraints.join(" · ")}
        </p>
      )}
    </div>
  );
}

// State-derived cards for each open conflict, with one-tap ways to resolve it.
function ConflictCards({
  conflicts,
  onAsk,
  onDiscuss,
}: {
  conflicts: string[];
  onAsk: (conflict: string) => void;
  onDiscuss: (conflict: string) => void;
}) {
  return (
    <div className="conflict-cards">
      {conflicts.map((conflict, index) => (
        <div className="conflict-card" key={index}>
          <p className="conflict-text">⚠ {conflict}</p>
          <div className="conflict-actions">
            <button type="button" className="primary" onClick={() => onAsk(conflict)}>
              Ask Safar to resolve
            </button>
            <button type="button" onClick={() => onDiscuss(conflict)}>
              Discuss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Collapsible "Safar heard …" chip under a human message, showing the parsed
// facts + interest tags so extraction is transparent per message.
function HeardChip({ heard }: { heard: MessageHeard }) {
  const facts = heard.facts
    .map((fact) => heardFactLabel(fact.kind, fact.value))
    .filter((label): label is string => Boolean(label));
  const interests = heard.interests.map(interestLabel);
  if (facts.length === 0 && interests.length === 0) return null;
  return (
    <details className="heard-chip">
      <summary>Safar heard</summary>
      <div className="heard-body">
        {facts.map((fact, index) => (
          <span key={`f${index}`} className="heard-pill">
            {fact}
          </span>
        ))}
        {interests.length > 0 && (
          <span className="heard-pill">🏷 {interests.join(", ")}</span>
        )}
      </div>
    </details>
  );
}

// A compact month calendar: the current user marks the days they can't travel,
// saved on each tap; shows other members' blocked days and the common window.
function AvailabilityPicker({
  slug,
  myId,
  displayName,
  availability,
  freeWindow,
}: {
  slug: string;
  myId: string;
  displayName: string;
  availability: MemberAvailability[];
  freeWindow: FreeWindow | null;
}) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [mine, setMine] = useState<string[]>(
    () => availability.find((a) => a.participantId === myId)?.unavailableDates ?? [],
  );
  const [view, setView] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [saving, setSaving] = useState(false);

  const othersBlocked = useMemo(() => {
    const map = new Map<string, number>();
    for (const member of availability) {
      if (member.participantId === myId) continue;
      for (const date of member.unavailableDates) {
        map.set(date, (map.get(date) ?? 0) + 1);
      }
    }
    return map;
  }, [availability, myId]);

  const toggle = (iso: string) => {
    if (iso < todayISO) return;
    haptic(8);
    setMine((prev) => {
      const next = prev.includes(iso)
        ? prev.filter((d) => d !== iso)
        : [...prev, iso];
      setSaving(true);
      void fetch(`/api/trip/${slug}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: myId, displayName, unavailableDates: next }),
      }).finally(() => setSaving(false));
      return next;
    });
  };

  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const isoOf = (day: number) =>
    `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const step = (delta: number) =>
    setView((s) => {
      const m = s.m + delta;
      if (m < 0) return { y: s.y - 1, m: 11 };
      if (m > 11) return { y: s.y + 1, m: 0 };
      return { y: s.y, m };
    });

  return (
    <div className="avail">
      <div className="avail-head">
        <button type="button" onClick={() => step(-1)} aria-label="Previous month">
          ‹
        </button>
        <strong>{first.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</strong>
        <button type="button" onClick={() => step(1)} aria-label="Next month">
          ›
        </button>
      </div>
      <p className="avail-hint">
        Tap the days you <em>can’t</em> travel{saving ? " · saving…" : ""}
      </p>
      <div className="avail-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`dow${i}`} className="avail-dow">
            {d}
          </span>
        ))}
        {cells.map((day, index) => {
          if (day === null) return <span key={`e${index}`} />;
          const iso = isoOf(day);
          const past = iso < todayISO;
          const picked = mine.includes(iso);
          const others = othersBlocked.get(iso) ?? 0;
          return (
            <button
              type="button"
              key={iso}
              disabled={past}
              className={`avail-day${picked ? " mine" : ""}${others > 0 ? " others" : ""}${past ? " past" : ""}`}
              onClick={() => toggle(iso)}
              title={others > 0 ? `${others} other(s) unavailable` : undefined}
            >
              {day}
              {others > 0 && <span className="avail-mark" />}
            </button>
          );
        })}
      </div>
      {freeWindow ? (
        <p className="avail-window good">✅ Everyone free: {fmtRange(freeWindow.start, freeWindow.end)}</p>
      ) : (
        <p className="avail-window">Mark your dates to find a window everyone can make.</p>
      )}
    </div>
  );
}
