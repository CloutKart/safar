import { env } from "@/lib/env";
import { isHiddenGem, type Gem } from "@/lib/research/gems";

export interface DestinationImage {
  type: "hero" | "popular" | "hidden_gem" | "culture";
  url: string;
}

const PHOTO_UA = "Safar/1.0 (group trip planner)";

// Resolve a Google Places photo resource to a keyless image URL. skipHttpRedirect
// returns the photoUri as JSON, so the API key never reaches the client.
async function resolvePlacePhoto(photoRef: string | null): Promise<string | null> {
  if (!photoRef || !env.GOOGLE_PLACES_KEY) return null;
  const url = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=900&skipHttpRedirect=true&key=${env.GOOGLE_PLACES_KEY}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(
    () => null,
  );
  if (!response?.ok) return null;
  const data = (await response.json()) as { photoUri?: string };
  return data.photoUri ?? null;
}

// Free fallback: a lead image from Wikipedia for a place/city name.
async function wikiImage(title: string): Promise<string | null> {
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

  const [heroWiki, popular, hidden, culture, extra] = await Promise.all([
    wikiImage(destinationName),
    resolvePlacePhoto(popularGem?.photoRef ?? null),
    resolvePlacePhoto(hiddenGem?.photoRef ?? null),
    resolvePlacePhoto(foodGem?.photoRef ?? null),
    resolvePlacePhoto(extraGem?.photoRef ?? null),
  ]);

  const images: DestinationImage[] = [];
  const seen = new Set<string>();
  const push = (type: DestinationImage["type"], url: string | null) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      images.push({ type, url });
    }
  };
  push("hero", heroWiki ?? extra);
  push("popular", popular);
  push("hidden_gem", hidden);
  push("culture", culture);
  if (images.length < 4) push("popular", extra);
  return images.slice(0, 4);
}
