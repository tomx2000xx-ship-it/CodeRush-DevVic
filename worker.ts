interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TELEGRAM_BOT_TOKEN?: string;
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "coderush",
        runtime: "cloudflare-worker",
        telegramTokenConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "API route not implemented yet" }, 404);
    }

    // All non-API requests continue to use the same built Vite frontend.
    return env.ASSETS.fetch(request);
  },
};
