interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BROADCAST_SECRET?: string;
  TELEGRAM_CHANNEL_URL?: string;
  TELEGRAM_GROUP_URL?: string;
  CODERUSH_ADMIN_TELEGRAM_IDS?: string;
  API_FOOTBALL_KEY?: string;
  API_FOOTBALL_BOOKMAKER_ID?: string;
}

const APP_URL = "https://coderush-devvic.tomx2000xx.workers.dev";
const WEBHOOK_URL = APP_URL + "/api/telegram/webhook";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function webhookSecret(token: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("CodeRush Telegram webhook authentication v1"));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function telegram<T>(env: Env, method: string, payload?: Record<string, unknown>): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const result = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result as T;
}

async function ensureWebhook(token: string): Promise<{ configured: boolean; detail?: string }> {
  const secret = await webhookSecret(token);
  const infoResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info = await infoResponse.json() as { ok?: boolean; result?: { url?: string } };
  if (!infoResponse.ok || !info.ok) return { configured: false, detail: "Telegram getWebhookInfo request failed" };
  if (info.result?.url === WEBHOOK_URL) return { configured: true };
  const setResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: WEBHOOK_URL, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false }),
  });
  const result = await setResponse.json() as { ok?: boolean; description?: string };
  return setResponse.ok && result.ok ? { configured: true } : { configured: false, detail: result.description || "Telegram rejected setWebhook" };
}

const welcomeText = [
  "✅ مرحباً بك في CodeRush — ساحة الرياضة الرقمية!", "",
  "⚽ اكتشف تجربة رياضية تفاعلية تجمع بين شغف كرة القدم ومتابعة المباريات واستكشاف تفاصيلها.", "",
  "📊 تابع المواجهات، استكشف الاحتمالات، وجرّب أدوات CodeRush في بيئة تجريبية مصممة لتمنحك تجربة ممتعة وسهلة.", "",
  "تنبيه: CodeRush حالياً نسخة تجريبية فقط. جميع الأرصدة والاحتمالات والأنشطة افتراضية، ولا توجد أموال حقيقية أو رهانات أو مدفوعات.", "",
  "👋 أهلاً بك، ونتمنى لك تجربة ممتعة!"
].join("\n");

async function sendWelcome(chatId: number, env: Env) {
  const keyboard: Array<Array<Record<string, unknown>>> = [[{ text: "⚽ افتح CodeRush وابدأ الاستكشاف", web_app: { url: APP_URL } }]];
  if (env.TELEGRAM_CHANNEL_URL) keyboard.push([{ text: "💎 اشترك في قناتنا", url: env.TELEGRAM_CHANNEL_URL }]);
  if (env.TELEGRAM_GROUP_URL) keyboard.push([{ text: "👥 انضم إلى مجموعتنا", url: env.TELEGRAM_GROUP_URL }]);
  await telegram(env, "sendMessage", { chat_id: chatId, text: welcomeText, reply_markup: { inline_keyboard: keyboard }, disable_web_page_preview: true });
}

type TelegramMessage = {
  text?: string;
  write_access_allowed?: { from_request?: boolean };
  chat?: { id?: number };
  from?: { id?: number; username?: string; first_name?: string; last_name?: string };
};

async function saveSubscriber(message: TelegramMessage, payload: string, env: Env) {
  const chatId = message.chat?.id;
  const user = message.from;
  if (!chatId || !user?.id) return;
  const referrer = payload.startsWith("ref_") ? payload.slice(4).slice(0, 64) : null;
  const ownCode = `u${user.id}`;
  await env.DB.prepare(`
    INSERT INTO telegram_subscribers (chat_id, telegram_user_id, username, first_name, last_name, referral_code, referred_by, start_payload, status, opted_out, last_seen_at, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
    ON CONFLICT(chat_id) DO UPDATE SET
      telegram_user_id=excluded.telegram_user_id, username=excluded.username, first_name=excluded.first_name,
      last_name=excluded.last_name, referred_by=COALESCE(telegram_subscribers.referred_by, excluded.referred_by),
      start_payload=excluded.start_payload, status='active', opted_out=0,
      last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_error=NULL
  `).bind(String(chatId), String(user.id), user.username || null, user.first_name || null, user.last_name || null, ownCode, referrer && referrer !== ownCode ? referrer : null, payload || null).run();
}

