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
    return { part:{text: "\n\n[Attached file: " + fileName + "]\n" + text.slice(0, 100000)}, size:bytes.byteLength };
  }
  return { part:{text: "\n\n[Attached file: " + fileName + " — uploaded securely, but this file format is not yet supported for content extraction.]"}, size:bytes.byteLength };
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
          const prepared=await attachmentPart(supabase,user.id,attachment);
          attachmentBytesTotal+=prepared.size;
          if(attachmentBytesTotal>15*1024*1024)throw new Error('The total attachment size for this conversation request exceeds 15 MB.');
          parts.push(prepared.part);
        }
      }
      contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
    }
    const {data:preferences}=await supabase.from("jarvis_preferences").select("preferred_language,custom_instructions,settings").eq("user_id",user.id).maybeSingle();
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
    let memoriesSaved=0;
    const latestUser=[...messages].reverse().find((message:any)=>message.role==="user");
    if(preferences?.settings?.memory_enabled===true && latestUser?.content){
      try{
        const memoryResponse=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({systemInstruction:{parts:[{text:"Extract only explicit, useful long-term preferences, project context or recurring workflow facts the user directly stated. Never infer. Never save sensitive personal data, health details, passwords, API keys, financial account data, government IDs, religion, politics, sexuality or other highly sensitive information. Return JSON only as an array of at most 3 objects with keys content and category. Categories: preference, project, workflow, general. If nothing qualifies, return []."}]},contents:[{role:"user",parts:[{text:latestUser.content.slice(0,6000)}]}],generationConfig:{responseMimeType:"application/json",maxOutputTokens:1200}})});
        const memoryResult=await memoryResponse.json();
        if(memoryResponse.ok){
          const memoryText=memoryResult.candidates?.[0]?.content?.parts?.map((part:any)=>part.text||"").join("")||"[]";
          const extracted=JSON.parse(memoryText);
          if(Array.isArray(extracted)){
            const {data:existing}=await supabase.from("jarvis_memories").select("content").eq("user_id",user.id).order("created_at",{ascending:false}).limit(60);
            const known=new Set((existing||[]).map((item:any)=>String(item.content).toLowerCase()));
            const inserts=extracted.slice(0,3).filter((item:any)=>typeof item.content==="string"&&item.content.trim().length>0&&item.content.length<=500&&!known.has(item.content.trim().toLowerCase())).map((item:any)=>({user_id:user.id,content:item.content.trim(),category:["preference","project","workflow","general"].includes(item.category)?item.category:"general",source:"auto"}));
            if(inserts.length){const {error:memoryError}=await supabase.from("jarvis_memories").insert(inserts);if(!memoryError)memoriesSaved=inserts.length;}
          }
        }
      }catch{/* Memory extraction is optional and must never block the chat reply. */}
    }
    return reply({ reply: text, memoriesSaved });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});