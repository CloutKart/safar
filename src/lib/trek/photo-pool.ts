import type { Trek, TrekPhoto } from "@/lib/trek/schema";

// Distribute a trek's REAL photo pool ([trek.photos], from Openverse) across the
// trail steps and the light/wildlife band. No representative fallback: a step
// only gets an image when a real pool photo is available, else null.

const WILDLIFE_RE =
  /\b(bear|leopard|tiger|monal|bharal|blue sheep|deer|tahr|ibex|langur|macaque|fox|marmot|pheasant|snowcock|gaur|bison|elephant|gibbon|takin|kiang|wild ass|griffon|eagle|bird|butterfly|snail|wildlife)\b/i;
const GOLDEN_RE = /\b(sunrise|sun rise|sunset|golden|dawn|dusk|alpenglow|first light)\b/i;

const GENERIC = new Set([
  "trek", "trekking", "summit", "lake", "pass", "camp", "base", "village", "forest",
  "meadow", "ridge", "stretch", "source", "water", "view", "opens", "temple", "peak",
  "valley", "glacier", "route", "trail", "point", "start", "this", "from", "near",
  "stage", "hidden", "moment", "section", "campsite", "alpine", "scrub", "panorama",
]);

function labelKeywords(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w));
}

export function isWildlifePhoto(p: TrekPhoto): boolean {
  return WILDLIFE_RE.test(p.title);
}

// Returns a photo (or null) per step, aligned to `steps`. Steps whose label names
// a landmark a pool photo's title matches get that exact photo; the rest receive
// the remaining scenic photos in order; once the pool is exhausted, null.
export function assignStepPhotos(
  trek: Trek,
  steps: Array<{ label: string }>,
): Array<TrekPhoto | null> {
  const scenic = trek.photos.filter((p) => !isWildlifePhoto(p));
  const used = new Set<number>();
  const result: Array<TrekPhoto | null> = steps.map(() => null);

  // 1) Named-landmark exact matches.
  steps.forEach((step, si) => {
    const kws = labelKeywords(step.label);
    if (kws.length === 0) return;
    const idx = scenic.findIndex(
      (p, pi) => !used.has(pi) && kws.some((k) => p.title.toLowerCase().includes(k)),
    );
    if (idx >= 0) {
      result[si] = scenic[idx];
      used.add(idx);
    }
  });

  // 2) Distribute the remaining scenic photos across the still-empty steps.
  const remaining = scenic.map((_, i) => i).filter((i) => !used.has(i));
  let pi = 0;
  for (let si = 0; si < steps.length && pi < remaining.length; si++) {
    if (result[si]) continue;
    result[si] = scenic[remaining[pi++]];
  }
  return result;
}

// Golden-hour / wildlife shots for the band — only when the trek's own pool has
// them (real, of this trek). Otherwise the band hides.
export function trekGoldenPhoto(trek: Trek): TrekPhoto | null {
  return trek.photos.find((p) => GOLDEN_RE.test(p.title)) ?? null;
}

export function trekWildlifePhotos(trek: Trek, n = 3): TrekPhoto[] {
  return trek.photos.filter(isWildlifePhoto).slice(0, n);
}

// A clean attribution name — Openverse's `creator` is sometimes a profile URL.
export function creditName(credit: string): string {
  if (/^https?:\/\//.test(credit)) {
    return decodeURIComponent(credit.replace(/\/+$/, "").split("/").pop() ?? "").replace(/^@/, "") || "Unknown";
  }
  return credit.trim() || "Unknown";
}
