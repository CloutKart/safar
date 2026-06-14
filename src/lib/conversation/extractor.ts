import {
  interestTags,
  MessageExtractionSchema,
  type InterestTag,
  type MessageExtraction,
} from "@/lib/domain";
import { generateStructured } from "@/lib/ai/client";
import { env } from "@/lib/env";
import { destinations } from "@/data/destinations";

// Catalog place names, to tell a real place exclusion ("goa nahi") from a
// preference negation ("no nightlife").
const KNOWN_PLACES = new Set(
  destinations.flatMap((destination) => {
    const name = destination.name.toLowerCase();
    return [name, destination.slug, name.split(/[ (]/)[0]];
  }),
);

// Natural-language phrasings the group actually uses, mapped to the canonical
// interest tag. Matched as whole words (see interestMatchers) so short aliases
// like "fort"/"pub" don't false-fire inside "comfort"/"public". Cover the 8
// marketed headline interests (incl. "slow travel") and their common variants.
const interestAliases: Record<InterestTag, string[]> = {
  adventure: [
    "adventure", "adventures", "adventurous", "adventure sport", "adventure sports",
    "thrill", "thrilling", "adrenaline", "paragliding", "paraglide", "parasailing",
    "bungee", "bungee jumping", "bungy", "zipline", "ziplining", "zip line",
    "skydiving", "skydive", "scuba", "scuba diving", "atv", "quad biking", "off-roading",
  ],
  trekking: [
    "trek", "treks", "trekking", "trekkers", "hike", "hikes", "hiking",
    "trekking trail", "backpacking", "summit climb",
  ],
  haunted: [
    "haunted", "haunted trail", "haunted trails", "horror", "ghost", "ghosts",
    "ghost tour", "ghost walk", "spooky", "eerie", "creepy", "abandoned",
    "supernatural", "paranormal", "bhoot",
  ],
  cafes: [
    "cafe", "cafes", "café", "cafe hopping", "cafe-hopping", "café hopping",
    "coffee", "coffee shop", "roastery", "bakery", "patisserie", "brunch",
  ],
  food: [
    "food", "foods", "street food", "seafood", "food crawl", "food walk", "food trail",
    "local food", "local cuisine", "khana", "foodie", "dhaba", "thali", "eateries",
    "delicacies",
  ],
  nightlife: [
    "nightlife", "party", "parties", "partying", "club", "clubs", "clubbing",
    "bars", "pub", "pubs", "rooftop", "lounge", "live music", "dj", "after dark",
  ],
  relaxation: [
    "relax", "relaxed", "relaxing", "relaxation", "slow travel", "slow trip", "slow pace",
    "slow down", "leisurely", "leisure", "unwind", "unhurried", "laid back", "laid-back",
    "no rush", "switch off", "wind down", "detox", "chill", "chilling", "peaceful",
    "shaanti", "sukoon", "aram",
  ],
  culture: [
    "culture", "cultural", "heritage", "heritage walk", "heritage trail", "heritage stay",
    "history", "historic", "historical", "museum", "old city", "old town", "fort", "forts",
    "palace", "palaces", "ruins", "monument", "monuments", "haveli", "havelis",
    "architecture", "unesco",
  ],
  wildlife: [
    "wildlife", "safari", "safaris", "jungle safari", "birds", "birding", "bird watching",
    "jungle", "national park", "sanctuary",
  ],
  photography: [
    "photography", "photo", "photos", "photo walk", "pictures", "instagrammable",
    "instagram", "scenic",
  ],
  beaches: [
    "beach", "beaches", "beachy", "sea", "seaside", "ocean", "shore", "coastline",
    "surf", "surfing",
  ],
  mountains: [
    "mountain", "mountains", "hills", "hill stations", "himalayas", "snow", "alpine", "pahad",
  ],
  "road-trip": [
    "road trip", "road-trip", "roadtrip", "self drive", "drive", "bike trip", "biking trip",
  ],
  spiritual: [
    "spiritual", "spirituality", "temple", "temples", "meditation", "ashram", "ashrams",
    "pilgrimage", "monastery", "yoga retreat",
  ],
  caves: ["cave", "caves", "caving", "spelunking"],
  camping: [
    "camp", "camps", "camping", "campsite", "campfire", "bonfire", "tent", "tents",
    "glamping", "stargazing",
  ],
  rafting: [
    "rafting", "river rafting", "white water rafting", "whitewater", "kayak", "kayaking",
    "canoeing",
  ],
};

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One whole-word matcher per tag: an alternation of its aliases bounded by
// non-letter/digit edges, so "fort" matches "fort"/"forts" but not "comfort",
// and "sea" doesn't fire inside "research". Built once at module load.
const interestMatchers: Record<InterestTag, RegExp> = Object.fromEntries(
  interestTags.map((tag) => [
    tag,
    new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${interestAliases[tag].map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`,
      "iu",
    ),
  ]),
) as Record<InterestTag, RegExp>;

const firstPersonPattern =
  /\b(i|i'm|i am|i'd|me|my|we|our|us|let'?s|main|mai|mujhe|mujhko|mera|meri|hum|humein|apna|apne|chaahiye)\b/i;
// Expressed-preference verbs/markers — people rarely say "I" in casual chat
// ("love beaches", "want cafes", "into trekking", "beach chahiye").
const preferenceMarker =
  /\b(love|loved|loves|loving|want|wanna|wanted|wish|prefer|prefers|like|likes|liking|enjoy|enjoys|fan of|into|keen|interested|looking for|hoping for|down for|up for|in the mood|mood for|excited for|chahiye|chahta|chahte|chah|pasand|mann|sochna)\b/i;
const negativePattern =
  /\b(no|not|don't|dont|hate|hates|avoid|skip|nope|nahi|nahin|mat|pasand nahi|bilkul nahi)\b/i;
const jokePattern = /\b(jk|joking|mazak|mazaak|lol kidding|just kidding)\b/i;
// A statement about someone else: a pronoun, or "Name likes/wants ..." — these
// must not be attributed to the speaker.
const thirdPersonPattern =
  /\b(he|she|they|him|her|them|his|hers|their|theirs|uska|uski|unka|unke|unko)\b/i;
const thirdPersonSubjectPattern =
  /\b[A-Z][a-z]+\s+(?:loves?|likes?|wants?|prefers?|enjoys?|hates?|is into|are into)\b/;

function detectLanguage(text: string): MessageExtraction["language"] {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/\b(kya|hai|hain|mujhe|nahi|chalo|karna|jana|yaar|bhai|budget)\b/i.test(text)) {
    return "hinglish";
  }
  return /[a-z]/i.test(text) ? "en" : "unknown";
}

const MONEY_UNIT: Record<string, number> = {
  k: 1000, thousand: 1000, grand: 1000,
  lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000, l: 100000,
  cr: 10000000, crore: 10000000, crores: 10000000,
};

function extractBudget(text: string): MessageExtraction["facts"] {
  const amounts: number[] = [];
  // A number counts as money only with a signal: a ₹/rs/inr/budget prefix, or a
  // rupees/k/lakh suffix — so "3 day" and "17th" aren't read as budgets.
  const re =
    /(₹|rs\.?|inr|budget(?:\s*(?:is|cap|of|around|:|=))?)?\s*₹?\s*(\d[\d,]*\.?\d*)\s*(k|thousand|grand|lakhs?|lacs?|l|cr|crores?|rupees?|rs\.?|inr|₹|\/-)?/gi;
  for (const m of text.matchAll(re)) {
    const unit = (m[3] ?? "").toLowerCase().replace(/[.\s/-]/g, "");
    if (!m[1] && !unit) continue; // bare number, no money signal
    const base = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const value = Math.round(base * (MONEY_UNIT[unit] ?? 1));
    if (value >= 300) amounts.push(value);
  }
  if (amounts.length === 0) return [];
  const capWords =
    /\b(max|maximum|under|within|cap|upto|up to|at most|budget|only)\b/i.test(text);
  return [
    { kind: "budget_min", value: Math.min(...amounts), confidence: 0.85, isHard: capWords || negativePattern.test(text) },
    { kind: "budget_max", value: Math.max(...amounts), confidence: 0.85, isHard: capWords },
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

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "17th june" / "june 17" → ISO, inferring the year (next year if already past).
function naturalDate(text: string): string | null {
  const lower = text.toLowerCase();
  const dayMonth = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/,
  );
  const monthDay = lower.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?/,
  );
  let day: number | undefined;
  let month: number | undefined;
  if (dayMonth) {
    day = Number(dayMonth[1]);
    month = MONTHS[dayMonth[2].slice(0, 3)];
  } else if (monthDay) {
    month = MONTHS[monthDay[1].slice(0, 3)];
    day = Number(monthDay[2]);
  }
  if (!month || !day || day < 1 || day > 31) return null;
  const now = new Date();
  let year = now.getUTCFullYear();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (Date.UTC(year, month - 1, day) < today) year += 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDates(text: string): MessageExtraction["facts"] {
  const isoDates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(
    (match) => match[1],
  );
  if (isoDates.length > 0) {
    return [
      { kind: "start_date", value: isoDates[0], confidence: 0.95, isHard: true },
      ...(isoDates[1]
        ? [{ kind: "end_date" as const, value: isoDates[1], confidence: 0.95, isHard: true }]
        : []),
    ];
  }
  const natural = naturalDate(text);
  if (natural) {
    return [{ kind: "start_date", value: natural, confidence: 0.8, isHard: true }];
  }
  return [];
}

function extractOrigin(text: string): MessageExtraction["facts"] {
  const patterns = [
    /\b(?:departure city|departure point|departing from|departing|leaving from|leaving|leave from|starting from|start from|flying from|travell?ing from|coming from)\b(?:\s+is)?\s*:?\s*([a-z][a-z .]{1,30})/i,
    /\b(?:from|based in|live in)\s+([a-z][a-z .]{1,30})/i,
    /\b(?:main|hum)\s+([a-z][a-z .]{1,24})\s+(?:se|mein)\b/i,
  ];
  const stop = /^(the|a|an|here|there|home|work|now|today|tomorrow|class|office|trip)\b/i;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = match[1]
      .trim()
      .replace(/\b(is|are|on|and|but|please|pls|now|today|tomorrow)\b.*$/i, "")
      .replace(/^the\s+/i, "")
      .trim();
    if (!value || stop.test(value)) continue;
    return [{ kind: "origin", value, confidence: 0.78, isHard: true }];
  }
  return [];
}

const DESTINATION_VERBS =
  /\b(?:go(?:ing)? to|wanna go to|want(?:ed)? to go(?: to)?|visit(?:ing)?|trip to|travel to|head(?:ing)? to|how about|what about|let'?s do|consider|thinking(?: of| about)?|plan(?:ning)?(?: a trip)?(?: for| to)?|destination(?:'?s| is)?)\s+([A-Za-z][A-Za-z]+(?:\s+[A-Za-z]+)?)/gi;
// Words that follow a "go to / visit" verb but aren't a place.
const PLACE_STOPWORDS = new Set([
  "the", "a", "an", "it", "this", "that", "there", "here", "home", "work",
  "sleep", "bed", "gym", "school", "office", "market", "station", "airport",
  "hospital", "mall", "you", "us", "me", "them", "everyone", "somewhere",
  "anywhere", "nowhere", "places", "place", "trip", "beach", "beaches",
  "mountains", "hills", "town", "plan", "do", "see", "eat", "stay", "relax",
  "party", "explore", "more", "some", "any", "my", "our", "hell",
]);

function extractDestination(text: string): MessageExtraction["facts"] {
  const found = new Set<string>();
  for (const match of text.matchAll(DESTINATION_VERBS)) {
    const phrase = match[1]
      .trim()
      .replace(/\b(for|on|in|next|this|please|pls|trip|vacation)\b.*$/i, "")
      .trim();
    const first = phrase.split(/\s+/)[0]?.toLowerCase();
    if (!first || PLACE_STOPWORDS.has(first)) continue;
    found.add(phrase.replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  return [...found].slice(0, 3).map((value) => ({
    kind: "destination" as const,
    value,
    confidence: 0.72,
    isHard: false,
  }));
}

const EXCLUDE_PREFIX =
  /\b(?:not|no|don'?t want(?:\s+to\s+(?:go\s+to|visit))?|do not want|avoid|skip|exclude|except|hate)\s+(?:go(?:ing)?\s+to\s+|going\s+|visit(?:ing)?\s+|to\s+)?([a-z][a-z]+(?:\s+[a-z]+)?)/gi;
const EXCLUDE_POSTFIX =
  /\b([a-z][a-z]+(?:\s+[a-z]+)?)\s+(?:nahi(?:\s+jaana)?|mat\s+jaana|nahi\s+chahiye|na\s+jaana)\b/gi;

function extractExcludedDestination(text: string): MessageExtraction["facts"] {
  const found = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const phrase = raw
      .trim()
      .replace(/\b(for|on|in|next|this|please|pls|trip|jaana|chahiye)\b.*$/i, "")
      .trim();
    const first = phrase.split(/\s+/)[0];
    if (!first || PLACE_STOPWORDS.has(first.toLowerCase())) return;
    const isProperNoun = /^[A-Z]/.test(phrase);
    const isKnownPlace =
      KNOWN_PLACES.has(phrase.toLowerCase()) || KNOWN_PLACES.has(first.toLowerCase());
    if (!isProperNoun && !isKnownPlace) return; // a preference negation, not a place
    found.add(phrase.replace(/\b\w/g, (char) => char.toUpperCase()));
  };
  for (const match of text.matchAll(EXCLUDE_PREFIX)) add(match[1]);
  for (const match of text.matchAll(EXCLUDE_POSTFIX)) add(match[1]);
  return [...found].slice(0, 3).map((value) => ({
    kind: "exclude_destination" as const,
    value,
    confidence: 0.72,
    isHard: true,
  }));
}

function extractPreferences(text: string): MessageExtraction["preferences"] {
  const lower = text.toLowerCase();
  const matches = interestTags.filter((tag) => interestMatchers[tag].test(lower));
  if (matches.length === 0) return [];

  const hasFirstPerson = firstPersonPattern.test(text);
  // "Rohan loves haunted places" / "she wants beaches" → about someone else.
  const aboutSomeoneElse =
    !hasFirstPerson &&
    (thirdPersonPattern.test(text) || thirdPersonSubjectPattern.test(text));
  if (aboutSomeoneElse) return [];

  const hasPreferenceVerb = preferenceMarker.test(text);
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  // A short, interest-led phrase ("beach shacks, sunsets, seafood") is the
  // speaker listing what they want — even without a pronoun or verb.
  const shortInterestList = wordCount <= 10 && !text.includes("?");
  // ...as is any message that names two or more interests ("beaches and
  // relaxation, good seafood, 4 days from Mumbai"), even mixed with trip facts.
  const manyInterests = matches.length >= 2 && !text.includes("?");
  if (
    !hasFirstPerson &&
    !hasPreferenceVerb &&
    !shortInterestList &&
    !manyInterests
  ) {
    return [];
  }

  const confidence = hasFirstPerson ? 0.82 : hasPreferenceVerb ? 0.74 : 0.62;

  return matches.map((tag) => {
    const hit = interestMatchers[tag].exec(lower);
    const index = hit ? hit.index : 0;
    const length = hit ? hit[0].length : 0;
    // Negation binds within a clause: "beaches but no nightlife" negates only
    // nightlife. Look from the last clause break up to the tag, plus a short
    // trailing window for postfix Hinglish negation ("nightlife nahi").
    const before = lower.slice(0, index).split(/[,;.]|\band\b|\bbut\b/).pop() ?? "";
    // Trailing clause only up to the next break, so "beach, no party" negates
    // party — not beach.
    const after =
      lower.slice(index + length).split(/[,;.]|\band\b|\bbut\b/)[0] ?? "";
    const negative =
      negativePattern.test(before) || negativePattern.test(after);
    return {
      tag,
      weight: negative ? -1 : 1,
      confidence,
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
    ...extractDestination(text),
    ...extractExcludedDestination(text),
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
Allowed fact kinds: origin, destination, exclude_destination, start_date, end_date, duration_days, budget_min, budget_max, transport, restriction.`,
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
