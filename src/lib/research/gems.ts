import { z } from "zod";
import { env } from "@/lib/env";
import { generateStructured } from "@/lib/ai/client";

// "Places to visit" recommender for a city: aggregates real spots (incl. hidden
// gems) from Google Places, Atlas Obscura and Reddit, then dedupes, scores and
// types them. Every source degrades gracefully to [] when its key/data is
// missing, so this is safe to call with nothing configured (Atlas works free).

export type GemType =
  | "nature"
  | "viewpoint"
  | "food"
  | "history"
  | "quirky"
  | "experience";
export type GemSource = "places" | "atlas" | "reddit" | "wikivoyage";

export interface Gem {
  name: string;
  type: GemType;
  blurb: string;
  area: string | null;
  sources: GemSource[];
  score: number;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  // Google Places photo resource name (resolved to an image URL at plan time).
  photoRef: string | null;
}

const GEM_UA = "Safar/1.0 (group trip planner)";

export function gemKey(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeType(value: string): GemType {
  const text = value.toLowerCase();
  if (/food|eat|cafe|café|restaurant|drink|bakery|street.?food/.test(text)) return "food";
  if (/history|heritage|temple|fort|palace|monument|museum|tomb|church|mosque/.test(text)) return "history";
  if (/view|lookout|sunset|sunrise|vista|point/.test(text)) return "viewpoint";
  if (/nature|park|beach|trek|hike|lake|forest|waterfall|garden|wildlife/.test(text)) return "nature";
  if (/experience|activity|tour|workshop|class/.test(text)) return "experience";
  return "quirky";
}

// ── Google Places (New) ──────────────────────────────────────────────────────
const PLACES_FIELDS =
  "places.displayName,places.rating,places.userRatingCount,places.types,places.editorialSummary,places.googleMapsUri,places.location,places.formattedAddress,places.photos";

// Real "places to visit", not vendors. Services/lodging are dropped; a place
// must have an attraction (or food) type to count.
const FOOD_TYPES = new Set([
  "restaurant", "cafe", "bakery", "bar", "food_court", "ice_cream_shop", "tea_house",
]);
const ATTRACTION_TYPES = new Set([
  "tourist_attraction", "historical_landmark", "historical_place", "cultural_landmark",
  "monument", "national_park", "park", "state_park", "garden", "botanical_garden",
  "natural_feature", "beach", "hiking_area", "scenic_point", "scenic_spot",
  "observation_deck", "wildlife_park", "wildlife_refuge", "zoo", "aquarium", "museum",
  "art_gallery", "place_of_worship", "hindu_temple", "church", "mosque", "synagogue",
  "buddhist_temple", "market", "plaza", "waterfall", "lake", "amusement_park",
]);
const DENY_TYPES = new Set([
  "travel_agency", "tour_agency", "tour_operator", "lodging", "hotel", "hostel",
  "guest_house", "resort_hotel", "motel", "bed_and_breakfast", "real_estate_agency",
  "store", "shopping_mall", "car_rental", "taxi_service", "insurance_agency",
  "corporate_office", "atm", "bank", "parking",
]);

function mapPlaceType(types: string[] = []): GemType {
  const has = (re: RegExp) => types.some((t) => re.test(t));
  if (has(/restaurant|cafe|bakery|bar|food|ice_cream|tea_house/)) return "food";
  if (has(/scenic|view|observation|lookout/)) return "viewpoint";
  if (has(/museum|history|temple|church|mosque|synagogue|monument|landmark|fort|palace|tomb|memorial|cultural|place_of_worship|market/))
    return "history";
  if (has(/park|natural|forest|garden|beach|hiking|trail|waterfall|lake|wildlife|zoo|aquarium/))
    return "nature";
  return "quirky";
}

// Returns a gem type if this is a real attraction/eatery, else null (filtered).
function classifyPlace(types: string[] = []): GemType | null {
  if (types.some((t) => DENY_TYPES.has(t))) return null;
  if (types.some((t) => FOOD_TYPES.has(t))) return "food";
  if (!types.some((t) => ATTRACTION_TYPES.has(t))) return null;
  return mapPlaceType(types);
}

async function placesSearch(query: string): Promise<Record<string, unknown>[]> {
  if (!env.GOOGLE_PLACES_KEY) return [];
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_KEY,
      "X-Goog-FieldMask": PLACES_FIELDS,
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "IN",
      languageCode: "en",
      maxResultCount: 20,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { places?: Record<string, unknown>[] };
  return data.places ?? [];
}

async function fromPlaces(city: string): Promise<Gem[]> {
  if (!env.GOOGLE_PLACES_KEY) return [];
  const queries = [
    `top attractions in ${city}`,
    `offbeat sights and hidden gems in ${city}`,
    `historic and scenic places in ${city}`,
    `best local food in ${city}`,
  ];
  const byKey = new Map<string, Gem>();
  for (const query of queries) {
    const places = await placesSearch(query).catch(() => []);
    for (const place of places) {
      const name = (place.displayName as { text?: string } | undefined)?.text;
      if (!name) continue;
      const types = (place.types as string[] | undefined) ?? [];
      const type = classifyPlace(types);
      if (!type) continue; // drop vendors / lodging / non-attractions
      const rating = typeof place.rating === "number" ? place.rating : null;
      if (rating != null && rating < 4.2) continue; // keep well-liked spots
      const reviews =
        typeof place.userRatingCount === "number" ? place.userRatingCount : null;
      if (reviews != null && reviews < 30) continue; // too obscure to trust
      const key = gemKey(name);
      if (byKey.has(key)) continue;
      const location = place.location as { latitude?: number; longitude?: number } | undefined;
      byKey.set(key, {
        name,
        type,
        blurb: (place.editorialSummary as { text?: string } | undefined)?.text ?? "",
        area: (place.formattedAddress as string | undefined) ?? null,
        sources: ["places"],
        score: 0,
        rating,
        reviewCount: reviews,
        mapsUrl: (place.googleMapsUri as string | undefined) ?? null,
        lat: location?.latitude ?? null,
        lng: location?.longitude ?? null,
        photoRef:
          (place.photos as Array<{ name?: string }> | undefined)?.[0]?.name ?? null,
      });
    }
  }
  return [...byKey.values()];
}

// ── Atlas Obscura (HTML, best-effort) ────────────────────────────────────────
// Recursively gather every JSON-LD itemListElement.item (the ItemList is nested
// under @graph[].mainEntity on Atlas pages).
function collectListItems(
  node: unknown,
  out: Array<{ name?: string; url?: string }>,
): void {
  if (Array.isArray(node)) {
    for (const child of node) collectListItems(child, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.itemListElement)) {
    for (const element of obj.itemListElement) {
      const item = (element as { item?: { name?: string; url?: string } }).item;
      if (item && typeof item === "object") out.push(item);
    }
  }
  for (const value of Object.values(obj)) collectListItems(value, out);
}

async function fromAtlas(city: string): Promise<Gem[]> {
  const slug = city
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const candidates = [`${slug}-india`, slug];
  let html = "";
  for (const candidate of candidates) {
    const response = await fetch(
      `https://www.atlasobscura.com/things-to-do/${candidate}`,
      { headers: { "User-Agent": GEM_UA }, signal: AbortSignal.timeout(12_000) },
    ).catch(() => null);
    if (response?.ok) {
      html = await response.text();
      break;
    }
  }
  if (!html) return [];
  // The city's actual attractions live in a JSON-LD ItemList of
  // TouristAttraction items (proper names + /places/ URLs), nested under
  // @graph[].mainEntity. Walking for any itemListElement — rather than scraping
  // every /places/ link — avoids the "popular elsewhere" rail's foreign noise.
  const blocks = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ].map((m) => m[1]);
  const items: Array<{ name?: string; url?: string }> = [];
  for (const raw of blocks) {
    try {
      collectListItems(JSON.parse(raw.trim()), items);
    } catch {
      // malformed block; skip
    }
  }
  const gems: Gem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const name = item.name?.trim();
    const url = item.url ?? "";
    if (!name || !url.includes("/places/")) continue;
    const key = gemKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    gems.push({
      name,
      type: "quirky",
      blurb: "",
      area: null,
      sources: ["atlas"],
      score: 0,
      rating: null,
      reviewCount: null,
      mapsUrl: url,
      lat: null,
      lng: null,
      photoRef: null,
    });
    if (gems.length >= 14) break;
  }
  return gems;
}

