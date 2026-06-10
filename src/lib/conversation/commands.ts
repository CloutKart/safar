export type ConversationCommand =
  | { type: "summary" }
  | { type: "approve" }
  | { type: "reject" }
  | { type: "vote"; option: number }
  | { type: "memory" }
  | { type: "forget_all" }
  | { type: "forget_preference"; preference: string }
  | { type: "nickname"; name: string }
  | { type: "help" }
  | { type: "none" };

export function parseCommand(text: string): ConversationCommand {
  const cleaned = text.trim();
  if (
    /\b(safar[,:]?\s*)?(summari[sz]e|summary|trip ka summary|recap)\b/i.test(
      cleaned,
    )
  ) {
    return { type: "summary" };
  }
  if (/^(approve|approved|looks good|sahi hai|theek hai|final)\b/i.test(cleaned)) {
    return { type: "approve" };
  }
  if (/^(reject|not approved|galat hai|wrong summary)\b/i.test(cleaned)) {
    return { type: "reject" };
  }
  const vote = cleaned.match(/^(?:vote\s*)?([1-3])$/i);
  if (vote) return { type: "vote", option: Number(vote[1]) };
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
