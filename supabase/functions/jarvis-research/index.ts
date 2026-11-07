import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":Deno.env.get("APP_ORIGIN")||"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return json({error:"Sign in required."},401);
 const supabaseKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
 if(!supabaseKey)return json({error:"Supabase publishable key is missing."},503);
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,supabaseKey,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)return json({error:"Invalid session."},401);
 const tavilyKey=Deno.env.get("TAVILY_API_KEY"),geminiKey=Deno.env.get("GEMINI_API_KEY");
 if(!tavilyKey)return json({error:"TAVILY_API_KEY is not configured."},503);
 if(!geminiKey)return json({error:"GEMINI_API_KEY is not configured."},503);
 try{
  const body=await req.json(),query=String(body.query||"").trim().slice(0,400);
  if(!query)return json({error:"Enter a research question."},400);
  const searchResponse=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"Authorization":"Bearer "+tavilyKey,"Content-Type":"application/json"},body:JSON.stringify({query,max_results:8,search_depth:"basic",topic:"general",include_answer:false,include_raw_content:false})});
  const search=await searchResponse.json();
  if(!searchResponse.ok)return json({error:search.message||"Web search provider request failed."},502);
  const sources=(search.results||[]).slice(0,8).map((item:any,index:number)=>({number:index+1,title:String(item.title||"Source").slice(0,250),url:String(item.url||""),snippet:String(item.content||"").slice(0,5000),score:item.score||null}));
  if(!sources.length)return json({query,summary:"No useful sources were found for this query.",sources:[]});
  const sourceText=sources.map(source=>"["+source.number+"] "+source.title+"\nURL: "+source.url+"\nContent: "+source.snippet).join("\n\n");
  const answerResponse=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(geminiKey),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:"You are JARVIS X Research. Answer the user's question using only the supplied web search sources. Cite factual claims with numbered references like [1] that match the source list. Clearly distinguish facts from uncertainty, mention when sources disagree, and never invent citations or facts. Respond in the user's language."}]},contents:[{role:"user",parts:[{text:"Research question: "+query+"\n\nSources:\n"+sourceText}]}],generationConfig:{temperature:0.2,maxOutputTokens:5000}})});
  const answer=await answerResponse.json();
  if(!answerResponse.ok)return json({error:answer.error?.message||"Research synthesis failed."},502);
  const summary=answer.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"The research model returned no summary.";
  await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"research.completed",target:query,details:{sourceCount:sources.length,provider:"tavily"}});
  return json({query,summary,sources:sources.map(({number,title,url,score})=>({number,title,url,score})),provider:"tavily"});
 }catch(error){return json({error:error instanceof Error?error.message:"Unexpected research error."},500);}
});
