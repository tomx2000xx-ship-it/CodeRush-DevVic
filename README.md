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

## Languages and direction

English (LTR) and Arabic (RTL) are supported. Translation strings are centralized in `src/i18n.tsx`. New languages require a complete, reviewed translation catalogue and appropriate locale/direction configuration; the current app does not automatically translate arbitrary text.

## Deployment

The connected Cloudflare GitHub integration builds the `main` branch using `npm run build` and deploys the existing `coderush-devvic` Worker. Do not add credentials or bot tokens to source files.
