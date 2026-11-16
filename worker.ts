interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BROADCAST_SECRET?: string;
  TELEGRAM_CHANNEL_URL?: string;
  TELEGRAM_GROUP_URL?: string;
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
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM telegram_subscribers WHERE status='active' AND opted_out=0").first<{ total: number }>();
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
      const stats = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' AND opted_out=0 THEN 1 ELSE 0 END) AS reachable, SUM(CASE WHEN opted_out=1 THEN 1 ELSE 0 END) AS optedOut, SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked FROM telegram_subscribers").first();
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
