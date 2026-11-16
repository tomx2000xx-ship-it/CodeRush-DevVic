# CodeRush — Telegram Mini App Demo

A mobile-first sports-arena prototype designed for the Telegram Web Apps environment. This repository contains a **demonstration interface**, not a live wagering, wallet or payment product.

## Run locally

- Install dependencies with `npm install` or `bun install`.
- Start the development server with `npm run dev`.
- Create a production build with `npm run build`.

## Demo capabilities

- Demo profile onboarding, dashboard and sample match centre.
- Sample match outcomes, a local demo selection slip and recorded demo slips.
- Referral programme presentation and local sample notifications.
- Simulated wallet balance, deposits and withdrawals stored in the current browser.
- English and Arabic language selection with LTR/RTL document direction.

## Strict demo boundaries

- All fixtures, odds, balances, rewards, referral counts and activity are illustrative sample data.
- No real wager is submitted, settled or paid.
- No wallet is connected; no deposit address, blockchain transaction, payment or withdrawal request is created.
- Local demo state is stored in browser localStorage. It is device/browser-specific and is not shared between users or devices.
- Telegram referral links now use Telegram's bot deep-link format. Only people who open the link and press Start can be registered and receive bot messages.
- Telegram bot subscribers are stored in Cloudflare D1. This subscriber registry is separate from demo referral counts in browser localStorage.
- Telegram `initDataUnsafe` is used only for optional display personalisation. It is **not authentication**. A production backend must validate the raw `Telegram.WebApp.initData` signature and freshness server-side.
- No functional or end-to-end user testing is represented as completed by the build pipeline.

## Telegram bot, referrals and broadcasts

The Worker handles Telegram `/start` webhook updates, stores each consenting chat in D1, captures optional `ref_<code>` start payloads, and sends the Arabic welcome message with a Mini App button. `/stop` opts a subscriber out of future broadcasts.

- App: `https://coderush-devvic.tomx2000xx.workers.dev`
- Webhook: `https://coderush-devvic.tomx2000xx.workers.dev/api/telegram/webhook`
- Bot deep link: `GET /api/telegram/link`
- Referral deep link: `GET /api/telegram/link?ref=YOUR_CODE`
- Subscriber counts: `GET /api/telegram/stats` (requires admin bearer secret)
- Broadcast: `POST /api/telegram/broadcast` with JSON `{"text":"Your message","offset":0,"limit":100}` and `Authorization: Bearer <TELEGRAM_BROADCAST_SECRET>`. The endpoint sends up to 100 messages per batch and returns `nextOffset` for the next batch. Continue until it returns `nextOffset: null`.

Required Worker secrets:
- `TELEGRAM_BOT_TOKEN` — already configured.
- `TELEGRAM_BROADCAST_SECRET` — must be added as a Worker secret before protected subscriber statistics and broadcast endpoints can be used.

The Telegram bot cannot message people merely because they clicked a web link, joined a Telegram group, or saw a referral URL. Each person must open the bot and press Start at least once. The bot then stores that chat for future messages. Users can opt out with `/stop`.

Never commit bot credentials or admin secrets to Git.