// ── Reddit (via the standalone Playwright scraper) + LLM extraction ───────────
// Reddit's API is gated (OAuth-only, no new free keys, plus bot detection), so
// the actual browser-context fetch lives in the /scraper service. Here we just
// call it for raw posts and run our own LLM to extract places.
const GemExtractSchema = z.object({
  gems: z.array(
    z.object({ name: z.string(), type: z.string().default("quirky"), blurb: z.string().default("") }),
  ),
});

const REDDIT_SYSTEM = `Extract specific, real places to visit that redditors recommend in the given city — favour lesser-known / local / offbeat spots over the obvious headline sights. Output STRICT JSON: {"gems":[{"name":string,"type":"nature"|"viewpoint"|"food"|"history"|"quirky"|"experience","blurb":string}]}. "blurb" is one short line on why it's worth it. Only include named places clearly in that city. Skip generic advice and anything not a real place.`;

async function fromReddit(city: string): Promise<Gem[]> {
  if (!env.REDDIT_SCRAPER_URL) return [];
  const response = await fetch(`${env.REDDIT_SCRAPER_URL.replace(/\/$/, "")}/reddit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.SCRAPER_TOKEN ? { Authorization: `Bearer ${env.SCRAPER_TOKEN}` } : {}),
    },
    body: JSON.stringify({ city }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!response?.ok) return [];
  const data = (await response.json()) as {
    posts?: Array<{ title?: string; selftext?: string; comments?: string[] }>;
  };
  const corpus = (data.posts ?? [])
    .map((post) =>
      [
        post.title ?? "",
        (post.selftext ?? "").slice(0, 400),
        (post.comments ?? []).join("\n"),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n---\n")
    .slice(0, 9000);
  if (!corpus.trim()) return [];
  const extracted = await generateStructured({
    schema: GemExtractSchema,
    system: REDDIT_SYSTEM,
    user: JSON.stringify({ city, redditPosts: corpus }),
  }).catch(() => null);
  if (!extracted) return [];
  return extracted.gems.map((gem) => ({
    name: gem.name,
    type: normalizeType(gem.type),
    blurb: gem.blurb,
    area: null,
    sources: ["reddit"] as GemSource[],
    score: 0,
    rating: null,
    reviewCount: null,
    mapsUrl: null,
    lat: null,
    lng: null,
    photoRef: null,
  }));
}

// ── Wikivoyage (free, open, no key, never IP-blocked) ────────────────────────
// Wikivoyage city pages list named places in structured {{see}}/{{do}}/{{eat}}
// templates, so we parse them directly — no LLM needed.
const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";

function wikiField(block: string, field: string): string | null {
  const match = block.match(new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\n|}]*)`, "i"));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function cleanWiki(text: string): string {
  return text
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1") // [[link|label]] → label
    .replace(/\[\[([^\]]*)\]\]/g, "$1") // [[link]] → link
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1") // [url label] → label
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wikiGemType(kind: string, content: string): GemType {
  if (kind === "eat" || kind === "drink") return "food";
  if (kind === "do") return "experience";
  if (kind === "buy") return "quirky";
  const c = content.toLowerCase();
  if (/view\s?point|sunset point|overlook|panoram/.test(c)) return "viewpoint";
  if (/lake|garden|park|hill|waterfall|beach|valley|wildlife|forest|nature|river|island/.test(c))
    return "nature";
  if (/temple|fort|palace|museum|church|mosque|tomb|monument|heritage|historic|ruins|gate|haveli|memorial|ghat/.test(c))
    return "history";
  return "history";
}

