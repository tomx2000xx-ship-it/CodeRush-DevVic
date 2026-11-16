interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHANNEL_URL?: string;
  TELEGRAM_GROUP_URL?: string;
}

const APP_URL = "https://coderush-devvic.tomx2000xx.workers.dev";
const WEBHOOK_URL = APP_URL + "/api/telegram/webhook";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

async function webhookSecret(token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("CodeRush Telegram webhook authentication v1"),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function ensureWebhook(token: string): Promise<{ configured: boolean; detail?: string }> {
  const secret = await webhookSecret(token);
  const infoResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  if (!infoResponse.ok) return { configured: false, detail: "Telegram getWebhookInfo request failed" };
  const info = await infoResponse.json() as {
    ok?: boolean;
    result?: { url?: string };
  };
  if (!info.ok) return { configured: false, detail: "Telegram rejected getWebhookInfo" };
  if (info.result?.url === WEBHOOK_URL) return { configured: true };

  const setResponse = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    }),
  });
  const result = await setResponse.json() as { ok?: boolean; description?: string };
  if (!setResponse.ok || !result.ok) {
    return { configured: false, detail: result.description || "Telegram rejected setWebhook" };
  }
  return { configured: true };
}

const welcomeText = [
  "✅ مرحباً بك في CodeRush — ساحة الرياضة الرقمية!",
  "",
  "⚽ اكتشف تجربة رياضية تفاعلية تجمع بين شغف كرة القدم ومتابعة المباريات واستكشاف تفاصيلها.",
  "",
  "📊 تابع المواجهات، استكشف الاحتمالات، وجرّب أدوات CodeRush في بيئة تجريبية مصممة لتمنحك تجربة ممتعة وسهلة.",
  "",
  "تنبيه: CodeRush حالياً نسخة تجريبية فقط. جميع الأرصدة والاحتمالات والأنشطة افتراضية، ولا توجد أموال حقيقية أو رهانات أو مدفوعات.",
  "",
  "👋 أهلاً بك، ونتمنى لك تجربة ممتعة!"
].join("\n");

async function sendWelcome(chatId: number, env: Env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured");
  const keyboard: Array<Array<Record<string, unknown>>> = [
    [{ text: "⚽ افتح CodeRush وابدأ الاستكشاف", web_app: { url: APP_URL } }],
  ];
  if (env.TELEGRAM_CHANNEL_URL) {
    keyboard.push([{ text: "💎 اشترك في قناتنا", url: env.TELEGRAM_CHANNEL_URL }]);
  }
  if (env.TELEGRAM_GROUP_URL) {
    keyboard.push([{ text: "👥 انضم إلى مجموعتنا", url: env.TELEGRAM_GROUP_URL }]);
  }
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: welcomeText,
      reply_markup: { inline_keyboard: keyboard },
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed with status ${response.status}`);
  const result = await response.json() as { ok?: boolean; description?: string };
  if (!result.ok) throw new Error(result.description || "Telegram sendMessage was rejected");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      if (!env.TELEGRAM_BOT_TOKEN) {
        return json({ ok: true, service: "coderush", runtime: "cloudflare-worker", telegramTokenConfigured: false });
      }
      const webhook = await ensureWebhook(env.TELEGRAM_BOT_TOKEN);
      return json({
        ok: true,
        service: "coderush",
        runtime: "cloudflare-worker",
        telegramTokenConfigured: true,
        telegramWebhookConfigured: webhook.configured,
        ...(webhook.detail ? { telegramWebhookDetail: webhook.detail } : {}),
      }, webhook.configured ? 200 : 502);
    }

    if (url.pathname === "/api/telegram/webhook" && request.method === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "Telegram bot token is not configured" }, 503);
      const expected = await webhookSecret(env.TELEGRAM_BOT_TOKEN);
      const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
      if (supplied.length !== expected.length) return json({ ok: false, error: "Unauthorized" }, 401);
      let difference = 0;
      for (let i = 0; i < supplied.length; i++) difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
      if (difference !== 0) return json({ ok: false, error: "Unauthorized" }, 401);

      try {
        const update = await request.json() as { message?: { chat?: { id?: number }; text?: string } };
        const message = update.message;
        const chatId = message?.chat?.id;
        if (chatId && /^\/start(?:\s|$)/.test(message?.text || "")) {
          await sendWelcome(chatId, env);
        }
        return json({ ok: true });
      } catch (error) {
        console.error("Telegram webhook processing failed", error);
        return json({ ok: false, error: "Unable to process Telegram update" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "API route not implemented yet" }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
