# CodeRush — Telegram Mini App Demo

A mobile-first sports arena prototype built for Telegram Web Apps. This repository is the demo UI, not a live wagering or payment product.

## Run

- Install dependencies with `npm install` (or `bun install`).
- Start with `npm run dev`.
- Production build: `npm run build`.

## Demo boundaries

- Wallet balance, odds, referrals, rewards and selections are sample UI state only.
- No deposits, withdrawals, real wagers, settlement or payment processing are connected.
- Telegram WebApp SDK is initialized in the browser. Production identity must be verified server-side from raw Telegram `initData`; never trust `initDataUnsafe` as authentication.
- D1 persistence and validated Telegram authentication will be added in later implementation stages after the connected Cloudflare deployment target is confirmed.

## Languages

English-first UI with Arabic/RTL presentation toggle. Translation strings should be centralized as the app expands.
