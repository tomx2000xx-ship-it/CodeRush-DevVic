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
