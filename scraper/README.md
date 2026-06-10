# Safar gem scraper

A tiny standalone service that fetches Reddit's public JSON from inside a real
**Playwright** browser context, so requests look like normal browsing (real TLS
fingerprint, headers, cookies). Reddit dropped unauthenticated API access and
stopped issuing free keys, but `old.reddit.com` still serves JSON to a real
browser.

It lives outside the Safar app because Playwright/Chromium can't run on Vercel
serverless. Safar (Vercel-deployable) calls this only for the **Reddit** gem
source; Google Places + Atlas Obscura run inside the app.

## API

`POST /reddit` with `{"city":"Goa"}` → `{ city, count, posts: [{title, selftext, subreddit, score, url}] }`

The Safar app feeds those posts to its own LLM to extract places, so this
service stays dumb (no API keys, just scraping). `GET /health` → `{ok:true}`.

Set `SCRAPER_TOKEN` to require `Authorization: Bearer <token>` (recommended in
production). Set `PORT` (default `3001`).

## Run locally

```bash
cd scraper
npm install            # installs Playwright + downloads Chromium (postinstall)
SCRAPER_TOKEN=secret npm start
curl -s -XPOST localhost:3001/reddit -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer secret' -d '{"city":"Goa"}'
```

## Deploy (Docker — easiest)

```bash
docker build -t safar-scraper .
docker run -p 3001:3001 -e SCRAPER_TOKEN=secret safar-scraper
```

Works on Railway / Render / Fly.io / any VPS. Then point the Safar app at it:

```
REDDIT_SCRAPER_URL=https://your-scraper.example.com
SCRAPER_TOKEN=secret
```
