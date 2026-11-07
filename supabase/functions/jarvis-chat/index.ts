import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });


function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}
async function attachmentPart(supabase: any, userId: string, attachment: any): Promise<{part:any,size:number}> {
  const path = String(attachment.storagePath || "");
  const fileName = String(attachment.fileName || "attachment").slice(0,160);
  const mimeType = String(attachment.mimeType || "application/octet-stream").toLowerCase();
  if (!path.startsWith(userId + "/")) throw new Error("Attachment access denied.");
  const { data: signed, error } = await supabase.storage.from("jarvis-private").createSignedUrl(path, 120);
  if (error || !signed?.signedUrl) throw new Error("Could not access attachment " + fileName);
  const response = await fetch(signed.signedUrl);
  if (!response.ok) throw new Error("Could not download attachment " + fileName);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error(fileName + " is too large for AI analysis (15 MB max).");
  if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
    return { part:{ inlineData: { mimeType, data: toBase64(bytes) } }, size:bytes.byteLength };
  }
  if (mimeType.startsWith("text/") || ["application/json","text/csv"].includes(mimeType) || /\.(txt|md|csv|json)$/i.test(fileName)) {
    if (bytes.byteLength > 2 * 1024 * 1024) throw new Error(fileName + " is too large for text extraction (2 MB max).");
    const text = new TextDecoder().decode(bytes);
    return { text: "\n\n[Attached file: " + fileName + "]\n" + text.slice(0, 100000) };
  }
  return { text: "\n\n[Attached file: " + fileName + " — uploaded securely, but this file format is not yet supported for content extraction.]"};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return reply({ error: "Sign in required" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return reply({ error: "Invalid session" }, 401);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return reply({ error: "Gemini API key is not configured on the server yet." }, 503);
  try {
    const body = await req.json();
    const model = ["gemini-3.8-flash", "gemini-3.7-flash"].includes(body.model) ? body.model : "gemini-3.8-flash";
    const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
    if (!messages.length || messages.some((m: any) => !["user", "assistant"].includes(m.role) || typeof m.content !== "string")) {
      return reply({ error: "Invalid message history" }, 400);
    }
    const contents: any[] = [];
    let attachmentBytesTotal=0;
    for (const message of messages) {
      const parts: any[] = [{ text: message.content.slice(0, 20000) }];
      if (message.role === "user" && Array.isArray(message.attachments)) {
        for (const attachment of message.attachments.slice(0, 4)) {
          const prepared=await attachmentPart(supabase,user.id,attachment);\n          attachmentBytesTotal+=prepared.size;\n          if(attachmentBytesTotal>15*1024*1024)throw new Error('The total attachment size for this conversation request exceeds 15 MB.');\n          parts.push(prepared.part);
        }
      }
      contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
    }
    const {data:preferences}=await supabase.from("jarvis_preferences").select("preferred_language,custom_instructions").eq("user_id",user.id).maybeSingle();
    const languageInstruction=preferences?.preferred_language==="hi"?" Reply in Hindi.":preferences?.preferred_language==="en"?" Reply in English.":preferences?.preferred_language==="hinglish"?" Reply naturally in Hinglish (Hindi mixed with English).":" Reply in the user's language.";
    const customInstructions=String(preferences?.custom_instructions||"").slice(0,3000);
    const systemText="You are JARVIS X, a capable, warm, accurate personal AI assistant. Be honest about limitations and never claim to have performed actions you did not perform."+languageInstruction+(customInstructions?"\n\nUser's personal instructions (follow unless unsafe or conflicting with higher-priority rules):\n"+customInstructions:"");
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemText }] }, generationConfig: { maxOutputTokens: 4096 } })
    });
    const result = await upstream.json();
    if (!upstream.ok) return reply({ error: result.error?.message || "AI provider request failed" }, upstream.status);
    const text = result.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    return reply({ reply: text });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});