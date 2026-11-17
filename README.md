# CodeRush

CodeRush is a mobile-first sports platform built for the Telegram Web Apps environment. The current production implementation is being delivered in phases on Cloudflare Workers, D1 and Workers Assets.

## Run locally

- Install dependencies with `npm install` or `bun install`.
- Start the development server with `npm run dev`.
- Create a production build with `npm run build`.

## Platform architecture

- Frontend: React, TypeScript and Vite.
- Runtime: Cloudflare Worker.
- Database: Cloudflare D1.
- Telegram: Bot webhook and Telegram Mini App authentication.
- Sports data: API-Football (API-Sports) adapter; provider credentials remain server-side.

## Phase 1 — Identity and sessions

Migration: `migrations/0001_identity_and_sessions.sql`

- Telegram Mini App `initData` signature and freshness validation on the server.
- Secure HttpOnly session cookie, server-side session hash, expiry and revocation.
- User profile and language preference records.
- User roles and protected administrator session endpoint.
- Authentication events and administrator audit-log schema.

Set `CODERUSH_ADMIN_TELEGRAM_IDS` as a comma-separated Cloudflare Worker variable containing the Telegram numeric IDs permitted to receive the admin role. Never commit credentials or secrets to Git.

## Phase 2 — Football data integration

Migration: `migrations/0002_sports_data.sql`

- API-Football adapter for global football fixtures.
- Fixture status, kickoff, teams, league, live score and elapsed minute storage.
- Match-winner (1X2) bookmaker odds snapshots.
- Separate live fixture and in-play odds synchronization.
- Read-only match feed endpoint: `GET /api/sports/fixtures`.
- Admin-protected synchronization endpoint: `POST /api/sports/sync` (optional `from=YYYY-MM-DD&to=YYYY-MM-DD`, maximum 15 days).
- The Match Centre now reads fixtures and prices from the backend and does not invent sample matches or odds.

### Required sports provider configuration

Add the provider key as a **Cloudflare Worker secret**, never as a committed variable:

- `API_FOOTBALL_KEY` — API-Football / API-Sports API key.
- Optional `API_FOOTBALL_BOOKMAKER_ID` — bookmaker ID to use for the displayed 1X2 prices. If omitted, the first bookmaker returned for each fixture is used.

The provider account must have access to the required competitions, pre-match odds and in-play odds endpoints. Coverage and request quotas vary by competition and subscription. The feed remains empty until the owner supplies a valid provider subscription/key and an authorized administrator runs the first sync.

The provider adapter keeps its API key on the Worker and never exposes it to the browser. Odds shown in this phase are reference feed snapshots; bet acceptance must revalidate the current market and price in the Phase 3 betting engine.

## Telegram bot

The Worker handles Telegram `/start` webhook updates, stores consenting bot subscribers in D1, captures optional `ref_<code>` start payloads, and sends the welcome message with a Mini App button. `/stop` opts a subscriber out of future broadcasts.

- App: `https://coderush-devvic.tomx2000xx.workers.dev`
- Webhook: `https://coderush-devvic.tomx2000xx.workers.dev/api/telegram/webhook`
- Bot deep link: `GET /api/telegram/link`
- Referral deep link: `GET /api/telegram/link?ref=YOUR_CODE`
- Subscriber counts: `GET /api/telegram/stats` (protected by the existing broadcast admin secret).
- Broadcast: `POST /api/telegram/broadcast` with JSON `{"text":"Your message","offset":0,"limit":100}` and `Authorization: Bearer <TELEGRAM_BROADCAST_SECRET>`.

Required Worker secrets include `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BROADCAST_SECRET`. Never commit bot credentials, provider keys or admin secrets to Git.

## Production status

A successful build/deployment confirms the Worker bundle was published; it does not by itself confirm provider credentials, bookmaker coverage, Telegram login, or end-to-end wagering readiness. Those require configured third-party accounts and live integration testing.


## Phase 4 — Results processing and demo-ticket settlement

- The Worker refreshes due fixture IDs in batches of up to 20 using API-Football's `fixtures?ids=` parameter. A shared two-hour schedule performs this result check without multiplying provider calls for every selection.
- Final 1X2 results are settled against the regulation-time full-time score. For matches decided after extra time or penalties, the provider's `score.fulltime` regulation-time score is used; the shootout/extra-time winner is not substituted for a 90-minute 1X2 result.
- Full-time, after-extra-time and penalty statuses are eligible for result processing when a usable regulation-time score is present; awarded/walkover results are only processed when the provider supplies a score. Cancelled fixtures are voided immediately. Abandoned fixtures receive a 24-hour resumption window; postponed, suspended or interrupted fixtures receive a 48-hour resumption window before being voided. If the provider reschedules a fixture, its updated kickoff keeps the ticket pending.
- Accumulators are marked lost as soon as any leg loses. Otherwise they settle when every leg is resolved: winning legs multiply together, void legs are removed from the settled odds, and an all-void ticket is returned at its original demo stake.
- Per-selection result snapshots and immutable settlement events are stored in D1. `GET /api/admin/bet-settlements` exposes protected settlement diagnostics to authenticated administrators.
- My Bets displays each leg's score/result and server-calculated lifetime demo performance. This phase remains demo-only: no wallet debit, cash payout, or real-money wager is performed.
- Provider result refresh runs every two hours, while live-score refresh remains every 30 minutes. The additional schedule keeps the planned API-Football request volume within the existing 75-request daily safety ceiling under normal scheduled operation.

## Phase 5 — USDT wallet foundation and controlled crypto operations

Migration: `migrations/0008_wallet_ledger.sql`

- Introduces a separate server-authoritative USDT wallet account for each authenticated user. The Phase 3 demo ticket reference balance remains separate and cannot be withdrawn.
- Stores balances as integer micro-USDT units (six decimal places), deriving available and reserved balances from an append-only D1 ledger. Ledger rows are protected against update and deletion.
- Supports USDT on TRON/TRC20, Ethereum/ERC20 and BNB Smart Chain/BEP20. Each network has independent deposit-address and deposit/withdrawal enablement.
- User endpoints: `GET /api/wallet`, `POST /api/wallet/deposits`, and `POST /api/wallet/withdrawals`.
- Admin endpoints: `GET/POST /api/admin/wallet-settings`, `GET /api/admin/wallet-transactions`, and `POST /api/admin/wallet-transactions/:id`.
- The administrator dashboard provides network address configuration, global wallet enablement, deposit review, withdrawal approval/rejection and payout-hash recording.
- Deposits are pending until an administrator verifies the submitted transaction hash on the selected blockchain and approves the credit. The client cannot credit itself.
- Withdrawal requests reserve the available balance immediately. Administrators approve or reject them; a withdrawal is completed only after an administrator records the externally broadcast payout transaction hash.
- All operations are idempotent and recorded in a transaction audit trail. A network transaction hash cannot be submitted twice for deposits, and ledger entries cannot be edited or deleted.

### Phase 5 activation and operational boundary

The global wallet switch and all network switches are **OFF by default**. No deposit address is preconfigured, no payment processor or blockchain RPC service is connected, and no funds are collected or transferred automatically. The project owner/operator must configure official wallet deposit addresses, verify each chain manually, and complete the applicable legal, compliance, custody and operational reviews before enabling live operations. Never enable a network until its address and withdrawal process have been independently checked. This implementation is a controlled manual crypto workflow, not an integrated hosted payment gateway or automated blockchain monitor.
