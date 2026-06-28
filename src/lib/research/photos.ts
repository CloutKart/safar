import { env } from "@/lib/env";
import { isHiddenGem, type Gem } from "@/lib/research/gems";

export interface DestinationImage {
  type: "hero" | "popular" | "hidden_gem" | "culture";
  url: string;
  // V1.3 themed label ("Morning", "Waterfall", "Café", "Sunset"…).
  caption: string;
}

const PHOTO_UA = "Safar/1.0 (group trip planner)";

// Resolve a Google Places photo resource to a keyless image URL. skipHttpRedirect
// returns the photoUri as JSON, so the API key never reaches the client. `width`
// is bumped for the hero so the big lead image stays crisp.
async function resolvePlacePhoto(
  photoRef: string | null,
  width = 900,
): Promise<string | null> {
  if (!photoRef || !env.GOOGLE_PLACES_KEY) return null;
  const url = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=${width}&skipHttpRedirect=true&key=${env.GOOGLE_PLACES_KEY}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(
    () => null,
  );
  if (!response?.ok) return null;
  const data = (await response.json()) as { photoUri?: string };
  return data.photoUri ?? null;
}

// A short, evocative caption for a gem photo, from its type/name.
function captionFor(gem: Gem | undefined, fallback: string): string {
  if (!gem) return fallback;
  const name = gem.name.toLowerCase();
  if (/sunset|dusk/.test(name)) return "Sunset";
  if (/sunrise|dawn|morning/.test(name)) return "Morning";
  if (/waterfall|fall\b|falls\b/.test(name)) return "Waterfall";
  if (/caf[eé]|coffee|bakery|roast/.test(name)) return "Café";
  if (/view|point|vista|cliff|valley|lake/.test(name)) return "The view";
  if (gem.type === "food") return "Local food";
  if (gem.type === "viewpoint") return "The view";
  if (gem.type === "history") return "Heritage";
  if (gem.type === "nature") return "Nature";
  return fallback;
}

// Free fallback: a lead image from Wikipedia for a place/city name.
export async function wikiImage(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": PHOTO_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json()) as {
    type?: string;
    originalimage?: { source?: string };
    thumbnail?: { source?: string };
  };
  if (data.type === "disambiguation") return null;
  return data.originalimage?.source ?? data.thumbnail?.source ?? null;
}

// Try several Wikipedia titles in order (most specific landmark first), returning
// the first lead image. Used as the trek hero fallback so an uncurated trek lands
// on a relevant landmark photo rather than an unrelated city shot.
export async function wikiImageFromCandidates(titles: Array<string | null | undefined>): Promise<string | null> {
  for (const title of titles) {
    const clean = title?.trim();
    if (!clean) continue;
    const img = await wikiImage(clean);
    if (img) return img;
  }
  return null;
}

// Four reference images per plan: a hero, a popular sight, a hidden gem, and a
// food/culture shot — drawn from the destination's gem photos with a free
// Wikipedia hero fallback. Bounded to five parallel fetches.
export async function planPhotos(
  destinationName: string,
  gems: Gem[],
): Promise<DestinationImage[]> {
  const withPhoto = gems.filter((gem) => gem.photoRef);
  const popularGem = withPhoto.find((gem) => !isHiddenGem(gem));
  const hiddenGem = withPhoto.find((gem) => isHiddenGem(gem) && gem !== popularGem);
  const foodGem = withPhoto.find(
    (gem) => gem.type === "food" && gem !== popularGem && gem !== hiddenGem,
  );
  const extraGem = withPhoto.find(
    (gem) => gem !== popularGem && gem !== hiddenGem && gem !== foodGem,
  );

  // The hero is the strongest real shot at high res — the best popular sight if
  // it has a photo, else the destination's Wikipedia lead image. The strip then
  // shows the OTHER gems (hidden / food / extra), so the hero is never repeated.
  const [heroWiki, heroPlace, hidden, culture, extra] = await Promise.all([
    wikiImage(destinationName),
    resolvePlacePhoto(popularGem?.photoRef ?? null, 1600),
    resolvePlacePhoto(hiddenGem?.photoRef ?? null),
    resolvePlacePhoto(foodGem?.photoRef ?? null),
    resolvePlacePhoto(extraGem?.photoRef ?? null),
  ]);

  const images: DestinationImage[] = [];
  const seen = new Set<string>();
  const push = (
    type: DestinationImage["type"],
    url: string | null,
    caption: string,
  ) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push({ type, url, caption });
    }
  };
  push("hero", heroPlace ?? heroWiki ?? hidden, destinationName);
  push("hidden_gem", hidden, captionFor(hiddenGem, "Hidden gem"));
  push("culture", culture, captionFor(foodGem, "Café"));
  push("popular", extra, captionFor(extraGem, "The view"));
  return images.slice(0, 4);
}
