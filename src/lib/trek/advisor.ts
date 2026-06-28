import { z } from "zod";
import type { Trek } from "@/lib/trek/schema";
import { estimateTrekDays } from "@/lib/trek/enrich";

// AI Trek Advisor — grounded free-text Q&A about a single trek. The LLM answers
// ONLY from the trek's own data + general trekking prudence; when it's
// unconfigured or over budget, a deterministic fallback handles the common
// intents from the same structured fields. Safety-critical specifics (emergency
// numbers, live conditions, medical clearance) are never fabricated.

export const AdvisorReplySchema = z.object({ answer: z.string().min(1) });

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Compact, factual context handed to the model (and mirrored by the fallback).
export function buildAdvisorContext(trek: Trek): string {
  const cc = trek.completionConfidence;
  const facts: Array<[string, unknown]> = [
    ["name", trek.name],
    ["where", `${trek.region || trek.state}, ${trek.state}`],
    ["difficulty", trek.difficulty],
    ["distanceKm", trek.distanceKm],
    ["elevationGainM", trek.elevationGainM],
    ["maxAltitudeM", trek.maxAltitudeM],
    ["onTrailHours", trek.durationHours],
    ["estimatedDays", estimateTrekDays(trek)],
    ["routeType", trek.routeType],
    ["bestMonths", trek.bestMonths.map((m) => MONTHS[m - 1]).join(", ")],
    ["permitRequired", trek.permitRequired],
    ["guideRecommended", trek.guideRecommended],
    ["completionByLevel", cc ? `beginner ${cc.beginnerPct}%, intermediate ${cc.intermediatePct}%, experienced ${cc.experiencedPct}%` : null],
    ["suitability", trek.suitability.join(", ")],
    ["water", trek.waterReliability ? `${trek.waterReliability.status}${trek.waterReliability.carryLitres ? `, carry ~${trek.waterReliability.carryLitres} L` : ""}` : null],
    ["permitsNote", trek.logistics?.permitsNote],
    ["connectivity", trek.logistics?.connectivity],
    ["nearestMedical", trek.logistics?.nearestMedical],
    ["rescueDifficulty", trek.logistics?.rescueDifficulty != null ? `${trek.logistics.rescueDifficulty}/5 — ${trek.logistics.rescueNote}` : null],
    ["support", trek.logistics ? `porters ${trek.logistics.porters}, mules ${trek.logistics.mules}` : null],
    ["wildlife", trek.hazards?.wildlife.join(", ")],
    ["riverCrossings", trek.hazards?.riverCrossings],
    ["nearestTown", trek.emergency?.nearestTown],
    ["evacNote", trek.emergency?.evacNote],
  ];
  return facts
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export const ADVISOR_SYSTEM = `You are Safar's trek advisor — a calm, experienced Indian trek leader helping someone decide on ONE specific trek. Answer their question using ONLY the trek facts provided plus general trekking prudence. Be concise and practical (2–4 sentences), warm but honest.

Hard rules:
- Never invent specifics that aren't in the data — no phone numbers, exact prices, live snow/weather, or precise dates.
- For any health/medical question (asthma, heart, pregnancy, knees, age), give the relevant altitude/exertion context from the data and tell them to consult a doctor. NEVER tell them it is safe for their condition.
- For safety-critical things, add a short "verify locally" caveat.
- If the data doesn't cover the question, say what you would check and where (e.g. ask a local guide / the forest office), rather than guessing.
Output JSON: {"answer": string}.`;

// ── Deterministic fallback (no LLM) ──────────────────────────────────────────
function lvl(cc: NonNullable<Trek["completionConfidence"]>, q: string): number {
  if (/beginner|first|never|new to/i.test(q)) return cc.beginnerPct;
  if (/experienced|expert|seasoned/i.test(q)) return cc.experiencedPct;
  return cc.intermediatePct;
}

export function fallbackAnswer(trek: Trek, question: string): string {
  const q = question.toLowerCase();
  const tail = "Verify current conditions and permits locally before you go.";

  if (/asthma|heart|pregnan|medical|condition|knee|surgery|diabet|bp|blood pressure|old|elderly|age/i.test(q)) {
    const alt = trek.maxAltitudeM
      ? `It tops out at ${trek.maxAltitudeM} m${trek.maxAltitudeM >= 3500 ? " — high enough for AMS to matter" : ""}, graded ${trek.difficulty}.`
      : `It's graded ${trek.difficulty}.`;
    return `I can't clear you medically — please check with a doctor, especially for altitude and sustained exertion. ${alt} ${tail}`;
  }
  if (/permit|permission|booking|book/i.test(q)) {
    return trek.permitRequired
      ? `Yes — a permit is required. ${trek.logistics?.permitsNote ?? "Arrange it at the trailhead/forest office."} ${tail}`
      : `No special permit is needed for the standard route. ${trek.logistics?.permitsNote ?? ""} ${tail}`.trim();
  }
  if (/how (long|many days)|days|duration|time needed|2 days|3 days|weekend/i.test(q)) {
    const d = estimateTrekDays(trek);
    return `Plan ~${d} day${d > 1 ? "s" : ""} for this one (${trek.distanceKm ?? "?"} km, ${trek.routeType ?? "trek"}${trek.durationHours ? `, ~${trek.durationHours} h on-trail per day` : ""}). ${tail}`;
  }
  if (/never|beginner|first time|first trek|new to trek/i.test(q) && trek.completionConfidence) {
    const pct = trek.completionConfidence.beginnerPct;
    const fit = trek.suitability.includes("first-trek");
    return `${fit ? "Yes, this is a reasonable first trek." : "This is a step up for a first-timer."} It's graded ${trek.difficulty}, and about ${pct}% of beginners finish it comfortably${trek.guideRecommended ? "; a guide is advised" : ""}. ${tail}`;
  }
  if (/kid|child|family|parent|mom|dad|elderly/i.test(q)) {
    const kidOk = trek.suitability.includes("kids");
    return `${kidOk ? "It's family-friendly." : "It's not really a kids/relaxed-pace trek."} Grade ${trek.difficulty}, max ${trek.maxAltitudeM ?? "?"} m${trek.maxAltitudeM && trek.maxAltitudeM >= 3000 ? " (mind the altitude for older or younger trekkers)" : ""}. ${tail}`;
  }
  if (/water|drink|refill/i.test(q)) {
    const w = trek.waterReliability;
    return w
      ? `Water is ${w.status.replace(/-/g, " ")}${w.carryLitres ? `; carry about ${w.carryLitres} L` : ""}. Treat what you collect. ${tail}`
      : `Carry enough water and treat any you collect. ${tail}`;
  }
  if (/budget|cost|price|money|cheap|expensive|₹|rupee/i.test(q)) {
    return `I can't quote exact prices — they vary by season and operator. Costs to plan for: travel to ${trek.emergency?.nearestTown ?? "the trailhead"}, stay, ${trek.guideRecommended ? "a guide, " : ""}${trek.logistics?.porters === "yes" ? "optional porters, " : ""}food and a buffer. Ask local operators for current rates. ${tail}`;
  }
  if (/hard|difficult|tough|fit|fitness|how (hard|tough)/i.test(q)) {
    const cc = trek.completionConfidence;
    const pctLine = cc ? ` About ${lvl(cc, q)}% of trekkers at that level finish it comfortably.` : "";
    return `It's graded ${trek.difficulty}${trek.elevationGainM ? `, ~${trek.elevationGainM} m of climbing` : ""}${trek.maxAltitudeM ? ` to ${trek.maxAltitudeM} m` : ""}.${pctLine} ${tail}`;
  }
  if (/when|season|month|best time/i.test(q)) {
    const months = trek.bestMonths.map((m) => MONTHS[m - 1]).join(", ");
    return `Best months are ${months || "season-dependent — check locally"}. ${tail}`;
  }
  // Generic pointer.
  return `Here's the shape of it: a ${trek.difficulty} ${trek.routeType ?? "trek"} in ${trek.region || trek.state}, max ${trek.maxAltitudeM ?? "?"} m, best in ${trek.bestMonths.map((m) => MONTHS[m - 1]).join(", ") || "season"}. For specifics beyond this, a local guide or the forest office is your best source. ${tail}`;
}
