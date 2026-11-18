import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../worker.ts", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const workerEntry = (await import("../worker.ts")).default;
const testEnv = { DB: { prepare() { throw new Error("Database should not be touched by these boundary tests"); } }, ASSETS: { fetch: async () => new Response("asset") } };

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

test("bet placement debits the shared internal USD balance and settlement credits it", () => {
  assert.doesNotMatch(worker, /Bet placement is temporarily unavailable/);
  assert.match(worker, /async function walletBalanceSnapshot/);
  assert.match(worker, /entry_type,source_id,event_key,available_delta_units/);
  assert.match(worker, /'bet_stake'/);
  assert.match(worker, /"bet_win":"bet_void_refund"/);
  assert.match(worker, /fundingSource:"virtual_usd_balance"/);
  assert.match(worker, /currency:"USD"/);
  assert.match(worker, /wallet_balance_entries WHERE account_id/);
  assert.match(worker, /Your USD balance has not been charged/);
});
test("deposits credit the USD balance 1:1 and withdrawals reserve the same balance for manual payout", () => {
  assert.match(worker, /'deposit_credit'/);
  assert.match(worker, /walletBalanceSnapshot\(env,account\.id\)/);
  assert.match(worker, /withdrawal_reserve/);
  assert.match(worker, /action==="paid"/);
  assert.match(worker, /manual payout has been recorded/i);
  assert.doesNotMatch(worker, /eth_sendRawTransaction|wallet_sendTransaction|privateKey.*signTransaction/i);
});
test("match feed exposes provider team and league badges and status-based completion", () => {
  assert.match(worker, /json_extract\(f\.raw_json,'\$\.teams\.home\.logo'\) AS home_logo/);
  assert.match(worker, /json_extract\(f\.raw_json,'\$\.teams\.away\.logo'\) AS away_logo/);
  assert.match(worker, /json_extract\(f\.raw_json,'\$\.league\.logo'\) AS league_logo/);
  assert.match(worker, /completed:\["FT","AET","PEN","AWD","WO","CANC"\]/);
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

test("runtime rejects state-changing requests with no Origin header", async () => {
  const request = new Request("https://coderush-devvic.tomx2000xx.workers.dev/api/auth/logout", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}"
  });
  const response = await workerEntry.fetch(request, testEnv);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});


test("native admin form requires a same-site CSRF token when Origin and Referer are absent", async () => {
  const base = "https://coderush-devvic.tomx2000xx.workers.dev";
  const token = "a".repeat(64);
  const allowed = await workerEntry.fetch(new Request(base + "/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: "cr_admin_csrf=" + token },
    body: "_csrf=" + token + "&email=invalid&password=x"
  }), testEnv);
  assert.equal(allowed.status, 401, "valid same-site token must pass origin checks and reach credential validation");
  const rejected = await workerEntry.fetch(new Request(base + "/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "_csrf=" + token + "&email=invalid&password=x"
  }), testEnv);
  assert.equal(rejected.status, 403, "a form token without its same-site cookie must be rejected");
});
test("runtime rejects cross-origin state changes and non-JSON bodies", async () => {
  const base = "https://coderush-devvic.tomx2000xx.workers.dev";
  const crossOrigin = await workerEntry.fetch(new Request(base + "/api/auth/logout", {
    method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}"
  }), testEnv);
  assert.equal(crossOrigin.status, 403);
  const wrongType = await workerEntry.fetch(new Request(base + "/api/auth/logout", {
    method: "POST", headers: { origin: base, "content-type": "text/plain" }, body: "x"
  }), testEnv);
  assert.equal(wrongType.status, 415);
});

test("runtime rejects oversized declared bodies before route processing", async () => {
  const base = "https://coderush-devvic.tomx2000xx.workers.dev";
  const response = await workerEntry.fetch(new Request(base + "/api/auth/logout", {
    method: "POST", headers: { origin: base, "content-type": "application/json", "content-length": "65537" }, body: "{}"
  }), testEnv);
  assert.equal(response.status, 413);
});

test("runtime allows same-origin logout and attaches security headers", async () => {
  const base = "https://coderush-devvic.tomx2000xx.workers.dev";
  const response = await workerEntry.fetch(new Request(base + "/api/auth/logout", {
    method: "POST", headers: { origin: base, "content-type": "application/json" }, body: "{}"
  }), testEnv);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
});
