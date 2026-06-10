import type { GeneratedPlan, TripSummary } from "@/lib/domain";

// The "vibe" drives the dynamic hero scene at the top of the trip room. It is
// inferred from what the group wants (their interest tags) and where the
// researched plans would take them (destination names) — so the header shifts
// from a neutral planning scene to ghats / dunes / backwaters / neon / etc. as
// the trip takes shape, and updates live as new plans arrive.
export type Vibe =
  | "mountains"
  | "trek"
  | "beach"
  | "city"
  | "heritage"
  | "lake"
  | "forest"
  | "desert"
  | "backwaters"
  | "spiritual"
  | "haunted"
  | "nightlife"
  | "bazaar"
  | "river"
  | "default";

export const VIBE_LABEL: Record<Vibe, string> = {
  mountains: "Mountain vibe",
  trek: "Trek vibe",
  beach: "Beach vibe",
  city: "City vibe",
  heritage: "Heritage vibe",
  lake: "Lakeside vibe",
  forest: "Forest vibe",
  desert: "Desert vibe",
  backwaters: "Backwaters vibe",
  spiritual: "Spiritual vibe",
  haunted: "Haunted vibe",
  nightlife: "Nightlife vibe",
  bazaar: "Street-food vibe",
  river: "River vibe",
  default: "Trip planning",
};

// Short tokens for the combined label when a trip blends several vibes.
export const VIBE_SHORT: Record<Vibe, string> = {
  mountains: "Mountains",
  trek: "Trek",
  beach: "Beach",
  city: "City",
  heritage: "Heritage",
  lake: "Lakeside",
  forest: "Forest",
  desert: "Desert",
  backwaters: "Backwaters",
  spiritual: "Spiritual",
  haunted: "Haunted",
  nightlife: "Nightlife",
  bazaar: "Street food",
  river: "River",
  default: "Planning",
};

// One human label for the mix: "Beach vibe" when it's one, otherwise the blend
// "Beach · Nightlife · Heritage".
export function vibesLabel(vibes: Vibe[]): string {
  if (vibes.length <= 1) return VIBE_LABEL[vibes[0] ?? "default"];
  return vibes.map((vibe) => VIBE_SHORT[vibe]).join(" · ");
}

const TAG_VIBE: Record<string, Vibe> = {
  adventure: "trek",
  trekking: "trek",
  camping: "trek",
  caves: "trek",
  rafting: "river",
  haunted: "haunted",
  cafes: "city",
  food: "bazaar",
  nightlife: "nightlife",
  relaxation: "backwaters",
  culture: "heritage",
  spiritual: "spiritual",
  photography: "heritage",
  wildlife: "forest",
  beaches: "beach",
  mountains: "mountains",
  "road-trip": "default",
};

// Destination-name keyword → vibe. Scoring (not first-match) resolves overlaps,
// so a place that reads as two lanes lifts both. India-leaning.
const DEST_VIBE: Array<[RegExp, Vibe]> = [
  [/goa|gokarna|varkala|andaman|pondicherry|alibaug|\bdiu\b|tarkarli|murudeshwar|beach|coast/i, "beach"],
  [/alleppey|alappuzha|kumarakom|kuttanad|backwater|houseboat|kettuvallam|kerala/i, "backwaters"],
  [/jaipur|udaipur|jodhpur|jaisalmer|rajasthan|\bfort|palace|haveli|bikaner|kumbhalgarh|hampi|khajuraho|mandu|orchha|chittorgarh/i, "heritage"],
  [/thar|\brann\b|kutch|desert|\bdune|\bsam\b|khuri/i, "desert"],
  [/manali|leh|ladakh|spiti|kasol|himalaya|munnar|kashmir|sikkim|nainital|mussoorie|auli|gulmarg|tawang|snow|peak/i, "mountains"],
  [/\btrek|triund|hampta|roopkund|chadar|chopta|tungnath|chandrashila|kheerganga|valley of flowers|brahmatal/i, "trek"],
  [/\braft|rapids|zanskar|teesta|kolad|barapole|whitewater|kayak/i, "river"],
  [/varanasi|kashi|banaras|rishikesh|haridwar|\bghat|temple|tirupati|amritsar|golden temple|bodh gaya|ujjain|somnath|dwarka|kedarnath|badrinath|pushkar/i, "spiritual"],
  [/meghalaya|mawsynram|mawlyngbna|mawlynnong|forest|jungle|wayanad|coorg|corbett|kaziranga|\broot|\bgir\b|periyar|sundarban/i, "forest"],
  [/\blake|pangong|loktak|pichola|naini|nako/i, "lake"],
  [/bhangarh|kuldhara|dumas|shaniwar|ramoji|haunted|dow hill/i, "haunted"],
  [/chandni chowk|sarojini|johari|laad bazaar|\bbazaar|\bchowk|\bmandi\b|night market/i, "bazaar"],
  [/mumbai|delhi|bengaluru|bangalore|hyderabad|kolkata|\bpune\b|gurgaon|chennai|metro|\bcity\b|urban/i, "city"],
];

type VibeInput = { summary?: TripSummary | null; plans?: GeneratedPlan[] };

// Plan signals are capped per vibe so three same-destination plans can't bury a
// group's stated blend — keeps mixtures alive once research lands.
const PLAN_CAP = 1.8;

function scoreVibes(input: VibeInput): Map<Vibe, number> {
  const tagScores = new Map<Vibe, number>();
  const planScores = new Map<Vibe, number>();
  const bump = (map: Map<Vibe, number>, vibe: Vibe, weight: number) =>
    map.set(vibe, (map.get(vibe) ?? 0) + weight);

  // The hero is about *where* the trip goes, so a generic "cafes → city" signal
  // is down-weighted; distinctive vibes (nightlife, street food) keep full say.
  const GENERIC = new Set<Vibe>(["city"]);
  for (const member of input.summary?.memberPreferences ?? []) {
    for (const interest of member.interests) {
      const vibe = TAG_VIBE[interest.tag];
      if (vibe && interest.weight > 0) {
        bump(tagScores, vibe, interest.weight * 2 * (GENERIC.has(vibe) ? 0.6 : 1));
      }
    }
  }

  for (const plan of input.plans ?? []) {
    const haystack = `${plan.destinationName} ${plan.destinationSlug} ${plan.summary} ${plan.preferenceCoverage.join(" ")}`;
    for (const [pattern, vibe] of DEST_VIBE) {
      if (pattern.test(haystack)) bump(planScores, vibe, 1.5);
    }
    if (plan.angle === "adventurous") bump(planScores, "trek", 0.5);
    if (plan.angle === "relaxed") bump(planScores, "lake", 0.3);
  }

  const scores = new Map<Vibe, number>(tagScores);
  for (const [vibe, score] of planScores) {
    bump(scores, vibe, Math.min(score, PLAN_CAP));
  }
  return scores;
}

// A trip is rarely one note. Return every vibe that scores within range of the
// leader (so a clear single-vibe trip stays one, but a genuine blend surfaces
// 2-3), strongest first. The hero crossfades through whatever this returns.
export function detectVibes(input: VibeInput): Vibe[] {
  const ranked = [...scoreVibes(input).entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return ["default"];
  const top = ranked[0][1];
  return ranked
    .filter(([, score]) => score >= top * 0.45)
    .slice(0, 3)
    .map(([vibe]) => vibe);
}

export function detectVibe(input: VibeInput): Vibe {
  return detectVibes(input)[0];
}
