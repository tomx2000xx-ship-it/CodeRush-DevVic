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


## Phase 4 — Results processing and ticket settlement foundation

- The Worker refreshes due fixture IDs in batches of up to 20 using API-Football's `fixtures?ids=` parameter. A shared two-hour schedule performs this result check without multiplying provider calls for every selection.
- Final 1X2 results are settled against the regulation-time full-time score. For matches decided after extra time or penalties, the provider's `score.fulltime` regulation-time score is used; the shootout/extra-time winner is not substituted for a 90-minute 1X2 result.
- Full-time, after-extra-time and penalty statuses are eligible for result processing when a usable regulation-time score is present; awarded/walkover results are only processed when the provider supplies a score. Cancelled fixtures are voided immediately. Abandoned fixtures receive a 24-hour resumption window; postponed, suspended or interrupted fixtures receive a 48-hour resumption window before being voided. If the provider reschedules a fixture, its updated kickoff keeps the ticket pending.
- Accumulators are marked lost as soon as any leg loses. Otherwise they settle when every leg is resolved: winning legs multiply together, void legs are removed from the settled odds, and an all-void ticket is returned at its original stake.
- Per-selection result snapshots and immutable settlement events are stored in D1. `GET /api/admin/bet-settlements` exposes protected settlement diagnostics to authenticated administrators.
- My Bets displays each leg's score/result and server-calculated lifetime ticket performance. Real-money ticket placement is currently disabled. The ticket history and settlement engine must be connected to the live USDT wallet ledger before wagers can be accepted.
- Provider result refresh runs every two hours, while live-score refresh remains every 30 minutes. The additional schedule keeps the planned API-Football request volume within the existing 75-request daily safety ceiling under normal scheduled operation.

## Phase 5 — USDT wallet foundation and controlled crypto operations

Migrations: `migrations/0008_wallet_ledger.sql`, `migrations/0009_wallet_audit_hardening.sql`, `migrations/0010_wallet_automatic_deposits.sql`, `migrations/0011_wallet_deposit_address_snapshot.sql`

- Introduces a separate server-authoritative USDT wallet account for each authenticated user. The betting engine does not expose a placeholder balance. Real-money ticket placement remains disabled until the wallet-backed staking and settlement integration is completed.
- Stores balances as integer micro-USDT units (six decimal places), deriving available and reserved balances from an append-only D1 ledger. Ledger and wallet audit rows are protected against update and deletion; payout transaction hashes are unique per network.
- Supports automatic USDT verification on TRON/TRC20 and Ethereum/ERC20. BNB Smart Chain/BEP20 remains locked until its exact USD₮ contract is confirmed. Each supported network has independent deposit-address and deposit/withdrawal enablement.
- User endpoints: `GET /api/wallet`, `POST /api/wallet/deposits`, and `POST /api/wallet/withdrawals`.
- Admin endpoints: `GET/POST /api/admin/wallet-settings`, `GET /api/admin/wallet-transactions`, and `POST /api/admin/wallet-transactions/:id`.
- The Super Admin dashboard provides network address configuration, global wallet enablement, deposit review, withdrawal approval/rejection and payout-hash recording.
- Users submit the transaction hash; the scheduled monitor verifies the network, token contract, receiving address, exact amount and finality, then credits the ledger automatically. The client cannot credit itself and administrators cannot manually approve an unverified deposit.
- Withdrawal requests reserve the available balance immediately. Administrators approve or reject them; a withdrawal is completed only after an administrator records the externally broadcast payout transaction hash.
- All operations are idempotent and recorded in a transaction audit trail. A network transaction hash cannot be submitted twice for deposits, and ledger entries cannot be edited or deleted.

### Phase 5 activation and operational boundary

The global wallet switch and all network switches are **OFF by default**. No deposit address is preconfigured and no funds are collected or transferred until the owner configures and enables the wallet. The project owner/operator must configure the official receiving addresses in the Super Admin panel and complete applicable legal, compliance, custody and operational reviews before enabling live operations. The user submits the transaction hash; the monitor checks it every five minutes and credits only after finality. A shared receiving address does not cryptographically prove which user owns a transfer, so unique per-user deposit addresses or an ownership-proof flow are recommended before enabling unrestricted automatic credit. Never enable a network until its address and withdrawal process have been independently checked. Withdrawals are manual: an administrator approves the request, sends the payout externally, and records the on-chain payout hash. Automatic payout signing/broadcasting is not implemented. TRON monitoring uses TronGrid and will not accept TRC20 deposits until `TRONGRID_API_KEY` is configured as a Cloudflare Worker secret; TronGrid's official guidance says production requests should always include an API key. Ethereum uses a public JSON-RPC endpoint by default and can be overridden with `ETHEREUM_RPC_URL`. BEP20 deposits and withdrawals are disabled until the exact USD₮ contract on BNB Smart Chain is confirmed; Tether lists BNB Smart Chain as a protocol but its current page does not provide a USD₮ contract address for it. This is not an integrated hosted payment gateway.

## OpenFootball fixture source (migration phase 1)

CodeRush now includes a separate OpenFootball ingestion adapter for a limited set of current-season competitions. It uses the public JSON datasets from [openfootball/football.json](https://github.com/openfootball/football.json), whose project states that its schema and data are dedicated to the public domain (CC0). The Worker refreshes this source daily at 06:15 UTC, after the upstream dataset's expected daily publication window, using the existing daily cron trigger; no sixth cron trigger is added. Administrators can also trigger a guarded manual refresh from the sports sync endpoint.

This source is a fixture and published-results fallback only. It does **not** provide dependable in-play scores, match clocks, event timelines, bookmaker odds, market suspensions, or result-verification guarantees. CodeRush must not manufacture odds from this source, treat a scheduled kickoff as proof that a match is live, or use these single-source results as the sole authority for real-money settlement. A fixture without separately verified 1X2 prices remains unavailable for betting.

Current adapter coverage is intentionally limited to the current-season datasets currently published for England Premier League and Championship, Germany Bundesliga, Spain La Liga, Italy Serie A, France Ligue 1, Netherlands Eredivisie, and Portugal Primeira Liga. The season path is derived automatically from the calendar date; a competition is only imported when its current-season dataset exists. Other competitions and international tournaments require additional current-season datasets and validation before being enabled. Dataset availability and accuracy depend on upstream community updates; this feed is not a substitute for a licensed live-data provider.
