import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../worker.ts", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("unsafe browser requests require an exact same-origin Origin header", () => {
  assert.match(worker, /function sameOrigin\(request:Request\):boolean\{const origin=request\.headers\.get\("origin"\);if\(!origin\)return false;/);
  assert.match(worker, /unsafeMethod&&!originExempt&&!sameOrigin\(request\)/);
  assert.match(worker, /originExempt=url\.pathname==="\/api\/telegram\/webhook"\|\|url\.pathname==="\/api\/telegram\/broadcast"/);
});

test("API request bodies have declared size limits and JSON content types", () => {
  assert.match(worker, /Content-Type must be application\/json/);
  assert.match(worker, /bodyLimit=url\.pathname==="\/api\/telegram\/webhook"\?1048576:65536/);
  assert.match(worker, /declaredLength>bodyLimit/);
});

test("all Worker responses receive baseline security headers", () => {
  for (const header of ["x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "content-security-policy", "strict-transport-security"]) {
    assert.ok(worker.includes('headers.set("' + header + '"'), "Missing header: " + header);
  }
  assert.match(worker, /return withSecurityHeaders\(response\)/);
});

test("admin login is throttled by normalized email and hashed client address", () => {
  assert.match(worker, /CodeRush admin login rate key:/);
  assert.match(worker, /client_key_hash=\?/);
  assert.match(worker, /emailAttempts\?\.n\|\|0\)>=5\|\|Number\(ipAttempts\?\.n\|\|0\)>=15/);
  assert.match(worker, /INSERT INTO admin_login_attempts\(id,email,success,client_key_hash\)/);
});

test("Telegram webhook validates its secret token and has a bounded payload", () => {
  assert.match(worker, /X-Telegram-Bot-Api-Secret-Token/);
  assert.match(worker, /constantTimeEqual\(supplied, expected\)/);
  assert.match(worker, /1048576/);
});

test("bet placement remains safely blocked until real-money ledger and settlement are ready", () => {
  assert.match(worker, /Bet placement is temporarily unavailable\. Live USDT wallet staking and payout settlement must be completed/);
});

test("withdrawals remain manually reviewed and manually paid", () => {
  assert.match(worker, /action==="paid"/);
  assert.match(worker, /manual payout has been recorded/i);
  assert.doesNotMatch(worker, /eth_sendRawTransaction|wallet_sendTransaction|privateKey.*signTransaction/i);
});

test("production observability is enabled and no credentials are committed in Wrangler config", () => {
  assert.match(wrangler, /"observability":\s*\{\s*"enabled":\s*true/);
  assert.match(wrangler, /"traces":\s*\{\s*"enabled":\s*true/);
  assert.doesNotMatch(wrangler, /(TELEGRAM_BOT_TOKEN|TRONGRID_API_KEY|API_FOOTBALL_KEY)\s*[:=]\s*["'][^"']+["']/);
});
