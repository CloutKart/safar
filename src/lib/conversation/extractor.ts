import {
  interestTags,
  MessageExtractionSchema,
  type InterestTag,
  type MessageExtraction,
} from "@/lib/domain";
import { generateStructured } from "@/lib/ai/client";
import { env } from "@/lib/env";

const interestAliases: Record<InterestTag, string[]> = {
  adventure: ["adventure", "adventurous", "thrill", "thrilling"],
  trekking: ["trek", "trekking", "hike", "hiking"],
  haunted: ["haunted", "horror", "ghost", "bhoot", "paranormal"],
  cafes: ["cafe", "cafes", "café", "coffee", "cafe hopping"],
  food: ["food", "street food", "khana", "foodie", "local cuisine"],
  nightlife: ["nightlife", "party", "partying", "club", "clubs"],
  relaxation: ["relax", "relaxing", "chill", "peaceful", "shaanti", "aram"],
  culture: ["culture", "heritage", "history", "historic", "museum"],
  wildlife: ["wildlife", "safari", "birds", "birding", "jungle"],
  photography: ["photography", "photos", "pictures", "instagrammable"],
  beaches: ["beach", "beaches", "sea", "ocean"],
  mountains: ["mountain", "mountains", "hills", "pahad"],
  "road-trip": ["road trip", "roadtrip", "drive"],
  spiritual: ["spiritual", "temple", "meditation", "ashram"],
  caves: ["cave", "caves", "caving"],
  camping: ["camp", "camping", "tent"],
  rafting: ["rafting", "river rafting", "kayak", "kayaking"],
};

const firstPersonPattern =
  /\b(i|i'm|i am|i'd|me|my|we|our|main|mai|mujhe|mujhko|mera|meri|hum|humein|apna)\b/i;
const negativePattern =
  /\b(no|not|don't|dont|hate|avoid|nahi|nahin|mat|pasand nahi|bilkul nahi)\b/i;
const jokePattern = /\b(jk|joking|mazak|mazaak|lol kidding|just kidding)\b/i;

function detectLanguage(text: string): MessageExtraction["language"] {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/\b(kya|hai|hain|mujhe|nahi|chalo|karna|jana|yaar|bhai|budget)\b/i.test(text)) {
    return "hinglish";
  }
  return /[a-z]/i.test(text) ? "en" : "unknown";
}

function extractBudget(text: string): MessageExtraction["facts"] {
  const match = text.match(
    /(?:₹|rs\.?|inr)\s*([\d,]+)(?:\s*(?:-|to|se)\s*(?:₹|rs\.?|inr)?\s*([\d,]+))?/i,
  );
  if (!match) return [];
  const first = Number(match[1].replaceAll(",", ""));
  const second = match[2] ? Number(match[2].replaceAll(",", "")) : first;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return [];
  return [
    {
      kind: "budget_min",
      value: Math.min(first, second),
      confidence: 0.88,
      isHard: negativePattern.test(text) || /\b(max|maximum|under|within)\b/i.test(text),
    },
    {
      kind: "budget_max",
      value: Math.max(first, second),
      confidence: 0.88,
      isHard: /\b(max|maximum|under|within|budget)\b/i.test(text),
    },
  ];
}

function extractDuration(text: string): MessageExtraction["facts"] {
  const match = text.match(/\b(\d{1,2})\s*(?:day|days|din)\b/i);
  if (!match) return [];
  return [
    {
      kind: "duration_days",
      value: Number(match[1]),
      confidence: 0.9,
      isHard: /\b(only|maximum|max|sirf)\b/i.test(text),
    },
  ];
}

function extractDates(text: string): MessageExtraction["facts"] {
  const isoDates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(
    (match) => match[1],
  );
  if (isoDates.length === 0) return [];
  return [
    {
      kind: "start_date",
      value: isoDates[0],
      confidence: 0.95,
      isHard: true,
    },
    ...(isoDates[1]
      ? [
          {
            kind: "end_date" as const,
            value: isoDates[1],
            confidence: 0.95,
            isHard: true,
          },
        ]
      : []),
  ];
}

function extractOrigin(text: string): MessageExtraction["facts"] {
  const patterns = [
    /\b(?:from|leaving from|departing from)\s+([A-Za-z][A-Za-z ]{1,30})/i,
    /\b(?:main|hum)\s+([A-Za-z][A-Za-z ]{1,24})\s+(?:se|mein)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = match[1].trim().replace(/\s+(on|and|but)$/i, "");
    return [
      {
        kind: "origin",
        value,
        confidence: 0.78,
        isHard: true,
      },
    ];
  }
  return [];
}

function extractPreferences(text: string): MessageExtraction["preferences"] {
  const directFirstPerson = firstPersonPattern.test(text);
  if (!directFirstPerson) return [];

  const lower = text.toLowerCase();
  const matches = interestTags.filter((tag) =>
    interestAliases[tag].some((alias) => lower.includes(alias)),
  );

  return matches.map((tag) => {
    const alias = interestAliases[tag].find((candidate) =>
      lower.includes(candidate),
    );
    const index = alias ? lower.indexOf(alias) : 0;
    const nearby = lower.slice(Math.max(0, index - 30), index + 30);
    const negative = negativePattern.test(nearby);
    return {
      tag,
      weight: negative ? -1 : 1,
      confidence: 0.82,
      directFirstPerson: true,
    };
  });
}

export function extractDeterministically(
  text: string,
  isForwarded = false,
): MessageExtraction {
  const isJoke = jokePattern.test(text);
  const facts = [
    ...extractBudget(text),
    ...extractDuration(text),
    ...extractDates(text),
    ...extractOrigin(text),
  ];

  return {
    language: detectLanguage(text),
    isJoke,
    isForwarded,
    facts: isJoke || isForwarded ? facts.map((fact) => ({ ...fact, isHard: false })) : facts,
    preferences: isJoke || isForwarded ? [] : extractPreferences(text),
  };
}

export async function extractMessage(input: {
  text: string;
  isForwarded?: boolean;
}): Promise<MessageExtraction> {
  const fallback = extractDeterministically(input.text, input.isForwarded);
  // Per-message LLM extraction is the highest-volume LLM caller; reserve the
  // budget for plan generation unless explicitly enabled. The heuristic above
  // already handles budgets, dates, durations, origins and preferences.
  if (env.LLM_EXTRACT_MESSAGES !== "true") return fallback;
  const enriched = await generateStructured({
    schema: MessageExtractionSchema,
    system: `You extract travel planning facts from Indian WhatsApp group chat.
Return JSON only. Understand English, Hindi, and Roman-script Hinglish.
Only attribute a personal preference when the speaker uses direct first-person evidence.
Jokes, forwarded content, and statements about another person cannot create hard constraints.
Allowed interest tags: ${interestTags.join(", ")}.
Allowed fact kinds: origin, start_date, end_date, duration_days, budget_min, budget_max, transport, restriction.`,
    user: JSON.stringify({
      message: input.text,
      forwarded: input.isForwarded ?? false,
      deterministicBaseline: fallback,
    }),
  });

  if (!enriched) return fallback;
  return {
    ...enriched,
    preferences: enriched.preferences.filter(
      (preference) => preference.directFirstPerson,
    ),
    facts:
      enriched.isJoke || enriched.isForwarded
        ? enriched.facts.map((fact) => ({ ...fact, isHard: false }))
        : enriched.facts,
  };
}
