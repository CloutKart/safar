export type ConversationCommand =
  | { type: "summary" }
  | { type: "approve" }
  | { type: "reject" }
  | { type: "vote"; option: number }
  | { type: "memory" }
  | { type: "forget_all" }
  | { type: "forget_preference"; preference: string }
  | { type: "nickname"; name: string }
  | { type: "deadline"; minutes: number | null }
  | { type: "help" }
  | { type: "none" };

// Parse a relative voting deadline like "6h", "2 days", "90m", "tomorrow",
// "tonight" into minutes. Returns null when it can't be understood.
function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^tomorrow\b/.test(t)) return 24 * 60;
  if (/^tonight\b/.test(t)) return 6 * 60;
  const match = t.match(
    /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b/,
  );
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2];
  if (/^mi?n/.test(unit) || unit === "m") return n;
  if (/^h/.test(unit)) return n * 60;
  return n * 24 * 60;
}

export function parseCommand(text: string): ConversationCommand {
  const cleaned = text.trim();
  if (
    /\b(safar[,:]?\s*)?(summari[sz]e|summary|trip ka summary|recap)\b/i.test(
      cleaned,
    )
  ) {
    return { type: "summary" };
  }
  if (
    /^(approve|approved|looks good|lgtm|sahi hai|theek hai|pakka|done|chalega|chalta hai|haan bhai|haan ji|bilkul|final)\b/i.test(
      cleaned,
    )
  ) {
    return { type: "approve" };
  }
  if (/^(reject|not approved|galat hai|wrong summary)\b/i.test(cleaned)) {
    return { type: "reject" };
  }
  const vote = cleaned.match(/^(?:vote\s*)?([1-3])$/i);
  if (vote) return { type: "vote", option: Number(vote[1]) };
  const deadline = cleaned.match(/^\/?deadline\b\s*(.*)$/i);
  if (deadline) return { type: "deadline", minutes: parseDuration(deadline[1]) };
  if (/what do you remember about me|meri preferences kya/i.test(cleaned)) {
    return { type: "memory" };
  }
  if (/^forget me$/i.test(cleaned)) return { type: "forget_all" };
  const forget = cleaned.match(/^forget\s+(.+)$/i);
  if (forget) {
    return { type: "forget_preference", preference: forget[1].trim().toLowerCase() };
  }
  const nickname = cleaned.match(
    /^(?:call me|my name is|mera naam|mujhe)\s+([A-Za-z][A-Za-z .'-]{1,30})$/i,
  );
  if (nickname) return { type: "nickname", name: nickname[1].trim() };
  if (/^(?:safar[,:]?\s*)?help$/i.test(cleaned)) return { type: "help" };
  return { type: "none" };
}
