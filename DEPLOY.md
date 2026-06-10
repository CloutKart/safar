# Deploying Safar

Two pieces:

- **Safar app** — a Next.js app → **Vercel**.
- **Gem scraper** — a tiny Playwright service → **Railway** (Playwright can't run
  on Vercel serverless, so it lives outside the app).

Deploy in this order, because the app needs the others' URLs/keys:
**1) Supabase → 2) Railway scraper → 3) Vercel app.**

---

## 1. Supabase (required)

On Vercel's serverless runtime the in-memory store is ephemeral and not shared
across instances, so trips wouldn't persist. Supabase is the production store
(the app auto-selects it when `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
are set).

1. Create a free project at <https://supabase.com>.
2. Run the two migrations in `supabase/migrations/` **in filename order** — paste
   each file's SQL into the Supabase **SQL Editor** and run, or via the CLI:
   `supabase link --project-ref <ref>` then `supabase db push`.
3. **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only secret)

## 2. Railway — the gem scraper

1. <https://railway.app> → **New Project → Deploy from GitHub repo** → `CloutKart/safar`.
2. Service **Settings → Root Directory** → `scraper`. Railway detects
   `scraper/Dockerfile` (Playwright image with browsers preinstalled) and builds it.
3. **Variables** → add `SCRAPER_TOKEN` = a random secret you choose.
   (Railway injects `PORT` automatically; `server.js` already reads it.)
4. **Settings → Networking → Generate Domain** → gives a public URL.
5. Smoke test:
   ```bash
   curl -s -XPOST https://<your-scraper>.up.railway.app/reddit \
     -H 'Content-Type: application/json' \
     -H 'Authorization: Bearer <SCRAPER_TOKEN>' -d '{"city":"Goa"}'
   ```
   Expect `{"city":"Goa","count":<n>,"posts":[…]}` with n > 0.

## 3. Vercel — the app

1. <https://vercel.com> → **Add New → Project** → import `CloutKart/safar`.
   Framework = Next.js, root = repo root (defaults are correct).
2. **Environment Variables** (Production) — secret values come from your local `.env`:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
   | `LLM_API_URL` | `https://api.groq.com/openai/v1/chat/completions` |
   | `LLM_API_KEY` | your Groq key (`gsk_…`) |
   | `LLM_MODEL` | `llama-3.3-70b-versatile` |
   | `GOOGLE_PLACES_KEY` | your Places key |
   | `RAPIDAPI_KEY` | your RapidAPI key |
   | `REDDIT_SCRAPER_URL` | the Railway URL from step 2 |
   | `SCRAPER_TOKEN` | the same token as Railway |
   | `CRON_SECRET` | a random secret (protects + authorizes the cron) |
   | `NEXT_PUBLIC_APP_URL` | your Vercel URL (fill in after first deploy) |

   Optional tuning: `LLM_MAX_RPM`, `LLM_MAX_RPD`, `LLM_EXTRACT_MESSAGES`.
3. **Deploy.** After the first deploy, set `NEXT_PUBLIC_APP_URL` to the assigned
   URL and redeploy.

---

## Caveats (read these)

- **Cron** (`vercel.json`) is `*/15 * * * *`. Vercel **Hobby** (free) limits cron
  jobs to roughly **once per day** — the 15-minute cadence needs **Pro**. This is
  fine for a demo: the core flow (chat → summary → approve → plans → vote) runs
  synchronously per request; the cron only drains a webhook queue and runs the
  time-based coordinator. Set `CRON_SECRET` regardless — Vercel sends it as the
  cron request's `Authorization: Bearer` token.
- **Live updates (SSE)** use an in-process bus. It does **not** span multiple
  serverless instances, and serverless caps long-lived connections. Low-traffic
  demos usually work (one warm instance); for robust multi-user realtime, move to
  Supabase Realtime later.
- **Rotate** any API keys shared during development before going public.
