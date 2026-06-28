/**
 * Trek ingestion pipeline — drafts new Trek Knowledge Graph records for review.
 *
 * NOT a runtime path. Run locally to expand the seed corpus in data/treks.ts.
 * Per-trek it: (A) pulls HARD FACTS that can be verified — trailhead/article
 * coordinates from Wikipedia + a terrain-elevation cross-check from the keyless
 * Open-Meteo elevation API — and (B) drafts the EXPERIENTIAL fields (Trek DNA,
 * scenic density, blurb, hidden moments…) with the chat LLM, anchored to a gold
 * example. Every draft is gated through the real `TrekSchema` so authoring
 * errors fail at generate time, never at app load. Verified facts override the
 * LLM; the LLM never invents coordinates, elevation, or emergency contacts.
 *
 *   npx tsx scripts/ingest-treks.ts [candidates.json] [--limit N]
 *
 * Outputs to scripts/out/:
 *   treks-draft.ts      — ready-to-review `raw` entries to paste into treks.ts
 *   ingest-report.json  — per-trek: which facts were verified vs LLM-only
 *   treks-rejected.json — drafts that failed TrekSchema, with the error to fix
 *
 * Needs the same LLM env the app uses (LLM_API_URL / LLM_API_KEY / LLM_MODEL),
 * read from the environment or a local .env.local. Without them, the script
 * still emits hard facts but leaves experiential fields blank for manual fill.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { TrekSchema, type Trek } from "../src/lib/trek/schema";

const ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(import.meta.dirname, "out");

// ── Tiny .env.local loader (no dependency) ───────────────────────────────────
// tsx does not auto-load env files; mirror Next's .env.local so the script picks
// up the same LLM_* keys the dev server uses. Existing process.env wins.
function loadEnvLocal(): void {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ── Input ────────────────────────────────────────────────────────────────────
// A candidate is the minimum a human supplies: a name + state, plus optional
// hints. `articleTitle` overrides the Wikipedia lookup when the trek's article
// is named differently from the trek (e.g. the peak or lake it climbs to).
const CandidateSchema = z.object({
  name: z.string(),
  state: z.string(),
  region: z.string().optional().default(""),
  nearestCity: z.string().optional().default(""),
  destinationSlug: z.string().optional().default(""),
  trailhead: z.string().optional().default(""),
  articleTitle: z.string().optional(),
});
type Candidate = z.infer<typeof CandidateSchema>;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ── (A) Verifiable hard facts ────────────────────────────────────────────────
const UA = "Safar-ingest/1.0 (trek corpus builder)";

interface WikiFacts {
  coords: [number, number] | null;
  extract: string;
}

// Wikipedia REST summary → article coordinates (usually the peak/lake the trek
// is named for, a good anchor for maxAltitude) and a prose extract for the LLM.
async function wikiFacts(title: string): Promise<WikiFacts> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return { coords: null, extract: "" };
  const data = (await res.json()) as {
    type?: string;
    extract?: string;
    coordinates?: { lat?: number; lon?: number };
  };
  if (data.type === "disambiguation") return { coords: null, extract: "" };
  const lat = data.coordinates?.lat;
  const lon = data.coordinates?.lon;
  return {
    coords: typeof lat === "number" && typeof lon === "number" ? [round(lat, 4), round(lon, 4)] : null,
    extract: data.extract ?? "",
  };
}

// Terrain elevation at a point (keyless Open-Meteo) — cross-checks the LLM's
// maxAltitude when the article coords sit at the summit/lake.
async function elevationAt(coords: [number, number]): Promise<number | null> {
  const [lat, lng] = coords;
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as { elevation?: number[] };
  const m = data.elevation?.[0];
  return typeof m === "number" ? Math.round(m) : null;
}

// ── (B) Experiential draft via the chat LLM ──────────────────────────────────
// Self-contained OpenAI-compatible call (no app rate-gate) with visible errors
// and gentle throttling, so a batch stays under the Groq free-tier RPM.
async function llmJson(system: string, user: string): Promise<unknown | null> {
  const url = process.env.LLM_API_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!url || !key || !model) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
  }).catch((e) => {
    console.warn(`  LLM fetch failed: ${String(e)}`);
    return null;
  });
  if (!res) return null;
  if (!res.ok) {
    console.warn(`  LLM ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return null;
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    console.warn("  LLM returned non-JSON");
    return null;
  }
}

const SYSTEM = `You are a meticulous trek-data editor for "Safar", an Indian trekking planner.
You output ONE JSON object describing a single trek, matching the field names in the gold example exactly.

RULES — non-negotiable:
- Output JSON only. No prose, no markdown.
- These are CURATED, COMMUNITY-INFORMED ESTIMATES, not survey data. When unsure, choose conservative, typical values — never invent precise specifics.
- NEVER fabricate emergency phone numbers, helplines, real-time conditions, or named contacts. The "emergency" object holds ONLY: nearestTown (string) and evacNote (a calm, generic "road head at X; nearest hospital in Y" sentence). Nothing else.
- Do NOT output coordinates or maxAltitudeM you are unsure of — set them to null; the pipeline verifies them separately.
- "dna" is twelve integers 0-10. crowds = how BUSY it is (high = crowded). difficulty mirrors the grade as a number.
- difficultyProfile km ranges must be ascending and lie within distanceKm. timeline km must be <= distanceKm.
- bestMonths are integers 1-12. routeType is one of "loop" | "out-and-back" | "point-to-point".
- difficulty is one of "easy" | "moderate" | "hard" | "expert".
- Keep blurb under 90 chars; description 2-3 evocative but factual sentences in a warm, grounded voice.`;

// A trimmed gold record (real seed entry) so the model copies the exact shape.
const GOLD_EXAMPLE = {
  slug: "chandrashila-tungnath",
  name: "Chandrashila Summit via Tungnath",
  state: "Uttarakhand",
  region: "Garhwal Himalaya",
  destinationSlug: "chopta",
  nearestCity: "Rishikesh",
  trailheadCoords: [30.49, 79.22],
  trailhead: "Chopta",
  distanceKm: 9,
  elevationGainM: 1000,
  maxAltitudeM: 4000,
  difficulty: "moderate",
  durationHours: 6,
  routeType: "out-and-back",
  permitRequired: false,
  guideRecommended: false,
  bestMonths: [4, 5, 6, 9, 10, 11],
  blurb: "summit above the world's highest Shiva temple, 360° Himalayan views",
  description:
    "A rhododendron-lined climb to Tungnath, the highest Shiva temple on earth, then a final push to the Chandrashila summit where Nanda Devi, Trishul and Chaukhamba ring the horizon. The most rewarding beginner-friendly summit in Garhwal — magic at sunrise, busy by mid-morning.",
  dna: {
    adventure: 6, views: 9, crowds: 7, forest: 6, waterfalls: 2, snow: 4,
    photography: 9, camping: 4, difficulty: 4, family: 6, hidden: 3, food: 5,
  },
  difficultyViz: { energy: 3, steepness: 3, exposure: 2, technical: 1 },
  difficultyProfile: [
    { kmFrom: 0, kmTo: 3.5, grade: "moderate", note: "stone steps through rhododendron" },
    { kmFrom: 3.5, kmTo: 4, grade: "gentle", note: "Tungnath temple plateau" },
    { kmFrom: 4, kmTo: 4.5, grade: "steep", note: "final summit pull, often windy" },
  ],
  timeline: [
    { km: 0, label: "Chopta trailhead, alpine scrub", type: "trailhead" },
    { km: 3.5, label: "Tungnath temple", type: "rest" },
    { km: 4.5, label: "Chandrashila summit, 360° panorama", type: "summit" },
  ],
  hiddenMoments: [
    { km: 3.5, text: "Locals brew chai by the temple before dawn — warm your hands and wait for the peaks to catch fire." },
  ],
  waterReliability: { status: "none-after-km", afterKm: 3.5, carryLitres: 1.5 },
  surface: [
    { kind: "steps", pct: 55 },
    { kind: "rock", pct: 30 },
    { kind: "meadow", pct: 15 },
  ],
  crowdPattern: { busiest: ["Sat 9-11 AM", "Sun sunrise"], quietWindow: "weekday dawn" },
  scenicDensity: { forest: 6, ridge: 9, waterfalls: 2, wildlife: 4, summitPayoff: 10, composite: 8 },
  completionConfidence: { beginnerPct: 88, intermediatePct: 98, experiencedPct: 100 },
  suitability: ["first-trek", "photography", "couples", "winter-snow"],
  emergency: { nearestTown: "Ukhimath", evacNote: "Road head at Chopta; nearest hospital in Ukhimath (~1.5h)." },
};

async function draftExperiential(c: Candidate, facts: WikiFacts): Promise<Record<string, unknown> | null> {
  const user = [
    "Draft the trek JSON for:",
    `name: ${c.name}`,
    `state: ${c.state}`,
    c.region && `region: ${c.region}`,
    c.nearestCity && `nearestCity: ${c.nearestCity}`,
    c.trailhead && `trailhead: ${c.trailhead}`,
    facts.extract && `\nReference (Wikipedia): ${facts.extract}`,
    "\nMatch this gold example's shape EXACTLY (same keys, same nesting):",
    JSON.stringify(GOLD_EXAMPLE, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
  const out = await llmJson(SYSTEM, user);
  return out && typeof out === "object" ? (out as Record<string, unknown>) : null;
}

// ── Assemble + gate ──────────────────────────────────────────────────────────
interface IngestResult {
  slug: string;
  name: string;
  ok: boolean;
  verified: { coords: boolean; elevation: boolean };
  notes: string[];
  trek?: Trek;
  draft?: unknown;
  error?: string;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

async function ingestOne(c: Candidate): Promise<IngestResult> {
  const slug = slugify(c.name);
  const notes: string[] = [];
  const facts = await wikiFacts(c.articleTitle ?? c.name);
  if (!facts.coords) notes.push("No Wikipedia coordinates — trailheadCoords needs manual verification.");

  let verifiedElevation: number | null = null;
  if (facts.coords) {
    verifiedElevation = await elevationAt(facts.coords);
    if (verifiedElevation == null) notes.push("Elevation API returned nothing.");
  }

  const draft = await draftExperiential(c, facts);
  if (!draft) {
    if (verifiedElevation != null) notes.push(`DEM elevation at article coords: ${verifiedElevation} m.`);
    return {
      slug, name: c.name, ok: false,
      verified: { coords: Boolean(facts.coords), elevation: verifiedElevation != null },
      notes: [...notes, "LLM draft unavailable (check LLM_* env); hard facts only."],
      error: "no-llm-draft",
    };
  }

  // Verified facts win. Article coords anchor maxAltitude; keep the LLM's
  // trailheadCoords only if Wikipedia had none (then it's flagged for review).
  const assembled: Record<string, unknown> = {
    ...draft,
    slug,
    name: c.name,
    state: c.state,
    region: c.region || draft.region || "",
    nearestCity: c.nearestCity || draft.nearestCity || "",
    destinationSlug: c.destinationSlug || draft.destinationSlug || "",
    trailhead: c.trailhead || draft.trailhead || "",
    embedding: null,
  };
  if (facts.coords) {
    assembled.trailheadCoords = facts.coords;
    notes.push(`trailheadCoords from Wikipedia article ${facts.coords.join(", ")} (often the SUMMIT/lake, not the trailhead — verify).`);
  }
  if (verifiedElevation != null) {
    const llmAlt = typeof draft.maxAltitudeM === "number" ? draft.maxAltitudeM : null;
    assembled.maxAltitudeM = verifiedElevation;
    if (llmAlt != null && Math.abs(llmAlt - verifiedElevation) > 300) {
      notes.push(`maxAltitude: LLM said ${llmAlt} m, DEM at article coords ${verifiedElevation} m — used DEM; reconcile if coords are the trailhead.`);
    }
  }

  try {
    const trek = TrekSchema.parse(assembled);
    return {
      slug, name: c.name, ok: true,
      verified: { coords: Boolean(facts.coords), elevation: verifiedElevation != null },
      notes, trek,
    };
  } catch (e) {
    return {
      slug, name: c.name, ok: false,
      verified: { coords: Boolean(facts.coords), elevation: verifiedElevation != null },
      notes, draft: assembled,
      error: e instanceof z.ZodError ? JSON.stringify(e.issues, null, 2) : String(e),
    };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Output ───────────────────────────────────────────────────────────────────
function emitDraftFile(treks: Trek[]): string {
  const body = treks
    .map((t) => "  " + JSON.stringify(t, dropDefaultsReplacer, 2).replace(/\n/g, "\n  "))
    .join(",\n");
  return `// Auto-drafted by scripts/ingest-treks.ts — REVIEW before pasting into src/data/treks.ts.
// Every value is a curated estimate to be checked. Coords from Wikipedia are
// often the summit/lake, not the trailhead — verify each one. Run your formatter
// after pasting. Drop the "embedding": null line; the seed parser handles it.
export const drafted = [
${body},
];
`;
}

// Trim the heaviest always-null defaults from the emitted draft so the review
// artifact stays readable (the schema re-fills them on load anyway).
function dropDefaultsReplacer(key: string, value: unknown): unknown {
  if (key === "embedding" && value === null) return undefined;
  return value;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
  const inputPath = args.find((a) => !a.startsWith("--") && a !== String(limit)) ?? join(import.meta.dirname, "candidates.json");

  if (!existsSync(inputPath)) {
    console.error(`No candidates file at ${inputPath}. Copy scripts/candidates.example.json to scripts/candidates.json and edit it.`);
    process.exit(1);
  }
  const candidates = z
    .array(CandidateSchema)
    .parse(JSON.parse(readFileSync(inputPath, "utf8")))
    .slice(0, limit);

  if (!process.env.LLM_API_URL) {
    console.warn("⚠  No LLM_API_URL — experiential drafting is OFF (hard facts only). Set LLM_* in .env.local for full drafts.\n");
  }
  console.log(`Ingesting ${candidates.length} candidate(s)…\n`);

  const results: IngestResult[] = [];
  for (const c of candidates) {
    process.stdout.write(`• ${c.name} … `);
    const r = await ingestOne(c);
    results.push(r);
    console.log(r.ok ? "✓ valid" : `✗ ${r.error?.split("\n")[0] ?? "failed"}`);
    for (const n of r.notes) console.log(`    – ${n}`);
    await sleep(1300); // stay under Groq free-tier RPM
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const good = results.filter((r) => r.ok && r.trek).map((r) => r.trek!);
  const bad = results.filter((r) => !r.ok);

  // Strip the heavy parsed objects from the JSON reports — keep just the status.
  const omit = (r: IngestResult, ...keys: Array<keyof IngestResult>) => {
    const copy: Partial<IngestResult> = { ...r };
    for (const k of keys) delete copy[k];
    return copy;
  };

  writeFileSync(join(OUT_DIR, "treks-draft.ts"), emitDraftFile(good));
  writeFileSync(
    join(OUT_DIR, "ingest-report.json"),
    JSON.stringify(results.map((r) => omit(r, "trek", "draft")), null, 2),
  );
  writeFileSync(
    join(OUT_DIR, "treks-rejected.json"),
    JSON.stringify(bad.map((r) => omit(r, "trek")), null, 2),
  );

  console.log(
    `\nDone. ${good.length} valid, ${bad.length} rejected.\n` +
      `  → scripts/out/treks-draft.ts      (review, then paste into src/data/treks.ts)\n` +
      `  → scripts/out/ingest-report.json  (verification status per trek)\n` +
      `  → scripts/out/treks-rejected.json (fix the schema errors and re-run)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