async function fromWikivoyage(city: string): Promise<Gem[]> {
  const params = new URLSearchParams({
    action: "parse",
    page: city,
    prop: "wikitext",
    format: "json",
    formatversion: "2",
    redirects: "1",
  });
  const response = await fetch(`${WIKIVOYAGE_API}?${params}`, {
    headers: { "User-Agent": GEM_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) return [];
  const data = (await response.json()) as { parse?: { wikitext?: string } };
  const wikitext = data.parse?.wikitext;
  if (!wikitext) return [];

  const gems: Gem[] = [];
  const seen = new Set<string>();
  // A balanced spread: sights, then things to do, then where to eat.
  const buckets: Array<[string, number]> = [["see", 6], ["do", 3], ["eat", 3]];
  for (const [kind, cap] of buckets) {
    const blocks =
      wikitext.match(new RegExp(`\\{\\{\\s*${kind}\\b[\\s\\S]*?\\}\\}`, "gi")) ?? [];
    let added = 0;
    for (const block of blocks) {
      if (added >= cap) break;
      const rawName = wikiField(block, "name");
      if (!rawName) continue;
      const name = cleanWiki(rawName);
      const key = gemKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const contentMatch = block.match(/\|\s*content\s*=\s*([\s\S]*?)(?:\n\s*\||\}\})/i);
      const blurb = cleanWiki(contentMatch?.[1] ?? "").slice(0, 180);
      const lat = Number(wikiField(block, "lat"));
      const lng = Number(wikiField(block, "long"));
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
      gems.push({
        name,
        type: wikiGemType(kind, blurb),
        blurb,
        area: wikiField(block, "address"),
        sources: ["wikivoyage"],
        score: 0,
        rating: null,
        reviewCount: null,
        mapsUrl: hasCoords
          ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
          : null,
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        photoRef: null,
      });
      added += 1;
    }
  }
  return gems;
}

