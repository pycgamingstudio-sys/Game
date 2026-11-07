import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const allowedOrigin=Deno.env.get("APP_ORIGIN")||"http://localhost:5173";
const cors={"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-jarvis-local-key","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const required:Record<string,string[]>={gemini:["GEMINI_API_KEY"],github:["GITHUB_TOKEN"],cloudflare:["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID"],search:["SEARCH_API_KEY"],image:["IMAGE_PROVIDER_API_KEY"],speech:["TTS_API_KEY"],email:["EMAIL_PROVIDER_API_KEY"]};
const configured=(provider:string)=>(required[provider]||[]).every(key=>Boolean(Deno.env.get(key)));
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const origin=req.headers.get("Origin")||"";
 if(origin&&origin!==allowedOrigin)return json({error:"This private JARVIS X endpoint only accepts the configured local origin."},403);
 const localKey=Deno.env.get("JARVIS_LOCAL_ACCESS_KEY");
 if(!localKey||req.headers.get("x-jarvis-local-key")!==localKey)return json({error:"Private local access key is missing or invalid."},401);
 const body=await req.json(),task=String(body.task||""),p=body.payload&&typeof body.payload==="object"?body.payload:{};
 if(task==="create_github_repository"){
  const token=Deno.env.get("GITHUB_TOKEN");
  if(!token)return json({error:"Add GITHUB_TOKEN to Supabase Edge Function Secrets first."},503);
  const name=String(p.name||"").trim();
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(name))return json({error:"Repository name must use 1–100 letters, numbers, dots, underscores or hyphens."},400);
  const upstream=await fetch("https://api.github.com/user/repos",{method:"POST",headers:{"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},body:JSON.stringify({name,description:String(p.description||"").slice(0,350),private:p.private!==false,auto_init:true})});
  const result=await upstream.json();
  if(!upstream.ok)return json({error:result.message||"GitHub repository creation failed."},upstream.status);
  return json({repository:{name:result.name,full_name:result.full_name,private:result.private,url:result.html_url,clone_url:result.clone_url,default_branch:result.default_branch},message:"GitHub repository created successfully."});
 }
 const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return json({error:"Sign in required"},401);
 const key=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
 if(!key)return json({error:"Supabase publishable key is missing from function environment."},503);
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,key,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return json({error:"Invalid session"},401);
 try{
  const body=await req.json(),task=String(body.task||""),p=body.payload&&typeof body.payload==="object"?body.payload:{};
  if(task==="capabilities")return json({providers:Object.keys(required).map(id=>({id,configured:configured(id),requiredSecrets:required[id]}))});
  if(task==="create_project"){
   const name=String(p.name||"").trim().slice(0,100);if(!name)return json({error:"Project name is required."},400);
   const {data,error}=await supabase.from("jarvis_projects").insert({user_id:user.id,name,description:String(p.description||"").slice(0,2000),project_type:String(p.projectType||"general").slice(0,40)}).select().single();
   if(error)return json({error:error.message},400);await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"project.created",target:data.id,details:{name}});return json({project:data});
  }
  if(task==="create_task"){
   const title=String(p.title||"").trim().slice(0,180);if(!title)return json({error:"Task title is required."},400);
   const {data,error}=await supabase.from("jarvis_tasks").insert({user_id:user.id,title,description:String(p.description||"").slice(0,4000),status:"queued"}).select().single();
   if(error)return json({error:error.message},400);await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"task.queued",target:data.id,details:{title}});return json({task:data});
  }
  if(task==="request_approval"){
   const action=String(p.action||"").trim().slice(0,120);if(!action)return json({error:"Action is required."},400);
   const {data,error}=await supabase.from("jarvis_approvals").insert({user_id:user.id,action,payload:p.details&&typeof p.details==="object"?p.details:{},status:"pending"}).select().single();
   if(error)return json({error:error.message},400);await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"approval.requested",target:data.id,details:{action}});return json({approval:data,message:"Approval request created. Nothing has been executed yet."});
  }
  if(task==="decide_approval"){
   const id=String(p.approvalId||""),decision=p.decision==="approved"?"approved":p.decision==="rejected"?"rejected":"";
   if(!id||!decision)return json({error:"Approval ID and valid decision are required."},400);
   const {data,error}=await supabase.from("jarvis_approvals").update({status:decision,decided_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id).eq("status","pending").select().single();
   if(error||!data)return json({error:error?.message||"Pending approval not found."},404);
   await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"approval."+decision,target:id,details:{approved_action:data.action}});
   return json({approval:data,message:decision==="approved"?"Approved. The executor still requires provider access and the relevant integration.":"Rejected. No action was executed."});
  }
  if(task==="run_agent"){
   const goal=String(p.goal||"").trim().slice(0,4000);if(!goal)return json({error:"Describe what you want the agent to do."},400);
   if(!configured("gemini"))return json({error:"AI planning requires the Gemini API key.",missingProviders:["gemini"]},503);
   const available=Object.keys(required).filter(configured);
   const planResponse=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(Deno.env.get("GEMINI_API_KEY")!),{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     systemInstruction:{parts:[{text:"You are JARVIS X task planner. Convert the user's goal into a practical ordered execution plan. Do not claim to execute actions. Mark steps that need external provider integrations or user approval. Return JSON only with shape {summary:string,steps:[{title:string,description:string,provider:string|null,requiresApproval:boolean,kind:string}]}."}]},
     contents:[{role:"user",parts:[{text:"Goal: "+goal+"\\nConnected providers: "+available.join(", ")+"\\nAvailable integrations can still require additional OAuth scopes, project access, billing or configuration. Plan safely."}]}],
     generationConfig:{temperature:0.2,responseMimeType:"application/json",maxOutputTokens:3000}
    })
   });
   const planResult=await planResponse.json();
   if(!planResponse.ok)return json({error:planResult.error?.message||"AI planner request failed."},502);
   const planText=planResult.candidates?.[0]?.content?.parts?.map((part:any)=>part.text||"").join("")||"";
   let plan:any;try{plan=JSON.parse(planText);}catch{return json({error:"AI planner returned invalid structured output."},502);}
   if(!Array.isArray(plan.steps)||!plan.summary)return json({error:"AI planner returned an incomplete plan."},502);
   const {data:run,error}=await supabase.from("jarvis_agent_runs").insert({user_id:user.id,goal,status:"waiting_approval",plan:plan.steps,result:{summary:plan.summary,model:"gemini-2.5-flash"}}).select().single();
   if(error)return json({error:error.message},400);
   await supabase.from("jarvis_audit_logs").insert({user_id:user.id,run_id:run.id,action:"agent.plan_created",details:{goal,availableProviders:available}});
   return json({run,summary:plan.summary,steps:plan.steps,availableProviders:available,message:"AI execution plan created. No external action has been run yet."});
  }
  return json({error:"Unknown agent task.",supported:["capabilities","create_project","create_task","request_approval","decide_approval","run_agent"]},400);
 }catch(error){return json({error:error instanceof Error?error.message:"Unexpected agent error"},500);}
});
