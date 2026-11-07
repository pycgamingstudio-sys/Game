import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigin = Deno.env.get("APP_ORIGIN") || "http://localhost:5173";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jarvis-local-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json"
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (origin && origin !== allowedOrigin) return reply({ error: "This private JARVIS X endpoint only accepts the configured local origin." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const expectedKey = Deno.env.get("JARVIS_LOCAL_ACCESS_KEY");
  const suppliedKey = req.headers.get("x-jarvis-local-key");
  if (!expectedKey || !suppliedKey || suppliedKey !== expectedKey) return reply({ error: "Private local access key is missing or invalid." }, 401);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return reply({ error: "Gemini API key is not configured on the server yet." }, 503);
  try {
    const body = await req.json();
    const model = ["gemini-2.5-flash", "gemini-2.5-pro"].includes(body.model) ? body.model : "gemini-2.5-flash";
    const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
    if (!messages.length || messages.some((m: any) => !["user", "assistant"].includes(m.role) || typeof m.content !== "string")) {
      return reply({ error: "Invalid message history" }, 400);
    }
    const contents = messages.map((m: any, index: number) => {
      const parts: any[] = [{ text: m.content.slice(0, 20000) }];
      if (index === messages.length - 1 && m.role === "user" && Array.isArray(body.attachments)) {
        for (const file of body.attachments.slice(0, 5)) {
          if (typeof file.text === "string") parts.push({ text: "\n\n[Attached file: " + String(file.name || "file").slice(0, 160) + "]\n" + file.text.slice(0, 120000) });
          else if (typeof file.dataUrl === "string" && /^(data:image\/(png|jpeg|webp|gif)|data:application\/pdf);base64,/i.test(file.dataUrl)) {
            const match = file.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match && match[2].length < 14000000) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          } else if (file.unsupported) parts.push({ text: "[Unsupported attachment format: " + String(file.name || "file").slice(0, 160) + "]" });
        }
      }
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });
    const upstream = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${apiKey}\`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: "You are JARVIS X, the user's private personal AI assistant. Be warm, capable, thoughtful and conversational. Speak in the language the user uses. Ask concise clarifying questions when requirements are unclear; do not guess important details. Help plan and execute tasks step by step. Never claim to have accessed GitHub, created a repository, changed files, deployed anything or performed an action unless a connected tool actually completed it. For actions needing permissions, explain and request approval." }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
      })
    });
    const result = await upstream.json();
    if (!upstream.ok) return reply({ error: result.error?.message || "AI provider request failed" }, upstream.status);
    const text = result.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    return reply({ reply: text });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
