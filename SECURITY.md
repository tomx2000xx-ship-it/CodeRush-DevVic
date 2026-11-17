# CodeRush — Security and launch readiness

Last reviewed: 2026-11-18

## Implemented technical controls

- Telegram Mini App authentication validates Telegram-signed init data and rejects stale/invalid payloads.
- Session tokens are cryptographically random, stored as SHA-256 hashes, issued in Secure/HttpOnly cookies, expire, and can be revoked.
- Administrator passwords use PBKDF2-SHA-256 with per-account random salts; comparisons are constant-time.
- Admin login is throttled by email and a hashed Cloudflare client-IP fingerprint; raw client IPs are not stored in the login-attempt table.
- Browser state-changing API requests require an exact same-origin Origin header. Telegram's signed webhook and the legacy secret-authenticated server broadcast endpoint are the only origin exceptions.
- State-changing API requests require JSON and declared request bodies are capped (64 KiB normally; 1 MiB for Telegram webhook updates).
- Worker responses receive anti-sniffing, anti-framing, referrer, permissions, basic CSP and HSTS headers.
- Unhandled request failures return a generic 500 response while server logs retain the exception.
- Telegram webhook requests validate the derived Telegram secret token using a constant-time comparison and deduplicate update IDs.
- SQL statements use D1 prepared statements and bound parameters.
- Wallet changes use ledger entries with idempotency constraints and audit records. Withdrawals are manually reviewed and manually paid; no private-key signing or automated payout is implemented.
- Worker Logs and Traces are enabled in Wrangler configuration.
- Expired/revoked sessions and old admin login-attempt rows are pruned by the daily scheduled maintenance path.
- Source-level security regression checks run as part of the production build.

## Current launch blockers — do not enable real-money operation yet

1. **Bet placement is disabled.** The API deliberately returns HTTP 503 until real USDT stake reservation/debit, settlement crediting, rollback/idempotency and reconciled ledger behavior are implemented and tested. The current ticket schema still constrains ticket type to `demo` and currency to `USD`; this must be migrated deliberately as part of the betting/wallet integration phase, not bypassed.
2. **Blockchain deposit activation is not ready.** Wallet switches and network deposits are disabled. The official receiving address must be supplied and verified by the platform owner. TRON also requires the `TRONGRID_API_KEY` Cloudflare secret. Shared-address transaction attribution must be made safe (for example, unique user deposit addresses or a reviewed attribution flow) before automatic crediting is enabled.
3. **Sports data availability is not confirmed.** API-Football has previously returned subscription rate-limit errors. Live fixtures, odds and settlement must be monitored with a working provider plan/key before launch.
4. **External legal and compliance approval is required.** The owner must confirm licensing and permitted jurisdictions, age restrictions, geofencing, KYC/AML obligations, responsible-gambling controls, terms, privacy notices, and dispute/refund procedures with qualified local counsel/compliance providers. These requirements cannot be inferred or safely fabricated in code.
5. **Operational controls require owner sign-off.** Confirm Cloudflare account recovery/MFA, least-privilege access, secret rotation and backup/restore procedures for D1. Verify the official wallet addresses independently before entering them.
6. **End-to-end production acceptance still requires controlled human testing.** Test Telegram login, session expiry/logout, user suspension, admin roles, notification delivery, broadcast opt-out behavior, sports provider recovery, deposit verification and manual withdrawal approval/rejection/payout recording with designated test accounts and no unapproved real funds.

## Release gate

Do not describe CodeRush as ready to accept real-money bets or deposits until every blocker above is closed, production smoke tests pass, and the owner signs off. A successful TypeScript/Vite build proves compilation and bundling only; it does not prove the live provider, Telegram delivery, blockchain verification, legal readiness or money movement.