async function processUpdate(update: { message?: TelegramMessage }, env: Env) {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text || "";
  if (!message || !chatId) return;
  if (/^\/start(?:@\w+)?(?:\s+(.+))?$/.test(text)) {
    const payload = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/)?.[1] || "";
    await saveSubscriber(message, payload, env);
    await sendWelcome(chatId, env);
  } else if (/^\/(stop|unsubscribe)(?:@\w+)?$/.test(text)) {
    await env.DB.prepare("UPDATE telegram_subscribers SET opted_out=1, last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chat_id=?").bind(String(chatId)).run();
    await telegram(env, "sendMessage", { chat_id: chatId, text: "تم إيقاف رسائل CodeRush. أرسل /start للاشتراك مجدداً." });
  }
}

async function requireAdmin(request: Request, env: Env): Promise<boolean> {
  if (!env.TELEGRAM_BROADCAST_SECRET) return false;
  const supplied = request.headers.get("authorization") || "";
  return constantTimeEqual(supplied, `Bearer ${env.TELEGRAM_BROADCAST_SECRET}`);
}

async function handleBroadcast(request: Request, env: Env): Promise<Response> {
  if (!(await requireAdmin(request, env))) return json({ ok: false, error: "Unauthorized" }, 401);
  const body = await request.json() as { text?: string; offset?: number; limit?: number };
  const text = (body.text || "").trim();
  if (!text || text.length > 4096) return json({ ok: false, error: "Message text must contain 1–4096 characters" }, 400);
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(body.limit) || 100)));
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM telegram_subscribers WHERE status='active' AND opted_out=0 AND write_access_allowed=1").first<{ total: number }>();
  const total = Number(totalRow?.total || 0);
  const recipients = await env.DB.prepare("SELECT chat_id FROM telegram_subscribers WHERE status='active' AND opted_out=0 ORDER BY first_seen_at, chat_id LIMIT ? OFFSET ?").bind(limit, offset).all<{ chat_id: string }>();
  let sent = 0, failed = 0, blocked = 0;
  for (const recipient of recipients.results || []) {
    try {
      await telegram(env, "sendMessage", { chat_id: recipient.chat_id, text, disable_web_page_preview: true });
      sent++;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/blocked|deactivated|chat not found/i.test(detail)) {
        blocked++;
        await env.DB.prepare("UPDATE telegram_subscribers SET status='blocked', last_error=? WHERE chat_id=?").bind(detail.slice(0, 500), recipient.chat_id).run();
      } else {
        failed++;
        await env.DB.prepare("UPDATE telegram_subscribers SET last_error=? WHERE chat_id=?").bind(detail.slice(0, 500), recipient.chat_id).run();
      }
    }
    await sleep(40);
  }
  const broadcastId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO telegram_broadcasts (id, message, sent_count, failed_count, blocked_count) VALUES (?, ?, ?, ?, ?)")
    .bind(broadcastId, text, sent, failed, blocked).run();
  const processed = offset + (recipients.results?.length || 0);
  return json({ ok: true, broadcastId, totalEligible: total, offset, processed: recipients.results?.length || 0, sent, failed, blocked, nextOffset: processed < total ? processed : null });
}


