import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const worker = readFileSync(new URL("../worker.ts", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const workerEntry = (await import("../worker.ts")).default;
const testEnv = { DB: { prepare() { throw new Error("Database should not be touched by these boundary tests"); } }, ASSETS: { fetch: async () => new Response("asset") } };

test("unsafe browser requests require an exact same-origin Origin header", () => {
  assert.match(worker, /function sameOrigin\(request:Request\):boolean\{const origin=request\.headers\.get\("origin"\);if\(!origin\)return false;/);
  assert.match(worker, /unsafeMethod&&!originExempt&&!sameOrigin\(request\)/);
  assert.match(worker, /originExempt=loginRoute\|\|url\.pathname==="\/api\/telegram\/webhook"\|\|url\.pathname==="\/api\/telegram\/broadcast"/);
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

test("admin login is not blocked by origin checks or login-attempt throttling", () => {
  const login = worker.slice(worker.indexOf("async function adminLogin"), worker.indexOf("async function adminUsers"));
  assert.doesNotMatch(login, /requestIsSameOrigin|Too many sign-in attempts|emailAttempts|ipAttempts/);
  assert.match(worker, /originExempt=loginRoute/);
  assert.match(login, /newAdminSession\(request,env,account!\.user_id\)/);
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
  assert.match(worker, /completed:\["FT","AWD","WO"\]/);
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


test("admin login form can submit without Origin, Referer, or a CSRF cookie", async () => {
  const base = "https://coderush-devvic.tomx2000xx.workers.dev";
  const response = await workerEntry.fetch(new Request(base + "/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=invalid&password=x"
  }), {
    ...testEnv,
    DB: { prepare() { return { bind() { return { first: async () => null, run: async () => ({ success: true }) }; } }; } }
  });
  assert.equal(response.status, 401, "login submission must reach credential validation instead of being blocked by origin or CSRF checks");
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

test("Telegram Mini App initData uses the official two-stage HMAC key/message order", () => {
  assert.match(worker, /hmacSha256\(new TextEncoder\(\)\.encode\("WebAppData"\), botToken\)/);
  assert.match(worker, /params\.delete\("hash"\)/);
  assert.match(worker, /\.sort\(\(\[a\], \[b\]\) => a < b \? -1 : a > b \? 1 : 0\)/);
  assert.match(worker, /\.join\("\\n"\)/);
});

test("Telegram Mini App authentication accepts a correctly signed initData payload", async () => {
  const token = "123456:CODE_RUSH_TEST_TOKEN";
  const telegramUser = { id: 123456789, first_name: "Test User", username: "coderush_test" };
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAEAAAE",
    user: JSON.stringify(telegramUser)
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => key + "=" + value)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);

  const userRow = {
    id: String(telegramUser.id), telegram_username: telegramUser.username,
    first_name: telegramUser.first_name, last_name: null, display_name: "Test User",
    language: "EN", role: "user", status: "active",
    created_at: new Date().toISOString(), last_login_at: null
  };
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            run: async () => ({ success: true }),
            first: async () => {
              if (sql.includes("SELECT id FROM users WHERE id=?")) return { id: String(telegramUser.id) };
              if (sql.includes("SELECT id,telegram_username,first_name")) return userRow;
              return null;
            }
          };
        }
      };
    }
  };
  const base = "https://coderush-devvic.tomx2000xx.workers.dev";
  const response = await workerEntry.fetch(new Request(base + "/api/auth/telegram", {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ initData: params.toString() })
  }), { ...testEnv, DB: db, TELEGRAM_BOT_TOKEN: token });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.match(response.headers.get("set-cookie") || "", /^cr_session=/);
});
