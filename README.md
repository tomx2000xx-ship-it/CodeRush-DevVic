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
- The referral invite URL is a demonstration placeholder; this repo does not provision a live referral bot or track real invitees.
- Telegram `initDataUnsafe` is used only for optional display personalisation. It is **not authentication**. A production backend must validate the raw `Telegram.WebApp.initData` signature and freshness server-side.
- No functional or end-to-end user testing is represented as completed by the build pipeline.

## Telegram welcome message

The Worker handles Telegram `/start` webhook updates and sends an Arabic CodeRush welcome message directly into the Telegram chat. Its primary inline button opens the CodeRush Mini App. Optional channel and group buttons appear when `TELEGRAM_CHANNEL_URL` and `TELEGRAM_GROUP_URL` are configured as Worker variables.

Required Worker secrets:
- `TELEGRAM_BOT_TOKEN` — already configured in the existing Worker.
- `TELEGRAM_WEBHOOK_SECRET` — secret header value used to authenticate Telegram webhook requests.

Webhook endpoint: `https://coderush-devvic.tomx2000xx.workers.dev/api/telegram/webhook`. The Telegram webhook must be registered with this URL and the same webhook secret. Never commit bot credentials or webhook secrets to Git.

## Languages and direction

English (LTR) and Arabic (RTL) are supported. Translation strings are centralized in `src/i18n.tsx`. New languages require a complete, reviewed translation catalogue and appropriate locale/direction configuration; the current app does not automatically translate arbitrary text.

## Cloudflare runtime

The existing `coderush-devvic` Worker has a Worker entry point (`worker.ts`) and serves the existing Vite build from the `dist` static-assets binding. API requests under `/api/*` execute Worker code, while normal frontend requests continue to serve the same SPA.

- `GET /api/health` reports runtime readiness and whether required Telegram secrets are configured; it never returns their values.
- Add credentials through the existing Worker’s **Settings → Variables and Secrets → Secrets**. Never commit credentials to Git.
- The connected Cloudflare GitHub integration builds `main` using `npm run build` and deploys the existing `coderush-devvic` Worker. No new Cloudflare project is required.
