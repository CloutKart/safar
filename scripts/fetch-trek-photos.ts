/**
 * Real trek photo curation — builds src/data/trek-photos.ts, a per-trek pool of
 * REAL, commercial-safe CC photos (Openverse aggregates Flickr + Wikimedia
 * Commons and returns the license + attribution we must show). NOT a runtime
 * path. Queries each trek by name + its named landmarks; obscure treks with no
 * results get no photos (the page then shows no step images — never a
 * representative stand-in).
 *
 *   npx tsx scripts/fetch-trek-photos.ts [--limit N]
 *
 * Review the generated file for relevance before committing.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { treks } from "../src/data/treks";

const UA = "Safar/1.0 (trek photo curation; +https://github.com/CloutKart/safar)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Photo {
  url: string;
  title: string;
  credit: string;
  license: string;
  sourceUrl: string | null;
}

// Drop maps/signs/logos, species macros (real but not scenic) and wrong-"Gaumukh"
// style collisions.
const NOISE =
  /\b(map|signboard|route map|diagram|logo|chart|graph|poster|ticket|brochure|gps|elevation profile|reservoir|fort|temple complex|butterfly|moth|snail|orchid|beetle|spider|fungus|mushroom|caterpillar|dragonfly|lichen|frog|gecko|lizard|insect|wasp|bee|ariophanta|impatiens|satyrium|saussurea|papilio|costus)\b/i;


function formatLicense(license: string, version: string): string {
  if (license === "cc0") return "CC0 1.0";
  return `CC ${license.toUpperCase()}${version ? ` ${version}` : ""}`;
}

async function openverse(query: string): Promise<Photo[]> {
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
    `&license=cc0,by,by-sa&page_size=8&mature=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json()) as {
    results?: Array<{
      url?: string;
      title?: string;
      creator?: string;
      license?: string;
      license_version?: string;
      foreign_landing_url?: string;
    }>;
  };
  return (data.results ?? [])
    .filter((r) => r.url && r.title && !NOISE.test(r.title))
    .map((r) => ({
      url: r.url!,
      title: r.title!.trim().slice(0, 120),
      credit: (r.creator ?? "").trim().slice(0, 80),
      license: formatLicense(r.license ?? "", r.license_version ?? ""),
      sourceUrl: r.foreign_landing_url ?? null,
    }));
}

// Pull proper-noun landmark queries from a trek's named waypoints (skip generic
// labels) so we also fetch shots of the specific summit/lake/pass.
function landmarkQueries(trek: (typeof treks)[number]): string[] {
  const out: string[] = [];
  for (const w of trek.timeline) {
    if (!["summit", "lake", "pass", "viewpoint"].includes(w.type)) continue;
    // Strip altitude suffixes and qualifiers: "Kedarkantha summit, 3,810 m" → "Kedarkantha".
    const name = w.label.split(/[,(]/)[0].replace(/\b(summit|temple|top|pass|lake|via|trail|viewpoint|panorama|reflection point)\b/gi, "").trim();
    if (name.length >= 4 && /[A-Z]/.test(name) && !out.includes(name)) out.push(name);
    if (out.length >= 2) break;
  }
  return out;
}

// Extra queries for famous treks whose photos hide under sub-feature names
// (individual lakes, peaks, viewpoints) rather than the trek's own name.
const SUPPLEMENTAL: Record<string, string[]> = {
  "kashmir-great-lakes": ["Vishansar Lake", "Gangbal Lake", "Gadsar Lake", "Nundkol Lake", "Satsar Kashmir"],
  "sandakphu-phalut": ["Sandakphu", "Kanchenjunga from Sandakphu", "Sleeping Buddha Himalaya", "Phalut"],
  "goecha-la": ["Goecha La", "Dzongri Sikkim", "Kanchenjunga Goecha La", "Samiti Lake"],
  "stok-kangri": ["Stok Kangri", "Stok Kangri summit Ladakh"],
  "markha-valley-trek": ["Markha Valley", "Kang Yatse", "Nimaling Ladakh"],
  "valley-of-flowers": ["Valley of Flowers National Park", "Hemkund Sahib", "Pushpawati valley"],
  "kuari-pass": ["Gorson Bugyal", "Nanda Devi from Kuari Pass", "Auli Uttarakhand"],
  "dzukou-valley": ["Dzukou Valley", "Japfu Peak", "Dzukou lily"],
  "kumara-parvatha": ["Kumara Parvatha", "Pushpagiri Karnataka", "Kukke Subramanya"],
  "tirthan-valley": ["Tirthan Valley", "Great Himalayan National Park", "Jalori Pass"],
  "kafni-glacier": ["Kafni Glacier", "Pindari Khati", "Dwali Uttarakhand"],
  "milam-glacier": ["Milam Glacier", "Munsiyari", "Nanda Devi East"],
  "gangabal-lakes": ["Gangbal Lake", "Mount Harmukh", "Naranag Kashmir"],
  "madmaheshwar": ["Madhyamaheshwar", "Madmaheshwar temple", "Chaukhamba Uttarakhand"],
  "pangarchulla": ["Pangarchulla Peak", "Khullara Uttarakhand", "Kuari Pass Auli"],
  "panchachuli-base-camp": ["Panchachuli", "Panchachuli peaks Munsiyari", "Darma valley"],
  "miyar-valley": ["Miyar Valley", "Lahaul Spiti landscape", "Kang La Himachal"],
};

async function poolFor(trek: (typeof treks)[number]): Promise<Photo[]> {
  // Multi-word trek names are specific enough on their own (good recall); single-
  // name landmarks get the state appended to fight same-name collisions. NOISE +
  // the species/reservoir filter handles the wrong-place / macro cases.
  const queries = [
    trek.name,
    ...landmarkQueries(trek).map((q) => `${q} ${trek.state}`),
    ...(SUPPLEMENTAL[trek.slug] ?? []),
  ];
  const byUrl = new Map<string, Photo>();
  const byTitle = new Set<string>();
  for (const q of queries) {
    for (const p of await openverse(q)) {
      const tkey = p.title.toLowerCase().replace(/^file:/, "").trim();
      if (byUrl.has(p.url) || byTitle.has(tkey)) continue;
      byUrl.set(p.url, { ...p, title: p.title.replace(/^File:/, "").replace(/\.(jpe?g|png)$/i, "").trim() });
      byTitle.add(tkey);
      if (byUrl.size >= 6) break;
    }
    await sleep(900); // be polite to Openverse
    if (byUrl.size >= 6) break;
  }
  return [...byUrl.values()];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
  // --merge keeps each trek's already-baked pool and only tops up the thin/empty
  // ones (named-feature queries for famous treks whose photos hide under
  // sub-feature names), so a re-run never regresses a good pool.
  const merge = args.includes("--merge");
  const list = treks.slice(0, limit);

  const out: Record<string, Photo[]> = {};
  let withPhotos = 0;
  for (const trek of list) {
    const existing = merge ? (trek.photos as Photo[]) : [];
    if (existing.length >= 6) {
      out[trek.slug] = existing;
      withPhotos++;
      console.log(`• ${trek.name} … ${existing.length} (kept)`);
      continue;
    }
    process.stdout.write(`• ${trek.name} … `);
    const fresh = await poolFor(trek);
    const merged = [...existing];
    const urls = new Set(existing.map((p) => p.url));
    for (const p of fresh) {
      if (!urls.has(p.url) && merged.length < 6) {
        merged.push(p);
        urls.add(p.url);
      }
    }
    if (merged.length > 0) {
      out[trek.slug] = merged;
      withPhotos++;
    }
    console.log(`${existing.length}→${merged.length} photo(s)`);
  }

  const body = Object.entries(out)
    .map(([slug, photos]) => `  ${JSON.stringify(slug)}: ${JSON.stringify(photos, null, 2).replace(/\n/g, "\n  ")},`)
    .join("\n");
  const file = `// Auto-generated by scripts/fetch-trek-photos.ts — REAL, commercial-safe CC
// photos of each trek (Openverse: Flickr + Wikimedia Commons), with attribution.
// Reviewed for relevance. Treks absent here have no real photos available and
// show no step images (never a representative stand-in).
import type { TrekPhoto } from "@/lib/trek/schema";

export const TREK_PHOTOS: Record<string, TrekPhoto[]> = {
${body}
};
`;
  writeFileSync(join(import.meta.dirname, "..", "src", "data", "trek-photos.ts"), file);
  console.log(`\nDone. ${withPhotos}/${list.length} treks have photos → src/data/trek-photos.ts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