// ── Merge + score ────────────────────────────────────────────────────────────
function scoreGem(gem: Gem): number {
  let score = 0;
  if (gem.sources.includes("places")) score += 40;
  if (gem.sources.includes("atlas")) score += 28;
  if (gem.sources.includes("reddit")) score += 28;
  if (gem.sources.includes("wikivoyage")) score += 26;
  if (gem.sources.length > 1) score += 22; // cross-source agreement
  if (gem.rating != null) score += (gem.rating - 4) * 15;
  // hidden-gem signal: well-rated but not flooded with reviews
  if (gem.rating != null && gem.reviewCount != null && gem.rating >= 4.4 && gem.reviewCount <= 1500)
    score += 15;
  if (gem.reviewCount != null && gem.reviewCount < 25) score -= 8;
  return Math.round(score);
}

function mergeGems(lists: Gem[][]): Gem[] {
  const byKey = new Map<string, Gem>();
  for (const gem of lists.flat()) {
    const key = gemKey(gem.name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.sources = [...new Set([...existing.sources, ...gem.sources])];
      existing.rating ??= gem.rating;
      existing.reviewCount ??= gem.reviewCount;
      existing.mapsUrl ??= gem.mapsUrl;
      existing.area ??= gem.area;
      existing.lat ??= gem.lat;
      existing.lng ??= gem.lng;
      existing.blurb = existing.blurb || gem.blurb;
      if (existing.type === "quirky" && gem.type !== "quirky") existing.type = gem.type;
    } else {
      byKey.set(key, { ...gem });
    }
  }
  const merged = [...byKey.values()];
  for (const gem of merged) gem.score = scoreGem(gem);
  return merged.sort((a, b) => b.score - a.score);
}

const gemCache = new Map<string, { gems: Gem[]; at: number }>();
const GEM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// A genuine hidden gem is a well-rated spot tourists haven't flooded (modest
// review count) or a Reddit community pick — NOT a headline attraction with
// tens of thousands of reviews. Source alone isn't the signal: Atlas/Wikivoyage
// list famous sights too, so we key off review volume.
const TOURIST_FLOOD_REVIEWS = 3000;
export function isHiddenGem(gem: Gem): boolean {
  if (gem.reviewCount != null && gem.reviewCount > TOURIST_FLOOD_REVIEWS) return false;
  if (gem.sources.includes("reddit")) return true;
  return (
    gem.rating != null &&
    gem.rating >= 4.3 &&
    gem.reviewCount != null &&
    gem.reviewCount >= 30 &&
    gem.reviewCount <= TOURIST_FLOOD_REVIEWS
  );
}

// Reserve roughly half the slots for genuine hidden gems so the result is a
// real mix of well-known must-sees and lesser-known local spots.
function selectWithVariety(sorted: Gem[], limit: number): Gem[] {
  const chosen = new Set<Gem>();
  const hiddenTarget = Math.ceil(limit / 2);
  for (const gem of sorted.filter(isHiddenGem)) {
    if (chosen.size >= hiddenTarget) break;
    chosen.add(gem);
  }
  for (const gem of sorted) {
    if (chosen.size >= limit) break;
    chosen.add(gem);
  }
  return [...chosen].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getGems(city: string, limit = 12): Promise<Gem[]> {
  // Keep the test suite hermetic — these fetchers reach the network.
  if (process.env.NODE_ENV === "test") return [];
  const key = gemKey(city);
  const cached = gemCache.get(key);
  if (cached && Date.now() - cached.at < GEM_TTL_MS)
    return selectWithVariety(cached.gems, limit);
  const [places, atlas, reddit, wikivoyage] = await Promise.all([
    fromPlaces(city).catch(() => []),
    fromAtlas(city).catch(() => []),
    fromReddit(city).catch(() => []),
    fromWikivoyage(city).catch(() => []),
  ]);
  const gems = mergeGems([places, atlas, reddit, wikivoyage]);
  gemCache.set(key, { gems, at: Date.now() });
  return selectWithVariety(gems, limit);
}
