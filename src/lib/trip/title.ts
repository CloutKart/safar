import type { TripSummary } from "@/lib/domain";
import { VIBE_SHORT, type Vibe } from "@/lib/trip/vibe";

// A creative room name derived from the *approved* summary — the group's vibe,
// length, size and budget — instead of the plain name typed at creation. It is
// deterministic (seeded by the room slug) so it stays put across reloads, and
// shifts only if the trip's character genuinely changes.

const POOLS: Record<Vibe, string[]> = {
  trek: ["Boots, Blisters & Bragging Rights", "All Uphill From Here", "Trek Now, Nap Later", "Off-Grid & Out of Breath"],
  beach: ["Sun, Sand & Zero Plans", "Saltwater Therapy", "Out of Office, Into the Ocean", "Tan Lines & Group Fines"],
  mountains: ["Above the Clouds", "Cold Air, Warm Chai", "Peak Behaviour", "Take the High Road"],
  heritage: ["Forts, Frescoes & Photo Dumps", "Kings for the Weekend", "Old Walls, New Stories", "Royals on a Budget"],
  city: ["Concrete & Cocktails", "Caffeine and Chaos", "Cafe-Hop Till You Drop", "Big City, Small Plans"],
  lake: ["Still Waters, Loud Friends", "Mirror Mornings", "Lakeside and Low Effort", "Skip a Stone, Skip a Care"],
  forest: ["Into the Green", "Lost in the Woods (On Purpose)", "Canopy Therapy", "Trees, Please"],
  desert: ["Dunes & Dramatics", "Sand in Everything", "Golden Hour, All Hours", "Mirage Chasers"],
  backwaters: ["Slow Mornings, Slower Boats", "Houseboat, No Hurry", "Drift Mode: On", "Kerala Calm"],
  spiritual: ["Soul on Silent", "Ghats, Gods & Good Chai", "Find Yourself (Bring Snacks)", "Temple Run, Literally"],
  haunted: ["Spooky & Sleepless", "Forts After Dark", "Goosebumps Guaranteed", "Ghost-Hunting on a Budget"],
  nightlife: ["Sleep When You're Home", "Neon & Nonsense", "Last Ones on the Dancefloor", "Sunrise Is the Curfew"],
  bazaar: ["Eat First, Ask Later", "Chaat Pilgrimage", "Street-Food Speedrun", "Hungry, Always"],
  river: ["Paddle & Panic", "Go With the Flow (Fast)", "Rapids and Regrets", "Wet, Wild, Worth It"],
  default: ["Destination: Undecided", "Plans Loading", "Somewhere, Soon", "Adventure Pending"],
};

const VIBE_NOUN: Record<Vibe, string> = {
  trek: "Trails",
  beach: "Beach Days",
  mountains: "Mountains",
  heritage: "History",
  city: "City Lights",
  lake: "Stillness",
  forest: "Wilderness",
  desert: "Dunes",
  backwaters: "Backwaters",
  spiritual: "Soul-Searching",
  haunted: "Chills",
  nightlife: "Nights Out",
  bazaar: "Street Food",
  river: "Rapids",
  default: "Adventure",
};

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

export function tripTitle(input: {
  subject: string;
  summary: TripSummary | null;
  vibes: Vibe[];
  seed: string;
  approved: boolean;
}): string {
  // Until the group approves a summary, keep the name they chose.
  if (!input.approved || !input.summary) return input.subject;

  const primary = input.vibes[0] ?? "default";
  const noun = VIBE_NOUN[primary];
  const candidates = [...POOLS[primary]];

  const days = input.summary.dates.durationDays;
  if (days) candidates.push(`${days} Days of ${noun}`);
  if (input.summary.groupSize >= 4) {
    candidates.push(`${input.summary.groupSize} of Us, One ${noun} Plan`);
  }
  if (input.summary.budget.maxInr && input.summary.budget.maxInr <= 12000) {
    candidates.push("Big Plans, Small Budget");
  }
  if (input.vibes.length >= 2) {
    const [a, b] = [VIBE_SHORT[input.vibes[0]], VIBE_SHORT[input.vibes[1]]];
    candidates.push(`Equal Parts ${a} and ${b}`, `${a} Meets ${b}`, `${a}, ${b} & Chaos`);
  }

  return candidates[hashSeed(input.seed) % candidates.length];
}
