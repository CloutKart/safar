import { generateEmbedding, generateStructured } from "@/lib/ai/client";
import { geocodeCity, haversineKm, lookupCoords, type LatLng } from "@/lib/cityCoords";
import type { TrailDifficulty } from "@/lib/domain";
import {
  TREK_DNA_DIMS,
  TrekIntentSchema,
  type Trek,
  type TrekDnaDim,
  type TrekFilters,
  type TrekIntent,
} from "@/lib/trek/schema";
import { listTreks, matchTreks } from "@/lib/trek/store";

// The Trek DNA recommender. A HYBRID: embeddings + pgvector recall the candidate
// set (when configured), then a DETERMINISTIC, explainable re-rank orders them by
// the brief's weighting — Hard 35 / Season 20 / Mood-DNA 20 / Proximity 15 /
// Budget 5 / Bonus 5. Everything degrades gracefully: no LLM → keyword intent; no
// embeddings → recall the full seed and rank it the same way.

const DIFFICULTY_RANK: Record<TrailDifficulty, number> = {
  easy: 0,
  moderate: 1,
  hard: 2,
  expert: 3,
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// ── Deterministic keyword intent (the always-on fallback / baseline) ─────────
const DNA_KEYWORDS: Array<{ test: RegExp; set: Partial<Record<TrekDnaDim, number>> }> = [
  { test: /waterfall|cascade|\bfalls\b/i, set: { waterfalls: 9 } },
  { test: /forest|jungle|woods|shola|oak|pine/i, set: { forest: 9 } },
  { test: /snow|glacier|winter/i, set: { snow: 9 } },
  { test: /\bview|panoram|ridge|vista|scenic|summit\b/i, set: { views: 9 } },
  { test: /no crowd|quiet|solitude|peaceful|empty|seclud|offbeat|underrated|hidden|less.?known|remote/i, set: { crowds: 1, hidden: 9 } },
  { test: /photo|instagram|golden hour|sunrise|sunset/i, set: { photography: 9 } },
  { test: /camp|overnight|tent|bivouac|bonfire/i, set: { camping: 9 } },
  { test: /adventur|thrill|epic|expedition|challeng|hardcore/i, set: { adventure: 9 } },
  { test: /family|kids|child|easy|beginner|first.?time|gentle/i, set: { family: 9 } },
  { test: /\bfood\b|cuisine|local food|chai/i, set: { food: 8 } },
];

const SUITABILITY_KEYWORDS: Array<{ test: RegExp; tag: TrekIntent["suitability"][number] }> = [
  { test: /\bdog/i, tag: "dog" },
  { test: /kid|child|family/i, tag: "kids" },
  { test: /solo|alone|by myself/i, tag: "solo" },
  { test: /couple|romantic|honeymoon/i, tag: "couples" },
  { test: /first.?time|first trek|beginner/i, tag: "first-trek" },
  { test: /camp|tent|overnight/i, tag: "camping" },
  { test: /bird/i, tag: "birdwatching" },
  { test: /photo/i, tag: "photography" },
  { test: /monsoon|rain/i, tag: "monsoon" },
  { test: /snow|winter/i, tag: "winter-snow" },
];

function keywordIntent(query: string): TrekIntent {
  const q = query.toLowerCase();
  const dna: Partial<Record<TrekDnaDim, number>> = {};
  for (const { test, set } of DNA_KEYWORDS) {
    if (test.test(q)) Object.assign(dna, set);
  }
  const suitability = [
    ...new Set(SUITABILITY_KEYWORDS.filter(({ test }) => test.test(q)).map((s) => s.tag)),
  ];

  let maxDifficulty: TrailDifficulty | null = null;
  if (/easy|beginner|first.?time|gentle|relax/i.test(q)) maxDifficulty = "easy";
  else if (/moderate|medium/i.test(q)) maxDifficulty = "moderate";

  // "near Bangalore" / "from Pune" / "around Manali" → validate against coords.
  let nearCity: string | null = null;
  const cityMatch = q.match(/\b(?:near|from|around|close to|by)\s+([a-z][a-z .'-]{2,30})/i);
  if (cityMatch) {
    const candidate = cityMatch[1].trim().split(/\s+(?:in|for|during|with|and)\b/)[0].trim();
    if (lookupCoords(candidate)) nearCity = candidate;
  }

  let month: number | null = null;
  const monthMatch = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  if (monthMatch) month = MONTHS[monthMatch[1].slice(0, 3).toLowerCase()] ?? null;

  const weekend = /weekend|quick|2.?day|day trip|saturday|sunday|short trek/i.test(q);

  return TrekIntentSchema.parse({ dna, nearCity, month, maxDifficulty, suitability, weekend });
}

const INTENT_SYSTEM = `You parse an Indian trekking search into JSON. Output ONLY this shape:
{"dna":{<dim>:0-10,...},"nearCity":string|null,"month":1-12|null,"maxDifficulty":"easy"|"moderate"|"hard"|"expert"|null,"suitability":[...],"weekend":boolean}
dna dims (include ONLY those the user expressed; 0=avoid, 10=strongly want): ${TREK_DNA_DIMS.join(", ")}. "crowds" 0 means they want solitude.
suitability tags: first-trek, kids, dog, solo, couples, photography, birdwatching, camping, monsoon, winter-snow.
nearCity = the Indian city they'd start from. month = travel month if stated. weekend=true if it's a short/weekend trip.`;

async function llmIntent(query: string): Promise<TrekIntent | null> {
  return generateStructured({ schema: TrekIntentSchema, system: INTENT_SYSTEM, user: query });
}

// Union the LLM's reading over the keyword baseline (LLM wins where it set a value;
// keyword fills the gaps) — so we never lose a signal the deterministic path caught.
function mergeIntent(base: TrekIntent, llm: TrekIntent): TrekIntent {
  return {
    ...base,
    dna: { ...base.dna, ...llm.dna },
    nearCity: llm.nearCity ?? base.nearCity,
    month: llm.month ?? base.month,
    maxDifficulty: llm.maxDifficulty ?? base.maxDifficulty,
    suitability: [...new Set([...base.suitability, ...llm.suitability])],
    weekend: llm.weekend || base.weekend,
  };
}

export async function parseTrekQuery(query: string): Promise<TrekIntent> {
  const base = keywordIntent(query);
  const llm = await llmIntent(query);
  return llm ? mergeIntent(base, llm) : base;
}

// Overlay the sidebar's explicit filters onto the NL-parsed intent — only the
// keys the user actually set (sparse), so a filter never wipes an inferred value.
function mergeFilters(base: TrekIntent, filters?: TrekFilters): TrekIntent {
  if (!filters) return base;
  const out: TrekIntent = { ...base };
  if (filters.nearCity !== undefined) out.nearCity = filters.nearCity;
  if (filters.month !== undefined) out.month = filters.month;
  if (filters.maxDifficulty !== undefined) out.maxDifficulty = filters.maxDifficulty;
  if (filters.weekend !== undefined) out.weekend = filters.weekend;
  if (filters.distanceKm !== undefined) out.distanceKm = filters.distanceKm;
  if (filters.elevationGainM !== undefined) out.elevationGainM = filters.elevationGainM;
  if (filters.transport !== undefined) out.transport = filters.transport;
  if (filters.permit !== undefined) out.permit = filters.permit;
  if (filters.camping !== undefined) out.camping = filters.camping;
  out.dna = { ...base.dna, ...(filters.dna ?? {}) };
  out.suitability = [...new Set([...base.suitability, ...(filters.suitability ?? [])])];
  if (filters.camping === true) {
    out.dna = { ...out.dna, camping: Math.max(out.dna.camping ?? 0, 9) };
    if (!out.suitability.includes("camping")) out.suitability = [...out.suitability, "camping"];
  }
  return out;
}

const emptyIntent = (): TrekIntent => TrekIntentSchema.parse({});

// ── Scoring factors (each 0–1) ───────────────────────────────────────────────
function dnaMatch(intent: TrekIntent, trek: Trek): number {
  const dims = Object.keys(intent.dna) as TrekDnaDim[];
  if (dims.length === 0) return 0.6; // no expressed preference → neutral
  let sum = 0;
  for (const dim of dims) sum += 1 - Math.abs((intent.dna[dim] ?? 0) - trek.dna[dim]) / 10;
  return sum / dims.length;
}

function seasonFit(trek: Trek, month: number | null): number {
  if (month == null) return 0.8;
  if (trek.bestMonths.length === 0) return 0.7;
  if (trek.bestMonths.includes(month)) return 1;
  const adjacent = trek.bestMonths.some((m) => {
    const d = Math.abs(m - month);
    return Math.min(d, 12 - d) === 1;
  });
  return adjacent ? 0.55 : 0.25;
}

function distanceKmFor(trek: Trek, origin: LatLng | null): number | null {
  if (!origin || !trek.trailheadCoords) return null;
  return haversineKm(origin, trek.trailheadCoords);
}

function proximityScore(distanceKm: number | null, weekend: boolean): number {
  if (distanceKm == null) return 0.6; // unknown → neutral
  const freeRadius = weekend ? 250 : 600; // ~6–8h vs a longer haul
  const falloff = weekend ? 600 : 1500;
  return Math.max(0, Math.min(1, 1 - Math.max(0, distanceKm - freeRadius) / falloff));
}

// 1 when inside the range, graded down by how far outside (null = not constrained).
function rangeFit(
  value: number | null,
  range: { min: number | null; max: number | null } | null,
): number | null {
  if (!range || (range.min == null && range.max == null)) return null;
  if (value == null) return 0.6; // unknown trek value → mild
  const min = range.min ?? 0;
  const max = range.max ?? Number.POSITIVE_INFINITY;
  if (value >= min && value <= max) return 1;
  const dist = value < min ? min - value : value - max;
  const scale = Math.max(max === Number.POSITIVE_INFINITY ? min : max - min, 1);
  return Math.max(0.15, 1 - dist / scale);
}

function hardFit(intent: TrekIntent, trek: Trek): number {
  let parts = 0;
  let score = 0;
  if (intent.maxDifficulty) {
    parts += 1;
    // Graded, not binary: one grade over the ceiling (e.g. "easy" wanted, a
    // "moderate" trail) is a soft miss; two+ grades over is a real mismatch.
    const over = DIFFICULTY_RANK[trek.difficulty] - DIFFICULTY_RANK[intent.maxDifficulty];
    score += over <= 0 ? 1 : over === 1 ? 0.6 : over === 2 ? 0.3 : 0.15;
  }
  if (intent.suitability.length > 0) {
    parts += 1;
    const have = intent.suitability.filter((t) => trek.suitability.includes(t)).length;
    score += have / intent.suitability.length;
  }
  const distFit = rangeFit(trek.distanceKm, intent.distanceKm);
  if (distFit != null) { parts += 1; score += distFit; }
  const elevFit = rangeFit(trek.elevationGainM, intent.elevationGainM);
  if (elevFit != null) { parts += 1; score += elevFit; }
  if (intent.permit) {
    parts += 1;
    score += intent.permit === "avoid" ? (trek.permitRequired ? 0.1 : 1) : 1;
  }
  if (intent.transport === "public") {
    // Remote, guide-required treks are hard to reach without your own vehicle.
    parts += 1;
    score += trek.guideRecommended ? 0.5 : 1;
  }
  return parts === 0 ? 1 : score / parts;
}

function bonusScore(trek: Trek): number {
  const hidden = trek.dna.hidden / 10;
  const scenic = (trek.scenicDensity?.composite ?? trek.dna.views) / 10;
  return Math.max(0, Math.min(1, 0.5 * hidden + 0.5 * scenic));
}

export interface TrekMatch {
  trek: Trek;
  matchPct: number;
  why: string[];
  distanceKm: number | null;
}

export interface TrekSearchResult {
  intent: TrekIntent;
  matches: TrekMatch[];
  nearby: Array<{ slug: string; name: string; state: string; distanceKm: number }>;
  usedEmbeddings: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

const DIM_LABEL: Partial<Record<TrekDnaDim, string>> = {
  waterfalls: "waterfalls",
  forest: "forest",
  snow: "snow",
  views: "big views",
  photography: "photography",
  camping: "camping",
  adventure: "adventure",
  food: "local food",
};

function buildWhy(intent: TrekIntent, trek: Trek, distanceKm: number | null): string[] {
  const why: string[] = [];
  const wanted = (Object.keys(intent.dna) as TrekDnaDim[])
    .filter((d) => (intent.dna[d] ?? 0) >= 6 && trek.dna[d] >= 6 && DIM_LABEL[d])
    .map((d) => DIM_LABEL[d]!);
  if (wanted.length) why.push(`Strong on ${wanted.slice(0, 3).join(", ")}`);
  if ((intent.dna.crowds ?? 10) <= 3 && trek.dna.crowds <= 3) why.push("Genuinely quiet — a hidden gem");
  if (intent.month && trek.bestMonths.includes(intent.month)) why.push("In season for your month");
  if (intent.nearCity && distanceKm != null) why.push(`~${distanceKm} km from ${titleCase(intent.nearCity)}`);
  if (intent.maxDifficulty && DIFFICULTY_RANK[trek.difficulty] <= DIFFICULTY_RANK[intent.maxDifficulty]) {
    why.push(`${cap(trek.difficulty)} — within your comfort`);
  }
  if (intent.permit === "avoid" && !trek.permitRequired) why.push("No permit needed");
  if (intent.distanceKm && trek.distanceKm != null && rangeFit(trek.distanceKm, intent.distanceKm) === 1) {
    why.push(`${trek.distanceKm} km — fits your range`);
  }
  if (why.length === 0) why.push(`${cap(trek.difficulty)} ${trek.routeType ?? "trek"} in ${trek.region || trek.state}`);
  return why.slice(0, 3);
}

export function scoreTrek(
  intent: TrekIntent,
  trek: Trek,
  origin: LatLng | null,
): { score: number; distanceKm: number | null } {
  const distanceKm = distanceKmFor(trek, origin);
  // Public transport → treat reach like a weekend (tighter radius matters more).
  const prox = proximityScore(distanceKm, intent.weekend || intent.transport === "public");
  let score =
    0.35 * hardFit(intent, trek) +
    0.2 * seasonFit(trek, intent.month) +
    0.2 * dnaMatch(intent, trek) +
    0.15 * prox +
    0.05 * 0.7 + // budget placeholder (treks are low-cost; refined in a later phase)
    0.05 * bonusScore(trek);
  // When the user explicitly named a departure city, proximity becomes decisive
  // (the brief's "Landour should beat Majuli"): a far trek can't win on other
  // axes alone. A multiplicative haircut — up to ~45% for a very distant trail —
  // on top of the additive term, so "near Bangalore" actually surfaces the south.
  // Uses a CONTINUOUS nearness (not the saturating `prox`) so that among
  // reachable treks the genuinely closer ones still rank higher — e.g. "near
  // Dehradun" puts a 115 km trek above a 300 km one rather than tying them.
  if (origin && distanceKm != null) {
    const reach = intent.weekend || intent.transport === "public" ? 900 : 2000;
    const nearness = Math.max(0, 1 - distanceKm / reach);
    score *= 0.55 + 0.45 * nearness;
  }
  return { score, distanceKm };
}

export async function recommendTreks(
  input: string | { query?: string; filters?: TrekFilters },
  limit = 8,
): Promise<TrekSearchResult> {
  const opts = typeof input === "string" ? { query: input } : input;
  const query = opts.query?.trim() || "";

  const base = query ? await parseTrekQuery(query) : emptyIntent();
  const intent = mergeFilters(base, opts.filters);
  // Resolve the departure city: the static gateway DB first (fast, reliable),
  // then a keyless geocode fallback so any town/typo still gets a proximity
  // ranking instead of silently doing nothing. Degrades to null on timeout.
  let origin = intent.nearCity ? lookupCoords(intent.nearCity) : null;
  if (intent.nearCity && !origin) {
    origin = await geocodeCity(intent.nearCity, AbortSignal.timeout(3000));
  }

  // Recall: embeddings + pgvector when there's NL text, else the full corpus.
  const embedding = query ? await generateEmbedding(query) : null;
  const recalled = await matchTreks(embedding, 24);
  const usedEmbeddings = recalled != null;
  const candidates = recalled ?? (await listTreks());

  const ranked = candidates
    .map((trek) => {
      const { score, distanceKm } = scoreTrek(intent, trek, origin);
      return { trek, score, distanceKm };
    })
    .sort((a, b) => b.score - a.score);

  const matches: TrekMatch[] = ranked.slice(0, limit).map((r) => ({
    trek: r.trek,
    matchPct: Math.round(r.score * 100),
    why: buildWhy(intent, r.trek, r.distanceKm),
    distanceKm: r.distanceKm,
  }));

  // Nearby alternatives around the departure city, beyond the top matches —
  // only genuinely near ones (no "also near Bangalore: ~1900 km").
  const NEARBY_RADIUS_KM = 700;
  const topSlugs = new Set(matches.map((m) => m.trek.slug));
  const nearby = origin
    ? ranked
        .filter(
          (r) =>
            !topSlugs.has(r.trek.slug) &&
            r.distanceKm != null &&
            r.distanceKm <= NEARBY_RADIUS_KM,
        )
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
        .slice(0, 3)
        .map((r) => ({
          slug: r.trek.slug,
          name: r.trek.name,
          state: r.trek.state,
          distanceKm: r.distanceKm as number,
        }))
    : [];

  return { intent, matches, nearby, usedEmbeddings };
}
