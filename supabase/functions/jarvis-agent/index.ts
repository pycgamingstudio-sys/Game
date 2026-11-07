import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":Deno.env.get("APP_ORIGIN")||"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const required:Record<string,string[]>={gemini:["GEMINI_API_KEY"],github:["GITHUB_TOKEN"],cloudflare:["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID"],search:["SEARCH_API_KEY"],image:["IMAGE_PROVIDER_API_KEY"],speech:["TTS_API_KEY"],email:["EMAIL_PROVIDER_API_KEY"]};
const configured=(provider:string)=>(required[provider]||[]).every(key=>Boolean(Deno.env.get(key)));
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
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
   const {data:run,error}=await supabase.from("jarvis_agent_runs").insert({user_id:user.id,goal,status:"planning"}).select().single();if(error)return json({error:error.message},400);
   const plan=[{step:1,description:"Analyze the request and prepare an execution plan",status:"planned"},{step:2,description:"Check connected providers and permissions",status:"planned"},{step:3,description:"Request approval for external or destructive actions",status:"planned"}];
   await supabase.from("jarvis_agent_runs").update({status:"waiting_approval",plan}).eq("id",run.id).eq("user_id",user.id);
   const available=Object.keys(required).filter(configured);
   await supabase.from("jarvis_audit_logs").insert({user_id:user.id,run_id:run.id,action:"agent.plan_created",details:{goal,availableProviders:available}});
   return json({run:{...run,status:"waiting_approval",plan},availableProviders:available,message:"Plan created. External actions still require provider access and explicit approval."});
  }
  return json({error:"Unknown agent task.",supported:["capabilities","create_project","create_task","request_approval","decide_approval","run_agent"]},400);
 }catch(error){return json({error:error instanceof Error?error.message:"Unexpected agent error"},500);}
});
