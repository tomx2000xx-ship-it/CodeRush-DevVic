interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_CHANNEL_URL?: string;
  TELEGRAM_GROUP_URL?: string;
}

const APP_URL = "https://coderush-devvic.tomx2000xx.workers.dev";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

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

async function sendWelcome(chatId: number | string, env: Env) {
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "coderush",
        runtime: "cloudflare-worker",
        telegramTokenConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
        telegramWebhookSecretConfigured: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
      });
    }

    if (url.pathname === "/api/telegram/webhook" && request.method === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ ok: false, error: "Telegram webhook is not configured" }, 503);
      }

      const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
      if (suppliedSecret.length !== env.TELEGRAM_WEBHOOK_SECRET.length) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      let difference = 0;
      for (let i = 0; i < suppliedSecret.length; i++) {
        difference |= suppliedSecret.charCodeAt(i) ^ env.TELEGRAM_WEBHOOK_SECRET.charCodeAt(i);
      }
      if (difference !== 0) return json({ ok: false, error: "Unauthorized" }, 401);

      try {
        const update = await request.json() as {
          message?: { chat?: { id?: number }; text?: string };
        };
        const message = update.message;
        const chatId = message?.chat?.id;
        if (chatId && /^\/start(?:\s|$)/.test(message?.text || "")) {
          await sendWelcome(chatId, env);
        }
        return json({ ok: true });
      } catch {
        return json({ ok: false, error: "Unable to process Telegram update" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "API route not implemented yet" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
