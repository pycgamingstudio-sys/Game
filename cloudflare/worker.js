const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": env.APP_ORIGIN || "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "authorization,content-type" } });
    if (url.pathname === "/health") return json({ service: "jarvis-x-gateway", status: "ready", environment: env.APP_ENV || "development" });
    if (url.pathname === "/capabilities") return json({ providers: { gemini: Boolean(env.GEMINI_API_KEY), github: Boolean(env.GITHUB_TOKEN), cloudflare: Boolean(env.CLOUDFLARE_API_TOKEN), supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY), search: Boolean(env.SEARCH_API_KEY) } });
    return json({ error: "Route not implemented yet", service: "jarvis-x-gateway" }, 404);
  }
};