type AuthUser = { id: string; telegram_username: string | null; first_name: string | null; last_name: string | null; display_name: string | null; language: string; role: string; status: string; created_at: string; last_login_at: string | null };
const SESSION_COOKIE = "cr_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function hmacSha256(keyBytes: Uint8Array, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function validateTelegramInitData(initData: string, botToken: string): Promise<{ user: { id: number; username?: string; first_name?: string; last_name?: string }; authDate: number } | null> {
  if (!initData || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const suppliedHash = params.get("hash") || "";
  const authDate = Number(params.get("auth_date"));
  const rawUser = params.get("user");
  if (!/^[a-f0-9]{64}$/i.test(suppliedHash) || !Number.isInteger(authDate) || !rawUser) return null;
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > 3600) return null;
  params.delete("hash");
  params.delete("signature");
  const dataCheckString = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + "=" + value).join("\n");
  const secretKey = await hmacSha256(new TextEncoder().encode(botToken), "WebAppData");
  const expected = await hmacSha256(new Uint8Array(secretKey.match(/.{2}/g)!.map(pair => parseInt(pair, 16))), dataCheckString);
  if (!constantTimeEqual(expected.toLowerCase(), suppliedHash.toLowerCase())) return null;
  try {
    const user = JSON.parse(rawUser) as { id?: number; username?: string; first_name?: string; last_name?: string };
    if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0) return null;
    return { user: { id: Number(user.id), username: user.username, first_name: user.first_name, last_name: user.last_name }, authDate };
  } catch { return null; }
}
function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}
function sessionCookie(token: string): string {
  return SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + SESSION_SECONDS;
}
function clearSessionCookie(): string {
  return SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
async function currentSession(request: Request, env: Env): Promise<{ tokenHash: string; user: AuthUser } | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.telegram_username, u.first_name, u.last_name, u.display_name, u.language, u.role, u.status, u.created_at, u.last_login_at
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first<AuthUser>();
  if (!row || row.status !== "active") return null;
  return { tokenHash, user: row };
}
async function recordAuthEvent(env: Env, userId: string | null, event: string, request: Request): Promise<void> {
  await env.DB.prepare("INSERT INTO auth_events (id,user_id,event_type,user_agent) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(), userId, event, (request.headers.get("user-agent") || "").slice(0, 300) || null).run();
}
async function handleTelegramAuth(request: Request, env: Env): Promise<Response> {
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Telegram authentication is not configured" }, 503);
  let body: { initData?: string };
  try { body = await request.json() as { initData?: string }; } catch { return json({ ok: false, error: "Invalid request body" }, 400); }
  const verified = await validateTelegramInitData(body.initData || "", env.TELEGRAM_BOT_TOKEN);
  if (!verified) {
    await recordAuthEvent(env, null, "telegram_auth_rejected", request);
    return json({ ok: false, error: "Telegram authentication data is invalid or expired. Reopen CodeRush from Telegram and try again." }, 401);
  }
  const tg = verified.user;
  const userId = String(tg.id);
  const adminIds = (env.CODERUSH_ADMIN_TELEGRAM_IDS || "").split(",").map(value => value.trim()).filter(Boolean);
  const assignedRole = adminIds.includes(userId) ? "admin" : "user";
  await env.DB.prepare(`
    INSERT INTO users (id,telegram_username,first_name,last_name,role,last_login_at)
    VALUES (?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(id) DO UPDATE SET
      telegram_username=excluded.telegram_username,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      role=CASE WHEN excluded.role='admin' THEN 'admin' ELSE users.role END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      last_login_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(userId, tg.username || null, tg.first_name || null, tg.last_name || null, assignedRole).run();
  const user = await env.DB.prepare("SELECT id,telegram_username,first_name,last_name,display_name,language,role,status,created_at,last_login_at FROM users WHERE id=?").bind(userId).first<AuthUser>();
  if (!user || user.status !== "active") {
    await recordAuthEvent(env, userId, "login_blocked", request);
    return json({ ok: false, error: "This account is not active. Contact support." }, 403);
  }
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = hex(tokenBytes.buffer);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare("INSERT INTO user_sessions (token_hash,user_id,expires_at,user_agent) VALUES (?,?,?,?)")
    .bind(tokenHash, userId, expiresAt, (request.headers.get("user-agent") || "").slice(0, 300) || null).run();
  await recordAuthEvent(env, userId, "login_success", request);
  return new Response(JSON.stringify({ ok: true, user }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "set-cookie": sessionCookie(token) }
  });
}
async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, authenticated: false }, 401);
  await env.DB.prepare("UPDATE user_sessions SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?").bind(session.tokenHash).run();
  return json({ ok: true, authenticated: true, user: session.user });
}
async function handleAdminSession(request: Request, env: Env): Promise<Response> {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: "Authentication required" }, 401);
  if (session.user.role !== "admin") return json({ ok: false, error: "Administrator access required" }, 403);
  return json({ ok: true, admin: { id: session.user.id, displayName: session.user.display_name, role: session.user.role } });
}
async function handleLogout(request: Request, env: Env): Promise<Response> {
  const session = await currentSession(request, env);
  if (session) {
    await env.DB.prepare("UPDATE user_sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?").bind(session.tokenHash).run();
    await recordAuthEvent(env, session.user.id, "logout", request);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": clearSessionCookie() } });
}
async function handleProfileUpdate(request: Request, env: Env): Promise<Response> {
  const session = await currentSession(request, env);
  if (!session) return json({ ok: false, error: "Authentication required" }, 401);
  let body: { displayName?: string; language?: string };
  try { body = await request.json() as { displayName?: string; language?: string }; } catch { return json({ ok: false, error: "Invalid request body" }, 400); }
  const displayName = (body.displayName || "").trim();
  const language = body.language === "EN" ? "EN" : body.language === "AR" ? "AR" : null;
  if (displayName.length < 2 || displayName.length > 60 || !language) return json({ ok: false, error: "Display name must be 2–60 characters and language must be AR or EN." }, 400);
  await env.DB.prepare("UPDATE users SET display_name=?,language=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
    .bind(displayName, language, session.user.id).run();
  const user = await env.DB.prepare("SELECT id,telegram_username,first_name,last_name,display_name,language,role,status,created_at,last_login_at FROM users WHERE id=?").bind(session.user.id).first<AuthUser>();
  return json({ ok: true, user });
}


type ApiFootballFixture = {
  fixture: { id: number; date: string; status: { short: string; long: string; elapsed: number | null } };
  league: { id: number; name: string; country: string; season: number };
  teams: { home: { name: string; code?: string | null }; away: { name: string; code?: string | null } };
  goals: { home: number | null; away: number | null };
};
type ApiFootballOdds = {
  fixture: { id: number };
  bookmakers: Array<{ id: number; name: string; bets: Array<{ id: number; name: string; values: Array<{ value: string; odd: string; handicap?: string | null; suspended?: boolean }> }> }>;
};
async function apiFootball<T>(env: Env, path: string): Promise<{ response: T[]; paging?: { current: number; total: number } }> {
  if (!env.API_FOOTBALL_KEY) throw new Error("API_FOOTBALL_KEY is not configured");
  const response = await fetch("https://v3.football.api-sports.io/" + path, {
    headers: { "x-apisports-key": env.API_FOOTBALL_KEY, "accept": "application/json" },
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  if (!response.ok) throw new Error("API-Football returned HTTP " + response.status);
  const payload = await response.json() as { response?: T[]; errors?: unknown; paging?: { current: number; total: number } };
  if (payload.errors && (Array.isArray(payload.errors) ? payload.errors.length : Object.keys(payload.errors as object).length)) {
    throw new Error("API-Football rejected the request: " + JSON.stringify(payload.errors).slice(0, 300));
  }
  return { response: payload.response || [], paging: payload.paging };
}
const isoNow = () => new Date().toISOString();
const dayString = (date: Date) => date.toISOString().slice(0, 10);
function fixtureIsLive(status: string): boolean {
  return ["1H","HT","2H","ET","BT","P","LIVE"].includes(status);
}
async function storeFootballFixtures(env: Env, fixtures: ApiFootballFixture[]): Promise<number> {
  if (!fixtures.length) return 0;
  const now = isoNow();
  const statements = fixtures.map(item => env.DB.prepare(`
    INSERT INTO sports_fixtures
      (id,league_id,league_name,country,season,kickoff,status_short,status_long,elapsed,home_team,away_team,home_code,away_code,home_score,away_score,is_live,updated_at,raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      league_id=excluded.league_id,league_name=excluded.league_name,country=excluded.country,season=excluded.season,
      kickoff=excluded.kickoff,status_short=excluded.status_short,status_long=excluded.status_long,elapsed=excluded.elapsed,
      home_team=excluded.home_team,away_team=excluded.away_team,home_code=excluded.home_code,away_code=excluded.away_code,
      home_score=excluded.home_score,away_score=excluded.away_score,is_live=excluded.is_live,
      updated_at=excluded.updated_at,raw_json=excluded.raw_json
  `).bind(
    String(item.fixture.id),item.league.id,item.league.name,item.league.country||null,item.league.season||null,
    item.fixture.date,item.fixture.status.short,item.fixture.status.long,item.fixture.status.elapsed,
    item.teams.home.name,item.teams.away.name,item.teams.home.code||null,item.teams.away.code||null,
    item.goals.home,item.goals.away,fixtureIsLive(item.fixture.status.short)?1:0,now,JSON.stringify(item)
  ));
  await env.DB.batch(statements);
  return fixtures.length;
}
async function storeFootballOdds(env: Env, entries: ApiFootballOdds[]): Promise<number> {
  let count=0;
  const configuredBookmaker=Number(env.API_FOOTBALL_BOOKMAKER_ID||0);
  const statements: D1PreparedStatement[]=[];
  for (const entry of entries) {
    const bookmaker = configuredBookmaker
      ? entry.bookmakers.find(item=>item.id===configuredBookmaker)
      : entry.bookmakers[0];
    if (!bookmaker) continue;
    for (const market of bookmaker.bets) {
      if (market.id !== 1) continue;
      for (const value of market.values) {
        const label=value.value.toLowerCase();
        const key=label.includes("home")? "home" : label.includes("draw")? "draw" : label.includes("away")? "away" : "";
        const odd=Number(value.odd);
        if (!key || !Number.isFinite(odd) || odd<=1) continue;
        statements.push(env.DB.prepare(`
          INSERT INTO sports_odds (fixture_id,bookmaker_id,bookmaker_name,market_id,market_name,outcome_key,outcome_name,odd,handicap,suspended,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(fixture_id,bookmaker_id,market_id,outcome_key,handicap) DO UPDATE SET
            bookmaker_name=excluded.bookmaker_name,market_name=excluded.market_name,outcome_name=excluded.outcome_name,
            odd=excluded.odd,suspended=excluded.suspended,updated_at=excluded.updated_at
        `).bind(String(entry.fixture.id),bookmaker.id,bookmaker.name,market.id,market.name,key,value.value,odd,value.handicap||"",value.suspended?1:0,isoNow()));
        count++;
      }
    }
  }
  for(let i=0;i<statements.length;i+=80) await env.DB.batch(statements.slice(i,i+80));
  return count;
}
async function syncFootballRange(env: Env, from: string, to: string): Promise<{fixtures:number;odds:number}> {
  const fixtureData=await apiFootball<ApiFootballFixture>(env,"fixtures?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to)+"&timezone=UTC");
  const fixtures=await storeFootballFixtures(env,fixtureData.response);
  let odds=0;
  // API-Football pre-match odds are date-scoped and paginated. Pull the first 10 pages per day.
  for (let cursor=new Date(from+"T00:00:00Z"); cursor<=new Date(to+"T00:00:00Z"); cursor.setUTCDate(cursor.getUTCDate()+1)) {
    const date=dayString(cursor);
    for(let page=1;page<=10;page++) {
      const data=await apiFootball<ApiFootballOdds>(env,"odds?date="+date+"&bet=1&page="+page);
      if(!data.response.length) break;
      odds+=await storeFootballOdds(env,data.response);
      if(!data.paging || page>=data.paging.total) break;
    }
  }
  await env.DB.prepare(`
    INSERT INTO sports_sync_state(provider,last_fixtures_sync,last_odds_sync,last_error,updated_at)
    VALUES ('api-football',?,?,NULL,?)
    ON CONFLICT(provider) DO UPDATE SET last_fixtures_sync=excluded.last_fixtures_sync,last_odds_sync=excluded.last_odds_sync,last_error=NULL,updated_at=excluded.updated_at
  `).bind(isoNow(),isoNow(),isoNow()).run();
  return {fixtures,odds};
}
async function syncFootballLive(env: Env): Promise<{fixtures:number;odds:number}> {
  const live=await apiFootball<ApiFootballFixture>(env,"fixtures?live=all");
  const fixtures=await storeFootballFixtures(env,live.response);
  const oddsData=await apiFootball<ApiFootballOdds>(env,"odds/live?bet=1");
  const odds=await storeFootballOdds(env,oddsData.response);
  await env.DB.prepare(`
    INSERT INTO sports_sync_state(provider,last_live_sync,last_odds_sync,last_error,updated_at)
    VALUES ('api-football',?,?,NULL,?)
    ON CONFLICT(provider) DO UPDATE SET last_live_sync=excluded.last_live_sync,last_odds_sync=excluded.last_odds_sync,last_error=NULL,updated_at=excluded.updated_at
  `).bind(isoNow(),isoNow(),isoNow()).run();
  return {fixtures,odds};
}
async function handleSportsFixtures(request: Request, env: Env): Promise<Response> {
  if (!env.API_FOOTBALL_KEY) return json({ok:true,configured:false,provider:"API-Football",fixtures:[],message:"Sports data provider is not configured yet."});
  const url=new URL(request.url);
  const from=url.searchParams.get("from")||dayString(new Date());
  const to=url.searchParams.get("to")||dayString(new Date(Date.now()+7*86400000));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from) return json({ok:false,error:"Invalid date range"},400);
  const rows=await env.DB.prepare(`
    SELECT f.id,f.league_name,f.country,f.kickoff,f.status_short,f.elapsed,f.home_team,f.away_team,f.home_code,f.away_code,
      f.home_score,f.away_score,o.bookmaker_name,o.outcome_key,o.odd,o.suspended,o.updated_at AS odds_updated_at
    FROM sports_fixtures f LEFT JOIN sports_odds o ON o.fixture_id=f.id AND o.market_id=1
    WHERE substr(f.kickoff,1,10)>=? AND substr(f.kickoff,1,10)<=?
    ORDER BY f.kickoff ASC
  `).bind(from,to).all<Record<string,unknown>>();
  const map=new Map<string,Record<string,unknown>>();
  for(const row of rows.results||[]){
    let item=map.get(String(row.id));
    if(!item){item={id:String(row.id),league:String(row.league_name),country:row.country||"",kickoff:row.kickoff,home:String(row.home_team),away:String(row.away_team),homeCode:row.home_code||"",awayCode:row.away_code||"",status:String(row.status_short),minute:row.elapsed,live:fixtureIsLive(String(row.status_short)),completed:["FT","AET","PEN"].includes(String(row.status_short)),score:row.home_score===null||row.away_score===null?null:String(row.home_score)+" : "+String(row.away_score),odds:[null,null,null],bookmaker:null,oddsUpdatedAt:null};map.set(String(row.id),item);}
    if(row.outcome_key==="home") (item.odds as (number|null)[])[0]=row.suspended?null:Number(row.odd);
    if(row.outcome_key==="draw") (item.odds as (number|null)[])[1]=row.suspended?null:Number(row.odd);
    if(row.outcome_key==="away") (item.odds as (number|null)[])[2]=row.suspended?null:Number(row.odd);
    if(row.bookmaker_name){item.bookmaker=row.bookmaker_name;item.oddsUpdatedAt=row.odds_updated_at;}
  }
  const state=await env.DB.prepare("SELECT last_fixtures_sync,last_live_sync,last_odds_sync,last_error FROM sports_sync_state WHERE provider='api-football'").first<Record<string,unknown>>();
  return new Response(JSON.stringify({ok:true,configured:true,provider:"API-Football",fixtures:Array.from(map.values()),sync:state}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=10, stale-while-revalidate=20","x-content-type-options":"nosniff"}});
}
async function handleSportsSync(request: Request, env: Env): Promise<Response> {
  const session=await currentSession(request,env);
  if(!session) return json({ok:false,error:"Authentication required"},401);
  if(session.user.role!=="admin") return json({ok:false,error:"Administrator access required"},403);
  if(!env.API_FOOTBALL_KEY) return json({ok:false,error:"API_FOOTBALL_KEY is not configured in Cloudflare."},503);
  const url=new URL(request.url);
  const from=url.searchParams.get("from")||dayString(new Date());
  const to=url.searchParams.get("to")||dayString(new Date(Date.now()+7*86400000));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from||(new Date(to).getTime()-new Date(from).getTime())>14*86400000) return json({ok:false,error:"Choose a valid date range of no more than 15 days."},400);
  try{
    const result=await syncFootballRange(env,from,to);
    return json({ok:true,provider:"API-Football",range:{from,to},...result});
  }catch(error){
    const message=error instanceof Error?error.message:"Sports provider sync failed";
    await env.DB.prepare(`
      INSERT INTO sports_sync_state(provider,last_error,updated_at) VALUES ('api-football',?,?)
      ON CONFLICT(provider) DO UPDATE SET last_error=excluded.last_error,updated_at=excluded.updated_at
    `).bind(message.slice(0,500),isoNow()).run();
    return json({ok:false,error:message},502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/auth/telegram" && request.method === "POST") return handleTelegramAuth(request, env);
    if (url.pathname === "/api/auth/session" && request.method === "GET") return handleAuthSession(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") return handleLogout(request, env);
    if (url.pathname === "/api/admin/session" && request.method === "GET") return handleAdminSession(request, env);
    if (url.pathname === "/api/profile" && request.method === "POST") return handleProfileUpdate(request, env);
    if (url.pathname === "/api/sports/fixtures" && request.method === "GET") return handleSportsFixtures(request, env);
    if (url.pathname === "/api/sports/sync" && request.method === "POST") return handleSportsSync(request, env);

    if (url.pathname === "/api/health" && request.method === "GET") {
      if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: true, service: "coderush", runtime: "cloudflare-worker", telegramTokenConfigured: false, databaseConfigured: !!env.DB });
      const webhook = await ensureWebhook(env.TELEGRAM_BOT_TOKEN);
      return json({ ok: true, service: "coderush", runtime: "cloudflare-worker", telegramTokenConfigured: true, telegramWebhookConfigured: webhook.configured, databaseConfigured: !!env.DB, broadcastSecretConfigured: !!env.TELEGRAM_BROADCAST_SECRET, ...(webhook.detail ? { telegramWebhookDetail: webhook.detail } : {}) }, webhook.configured ? 200 : 502);
    }

    if (url.pathname === "/api/telegram/link" && request.method === "GET") {
      try {
        const me = await telegram<{ username: string }>(env, "getMe");
        const ref = (url.searchParams.get("ref") || "").trim();
        if (ref && !/^[a-zA-Z0-9_-]{1,64}$/.test(ref)) return json({ ok: false, error: "Invalid referral code" }, 400);
        const start = ref ? `ref_${ref}` : "";
        const link = `https://t.me/${me.username}${start ? `?start=${encodeURIComponent(start)}` : ""}`;
        return json({ ok: true, botUsername: me.username, botLink: `https://t.me/${me.username}`, referralLink: link, instruction: "Users must open the link and press Start before the bot can message them." });
      } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Unable to create Telegram link" }, 502); }
    }

    if (url.pathname === "/api/telegram/stats" && request.method === "GET") {
      if (!(await requireAdmin(request, env))) return json({ ok: false, error: "Unauthorized" }, 401);
      const stats = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' AND opted_out=0 THEN 1 ELSE 0 END) AS reachable, SUM(CASE WHEN opted_out=1 THEN 1 ELSE 0 END) AS optedOut, SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked, SUM(CASE WHEN write_access_allowed=1 AND status='active' AND opted_out=0 THEN 1 ELSE 0 END) AS messageOptIns FROM telegram_subscribers").first();
      return json({ ok: true, subscribers: stats });
    }

    if (url.pathname === "/api/telegram/broadcast" && request.method === "POST") {
      try { return await handleBroadcast(request, env); }
      catch (error) { console.error("Telegram broadcast failed", error); return json({ ok: false, error: "Broadcast processing failed" }, 500); }
    }

    if (url.pathname === "/api/telegram/webhook" && request.method === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Telegram bot token is not configured" }, 503);
      const expected = await webhookSecret(env.TELEGRAM_BOT_TOKEN);
      const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
      if (!constantTimeEqual(supplied, expected)) return json({ ok: false, error: "Unauthorized" }, 401);
      try {
        await processUpdate(await request.json() as { message?: TelegramMessage }, env);
        return json({ ok: true });
      } catch (error) {
        console.error("Telegram webhook processing failed", error);
        return json({ ok: false, error: "Unable to process Telegram update" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "API route not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
