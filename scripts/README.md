# Trek ingestion

`ingest-treks.ts` drafts new Trek Knowledge Graph records to expand the corpus in
[`src/data/treks.ts`](../src/data/treks.ts). It is a **local authoring tool**, not a
runtime path — nothing in the app imports it.

## What it does, per candidate

1. **Hard facts, verified** — pulls article coordinates from Wikipedia and a terrain
   elevation cross-check from the keyless Open-Meteo elevation API. These override the
   LLM. (Wikipedia coords are usually the *summit/lake* the trek is named for, so they
   anchor `maxAltitudeM` — the script flags them for trailhead verification.)
2. **Experiential draft** — asks the chat LLM (the same Groq config the app uses) to
   draft Trek DNA, scenic density, blurb, hidden moments, difficulty profile, etc.,
   anchored to a real gold example. The LLM is told never to invent coordinates,
   elevation, or emergency contacts.
3. **Schema gate** — every assembled record is run through the real `TrekSchema`.
   Valid ones go to the draft file; invalid ones go to a rejects file with the exact
   Zod error so you can fix and re-run.

The output is a **review artifact**, not a finished commit. Always read the drafts —
especially DNA scores, the blurb voice, and `trailheadCoords` — before pasting.

## Usage

```bash
cp scripts/candidates.example.json scripts/candidates.json   # edit your list
npx tsx scripts/ingest-treks.ts                # or: npm run ingest
npx tsx scripts/ingest-treks.ts mylist.json --limit 20
```

The script reads the same LLM keys the dev server uses, from `.env.local` then `.env`
(real environment variables still win):

```
LLM_API_URL=https://api.groq.com/openai/v1/chat/completions
LLM_API_KEY=...
LLM_MODEL=llama-3.3-70b-versatile
```

Without them the script still emits verified hard facts and flags the experiential
fields for manual fill.

## Candidate fields

| field             | required | notes                                                        |
| ----------------- | -------- | ------------------------------------------------------------ |
| `name`            | ✓        | becomes the slug and the trek name                           |
| `state`           | ✓        |                                                              |
| `region`          |          | e.g. "Garhwal Himalaya", "Dhauladhar", "Western Ghats"       |
| `nearestCity`     |          | drives proximity search                                      |
| `destinationSlug` |          | link to `destinations.ts` for stays/nearby (`""` standalone) |
| `trailhead`       |          | the road head / start village                                |
| `articleTitle`    |          | override when the Wikipedia article ≠ the trek name          |

## Output (`scripts/out/`, git-ignored)

- `treks-draft.ts` — valid `raw` entries to review and paste.
- `ingest-report.json` — per-trek verification status (coords/elevation verified?).
- `treks-rejected.json` — failures with the schema error to fix.

## After pasting

Run `npm run lint -- --fix` / your formatter, then the usual gate:
`npm run typecheck && npm test && npm run build`. The seed parses through `TrekSchema`
at load, so a bad paste fails fast.
