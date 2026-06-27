import type { InterestTag, TripSummary } from "@/lib/domain";
import type { CuratedDestination } from "@/data/destinations";

// A "vibe" is a coarse, human grouping over the 18 interest tags — the layer the
// group thinks in ("a beachy trip", "a foodie weekend", "something offbeat"). It
// powers emotion→vibe mapping, vibe-diverse option selection (mix & match), and a
// per-plan "Heritage-led" label. Luxury has no interest tag — it's the `premium`
// destination flag; Offbeat leans on the gem-level hidden-gem mechanics.

export type Vibe =
  | "Beach"
  | "Adventure"
  | "Wildlife"
  | "Heritage"
  | "Hill Station"
  | "Food"
  | "Offbeat"
  | "Spiritual"
  | "Luxury"
  | "Scenic";

// Each vibe → the interest tags that define it.
export const VIBE_TAGS: Record<Vibe, InterestTag[]> = {
  Beach: ["beaches"],
  Adventure: ["trekking", "adventure", "mountains", "camping", "rafting"],
  Wildlife: ["wildlife", "photography"],
  Heritage: ["culture", "haunted", "shopping"],
  "Hill Station": ["mountains", "relaxation", "cafes"],
  Food: ["food", "cafes"],
  Offbeat: ["caves", "road-trip"],
  Spiritual: ["spiritual"],
  Luxury: ["relaxation"],
  Scenic: ["photography", "mountains", "road-trip"],
};

// Vibes that a single strong tag is enough to evoke (others need ≥2 tag hits).
const SINGLE_TAG_VIBES = new Set<Vibe>(["Beach", "Wildlife", "Spiritual", "Food"]);

// Emotion / desire phrases → vibes. Lets the engine map how a group wants to FEEL
// onto concrete vibes (and, through VIBE_TAGS, onto interest tags).
export const EMOTION_VIBES: Array<{ pattern: RegExp; vibes: Vibe[] }> = [
  { pattern: /\b(rejuvenat|recharge|unwind|de-?stress|detox|reset|slow down|switch off)\w*/i, vibes: ["Hill Station", "Spiritual"] },
  { pattern: /\b(adrenaline|thrill|adventur|rush)\w*/i, vibes: ["Adventure"] },
  { pattern: /\b(pamper|honeymoon|romantic|luxur|resort|indulg|spa)\w*/i, vibes: ["Luxury"] },
  { pattern: /\b(foodie|culinary|gastronom|eat our way)\w*/i, vibes: ["Food"] },
  { pattern: /\b(heritage|royal|palace|fort|old.?city)\w*/i, vibes: ["Heritage"] },
  { pattern: /\b(safari|wildlife|tiger|jungle|rhino|lion)\w*/i, vibes: ["Wildlife"] },
  { pattern: /\b(offbeat|underrated|remote|less.?known|untouched)\w*/i, vibes: ["Offbeat"] },
];

// The vibes a destination serves, from its tags (+ premium).
export function destinationVibes(destination: CuratedDestination): Vibe[] {
  const tags = new Set(destination.tags);
  const vibes: Vibe[] = [];
  for (const vibe of Object.keys(VIBE_TAGS) as Vibe[]) {
    if (vibe === "Luxury") continue; // handled by the premium flag below
    const hits = VIBE_TAGS[vibe].filter((t) => tags.has(t)).length;
    if (hits >= (SINGLE_TAG_VIBES.has(vibe) ? 1 : 2)) vibes.push(vibe);
  }
  if (destination.premium) vibes.unshift("Luxury");
  return [...new Set(vibes)];
}

// The group's ranked vibes from their weighted interest tags.
export function groupVibes(weights: Map<InterestTag, number>): Vibe[] {
  const score = new Map<Vibe, number>();
  for (const vibe of Object.keys(VIBE_TAGS) as Vibe[]) {
    let s = 0;
    for (const tag of VIBE_TAGS[vibe]) s += Math.max(0, weights.get(tag) ?? 0);
    if (s > 0) score.set(vibe, s);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

// The single vibe to label a plan with: the destination vibe the group cares
// most about, else the destination's strongest vibe.
export function primaryVibe(
  destination: CuratedDestination,
  weights: Map<InterestTag, number>,
): Vibe | "" {
  const destVibes = destinationVibes(destination);
  if (destVibes.length === 0) return "";
  const match = groupVibes(weights).find((v) => destVibes.includes(v));
  return match ?? destVibes[0];
}

// Luxury intent — a luxury hard-constraint phrase or a high per-person budget.
export function wantsLuxury(summary: TripSummary): boolean {
  const text = summary.hardConstraints.join(" ").toLowerCase();
  if (/luxur|honeymoon|pamper|resort|5.?star|five.?star|premium/.test(text)) return true;
  const budget = summary.budget.maxInr;
  return budget != null && budget >= 30000;
}
