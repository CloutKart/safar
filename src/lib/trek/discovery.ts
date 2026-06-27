import { lookupCoords } from "@/lib/cityCoords";
import { gemKey } from "@/lib/research/gems";
import { getTrails, isHiddenTrail, type Trail } from "@/lib/research/trails";
import { treks } from "@/data/treks";

// Offbeat-trek discovery (first slice): reuse the planner's live Overpass/OSM +
// Reddit trail aggregation to surface trails NOT already in the curated trek seed,
// as UNVERIFIED candidates for review. Not the full triangulation/clustering
// engine — just "what's out there near here that we don't already have", offbeat
// first. Degrades to empty when the live sources are unavailable.

export interface TrekCandidate {
  name: string;
  difficulty: string | null;
  distanceKm: number | null;
  maxAltitudeM: number | null;
  source: string;
  hidden: boolean;
  routeUrl: string | null;
  blurb: string;
}

const seedKeys = new Set(treks.map((t) => gemKey(t.name)));

// Novel = a live (OSM/Reddit) find that isn't curated and isn't already a seed trek.
export function filterNovelCandidates(trails: Trail[], known: Set<string> = seedKeys): TrekCandidate[] {
  const seen = new Set<string>();
  const out: TrekCandidate[] = [];
  for (const t of trails) {
    if (t.sources.includes("curated")) continue; // already in our backbone
    const k = gemKey(t.name);
    if (!k || known.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({
      name: t.name,
      difficulty: t.difficulty,
      distanceKm: t.distanceKm,
      maxAltitudeM: t.maxAltitudeM,
      source: t.sources.join("+"),
      hidden: isHiddenTrail(t),
      routeUrl: t.routeUrl,
      blurb: t.blurb,
    });
  }
  // Offbeat first.
  return out.sort((a, b) => Number(b.hidden) - Number(a.hidden));
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function discoverCandidates(
  near: string,
  limit = 8,
): Promise<{ near: string; located: boolean; candidates: TrekCandidate[] }> {
  const coords = lookupCoords(near);
  const trails = await getTrails(slugify(near), near, coords, limit * 3);
  return { near, located: Boolean(coords), candidates: filterNovelCandidates(trails).slice(0, limit) };
}
