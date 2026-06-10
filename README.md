# Safar

Safar is a conversation-native group travel coordinator built for the official
WhatsApp Groups API. It listens to a Safar-created group, extracts trip facts
and first-person preferences, posts a correctable summary, researches three
Indian destination plans, estimates live or fallback costs, and runs a
chat-native vote.

## What is implemented

- Official webhook verification and group/message/participant normalization
- Idempotent durable event queue with retry backoff
- English, Hindi, and Hinglish rule-backed extraction with optional LLM enrichment
- Text, media captions, and optional voice-note transcription
- Reusable preference memory with in-chat inspection and deletion
- Versioned summaries with strict-majority approval
- Curated Indian destination catalog plus optional live search and transient Reddit links
- Amadeus, Booking-compatible, and Viator-compatible pricing adapters with transparent estimates
- Three distinct plans, mutable numbered votes, deadlines, reminders, and runoffs
- Public no-login group creation page and password-protected operations dashboard
- Supabase RLS schema and 30-day completed-trip message purge function
- In-memory fixture mode for local development without external credentials

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Without Supabase or Meta credentials, the app uses an in-memory store and
returns fixture group invites. Send development messages with:

```bash
curl -X POST http://localhost:3000/api/dev/simulate \
  -H 'content-type: application/json' \
  -d '{"participantWaId":"919900000001","profileName":"Asha","text":"I am from DEL and I like cafes. Budget INR 12000 max."}'
```

The operations dashboard is at `/dashboard`. When `ADMIN_PASSWORD` is set,
use HTTP Basic Auth with username `safar`.

## Production setup

1. Create a Supabase project and apply `supabase/migrations/20260607000000_initial_safar.sql`.
2. Configure the service-role credentials. The browser receives no database key.
3. Obtain an Official Business Account with WhatsApp Groups API access.
4. Register `/api/webhooks/whatsapp` for `messages` and `group_participants_update`.
5. Set the Meta app secret and webhook verification token.
6. Configure an OpenAI-compatible structured-chat endpoint and transcription endpoint.
7. Add approved search and pricing provider credentials.
8. Deploy to Vercel and set `CRON_SECRET`; the included cron drains retries and coordinates vote deadlines.

## Useful commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Important boundaries

- Safar creates official invite-only groups; it does not automate WhatsApp Web
  or enter arbitrary consumer groups.
- Native WhatsApp polls are not automated. Members vote with `vote 1`,
  `vote 2`, or `vote 3`.
- Reddit content is surfaced through search-linked results only. It is not
  bulk scraped, retained as a corpus, or used for model training.
- Supplier checkout remains on supplier deep links. Safar does not collect
  trip payments in this release.
