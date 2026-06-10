# Pivot Safar from WhatsApp to a free, self-hosted web platform

## Context

Extensive research established that WhatsApp's **Groups API is a hard wall** at
hobbyist scale — gated behind either 100k+/month business-initiated conversations or
an Official Business Account + paid Business Solution Provider relationship. No BSP
(Twilio included) can route around Meta's own gate, and the only workaround (unofficial
WhatsApp-Web automation, e.g. Baileys/whatsapp-web.js) carries high-to-critical
permanent-ban risk (typical lifespan 2–8 weeks) and directly conflicts with the
boundary Safar's own README states. We decided to drop WhatsApp and build this as a web
platform (PWA) instead — which removes every one of these walls at zero cost and zero
risk, while reusing nearly all of the existing engine.

**The critical finding that makes this a pivot rather than a rewrite**: Safar's
conversation engine is already transport-agnostic. `processNormalizedEvent` in
[engine.ts](../src/lib/conversation/engine.ts#L403-L412) consumes a generic
`NormalizedInboundMessage`/`NormalizedWhatsAppEvent`
([domain.ts:135-159](../src/lib/domain.ts#L135-L159)), and the single `send()`
chokepoint ([engine.ts:47-68](../src/lib/conversation/engine.ts#L47-L68)) calls
`whatsapp.sendText` + `store.logOutboundMessage` together. Crucially, both inbound and
outbound messages already land in **the same unified `messages` thread**
(`logOutboundMessage` in [memory.ts:214-237](../src/lib/store/memory.ts#L214-L237)
stores bot replies with `participantId: null` right alongside member messages, and
`getRecentMessages` returns them chronologically). So a chat UI rendering that thread is
just a read of existing data — nothing new to store.

## What gets reused as-is (the actual product)

- [domain.ts](../src/lib/domain.ts) — all Zod schemas
- [conversation/engine.ts](../src/lib/conversation/engine.ts), `commands.ts`,
  `extractor.ts`, `summary.ts`, `formatters.ts` — extraction, summary
  correction/approval, voting/runoff, memory commands — entirely transport-agnostic
- [research/planner.ts](../src/lib/research/planner.ts), `pricing.ts`, `search.ts`,
  [data/destinations.ts](../src/data/destinations.ts)
- [store/](../src/lib/store/) — `SafarStore` interface and both implementations
  (message thread storage already unified, no schema change needed)
- [coordinator.ts](../src/lib/conversation/coordinator.ts) — voting lifecycle
  (reminders, deadlines, runoffs)

## What gets replaced (the transport layer only)

- **`whatsapp.sendText`** → a web transport that persists via the existing
  `logOutboundMessage` and broadcasts over **Supabase Realtime** so every open browser
  tab sees new messages live. Update the two `send()` implementations
  ([engine.ts:47](../src/lib/conversation/engine.ts#L47),
  [coordinator.ts:5](../src/lib/conversation/coordinator.ts#L5)) to call this instead of
  `whatsapp`.
- **`whatsapp.createGroup`** → generating a shareable trip-room URL/slug. No "invite
  link" concept needed; replace
  [group-creator.tsx](../src/components/group-creator.tsx) and
  [api/groups/route.ts](../src/app/api/groups/route.ts) to mint a slug and
  `ensureGroup` directly.
- **Inbound transport**: a chat input box POSTing to a new API route that builds a
  `NormalizedInboundMessage` (`groupWaId`→room slug, `participantWaId`→browser-local
  participant id, `profileName`→chosen display name) and calls
  `processNormalizedEvent` — exactly what
  [api/dev/simulate/route.ts](../src/app/api/dev/simulate/route.ts) already does, just
  promoted from dev-only to the real entry point.

## What gets dropped entirely

- `app/api/webhooks/whatsapp/`, `lib/whatsapp/{client,parser,signature,transcription}.ts`,
  and their tests ([parser.test.ts](../src/lib/whatsapp/parser.test.ts)) — no Meta
  integration left to verify/parse
- `WHATSAPP_*` env vars and the `hasWhatsApp` flag in [env.ts](../src/lib/env.ts)

## What gets added

1. **Trip room page** `app/trip/[slug]/page.tsx` — renders the unified message thread
   (`store.getRecentMessages`) as a chat view, a text input, and rich cards for the
   `GeneratedPlan` content (the schema already has itinerary/sources/cost — far better
   than WhatsApp's plain-text `formatPlans`)
2. **Message API route** — accepts `{ participantId, displayName, text }`, wraps it as
   `NormalizedInboundMessage`, calls `processNormalizedEvent`
3. **Lightweight identity** — no auth system needed: on first visit to a trip link, the
   browser generates and stores (localStorage/cookie) a persistent participant id +
   asks for a display name once. Maps directly onto existing `participantWaId`/
   `displayName` fields — `upsertParticipant` needs no changes.
4. **Realtime wiring** — a Supabase Realtime channel per group, broadcasting on each
   `logOutboundMessage`/`insertInboundMessage` so all open tabs update live
5. **Voting UI** — buttons that post the existing `vote 1/2/3` text commands (100% reuse
   of `parseCommand`/`handleVote`), plus a tally view from `getVoteResult`
6. **Reminder delivery** — Web Push (VAPID keys, free, no third party) subscribed per
   participant, triggered from `coordinator.ts`'s existing `send()` path, so people get
   notified of vote deadlines/results even with the tab closed
7. **Pre-payment splitting via Razorpay Route** — once a plan wins and the group needs
   to front a real expense (flights/hotel deposit) before booking, so no single member
   has to cover the full cost upfront:
   - You already have a Razorpay merchant account + API keys (the hard onboarding step
     is done) — first confirm **Route is enabled** on that account (it's a per-merchant
     toggle Razorpay grants on request, not automatic)
   - **Collection**: when the trip's organizer records an expense to split, the app
     computes each member's share and generates a **Payment Link** per person — no
     coding/checkout flow needed on the payer's side, they just pay by card/UPI/etc.
     like any normal checkout, and Razorpay's webhook confirms each payment
     automatically (no manual "mark as paid" reconciliation)
   - **Routing to the right person**: because the platform owner won't be part of every
     trip, the actual recipient (that trip's organizer) gets added as a **Linked
     Account** — a ~2-minute one-time signup (name, email, bank details), instantly
     verified via Razorpay's penny-test, reusable for that person's future trips. A
     `transfer` rule configured at collection time then auto-routes the captured funds
     (e.g. 100%, or less a small platform fee) to that Linked Account, settling to
     their bank in ~2 working days — the platform never personally holds or forwards
     the money
   - This is strictly better than a UPI-deep-link ledger here: it trades a one-time
     integration cost + Razorpay's ~2% transaction fee for *zero ongoing manual
     reconciliation*, which matters for a tool whose entire premise is reducing
     group-coordination overhead

## Free-tier provider wiring

| Need | Choice | Why |
|---|---|---|
| Database + Realtime + Storage | Supabase free tier | Already the codebase's primary store; covers realtime + auth-free sessions |
| LLM enrichment | Google Gemini free tier (`gemini-2.0-flash`, OpenAI-compatible endpoint) | 1,500 req/day, no card |
| Activity pricing | **Viator** — sign up at partnerresources.viator.com, get immediate free Basic Access API key | No traffic minimums, no cost, slots into existing `tryConfiguredProvider` |
| Stay pricing | Leave `BOOKING_API_*` unset | Booking's partner portal is currently closed to new applicants; existing `fallbackQuotes` heuristic degrades gracefully and transparently (`live: false`) |
| Transport pricing | Amadeus free self-service test tier | Already wired in `pricing.ts`; sandbox data, fine for "just working" |
| Search (optional) | Tavily free tier (no card) or skip | Existing code returns `[]` gracefully if unset |
| Maps (if added for destination display) | Google Maps Platform | Free thresholds: 10,000 map loads + 10,000 geocoding requests per month, resets monthly. At personal scale (~330 loads/day to break even) you won't get near it. Requires a card on file to activate billing, but you won't be charged unless you cross the threshold — or skip the card step entirely with the Maps Embed API / mobile SDKs, which are unlimited and free with no billing account |
| Voice notes (optional) | Browser mic + Groq's free Whisper-compatible endpoint | Slots into existing `TRANSCRIPTION_API_URL` config shape |
| Hosting | Vercel Hobby (free) | Cron is daily-only on free tier — trigger `/api/cron/process` manually or via a free external scheduler (cron-job.org) for tighter voting-deadline timing |

## Verification

- `npm run typecheck && npm run lint && npm test` — remove/replace WhatsApp-specific
  tests (`whatsapp/parser.test.ts`) as part of the dropped-code cleanup
- Manual end-to-end: create a trip room → open the link in two+ browser tabs as
  different participants (different display names) → type messages containing
  facts/preferences in English/Hindi/Hinglish → confirm extraction runs, a summary
  posts and can be approved by majority, three plans generate with cost estimates
  (Viator-live activity quotes + fallback stay estimates), voting buttons work and
  results/runoffs surface live across tabs
- Confirm Supabase Realtime delivers new messages to all open tabs without refresh
- Confirm a reminder/result triggered via `/api/cron/process` reaches a participant as
  a Web Push notification with the tab closed
