import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return reply({ error: "Sign in required" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return reply({ error: "Invalid session" }, 401);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return reply({ error: "Gemini API key is not configured on the server yet." }, 503);
  try {
    const body = await req.json();
    const model = ["gemini-2.5-flash", "gemini-2.5-pro"].includes(body.model) ? body.model : "gemini-2.5-flash";
    const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
    if (!messages.length || messages.some((m: any) => !["user", "assistant"].includes(m.role) || typeof m.content !== "string")) {
      return reply({ error: "Invalid message history" }, 400);
    }
    const contents = messages.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 20000) }] }));
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: "You are JARVIS X, a capable, warm, accurate personal AI assistant. Reply naturally in the user's language. Be honest about limitations and never claim to have performed actions you did not perform." }] }, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } })
    });
    const result = await upstream.json();
    if (!upstream.ok) return reply({ error: result.error?.message || "AI provider request failed" }, upstream.status);
    const text = result.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    return reply({ reply: text });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});