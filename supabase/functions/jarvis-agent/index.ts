import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
const cors={"Access-Control-Allow-Origin":Deno.env.get("APP_ORIGIN")||"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const required:Record<string,string[]>={gemini:["GEMINI_API_KEY"],github:["GITHUB_TOKEN"],cloudflare:["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID"],search:["SEARCH_API_KEY"],image:["IMAGE_PROVIDER_API_KEY"],speech:["TTS_API_KEY"],email:["EMAIL_PROVIDER_API_KEY"]};
const configured=(provider:string)=>(required[provider]||[]).every(key=>Boolean(Deno.env.get(key)));
async function gatewayProviders(auth:string):Promise<Record<string,boolean>> {
 const gateway=Deno.env.get("JARVIS_GATEWAY_URL");
 if(!gateway)return {};
 try{
  const base=gateway.endsWith("/")?gateway.slice(0,-1):gateway;
  const response=await fetch(base+"/capabilities",{headers:{Authorization:auth}});
  if(!response.ok)return {};
  const result=await response.json();
  return result.providers||{};
 }catch{return {};}
}

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
  if(task==="capabilities"){
   const gateway=await gatewayProviders(auth);
   const providers=Object.keys(required).map(id=>{
    if(id==="github")return {id,configured:Boolean(gateway.github),requiredSecrets:["GITHUB_TOKEN_JARVIS","GITHUB_OWNER","GITHUB_REPO"]};
    if(id==="cloudflare")return {id,configured:Boolean(gateway.cloudflare),requiredSecrets:["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","JARVIS_GATEWAY_URL"]};
    return {id,configured:configured(id),requiredSecrets:required[id]};
   });
   return json({providers});
  }
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
   if(decision==="approved" && ["github.create_repository","cloudflare.deploy_pages"].includes(data.action)){
    const gateway=Deno.env.get("JARVIS_GATEWAY_URL");
    if(!gateway)return json({approval:data,execution:{status:"waiting_for_gateway"},message:"Approved. Add JARVIS_GATEWAY_URL to Supabase Edge Function Secrets to enable execution."});
    const route=data.action==="github.create_repository"?"/api/github/repositories":"/api/deploy/cloudflare";
    const payload=data.action==="github.create_repository"?{...data.payload,approvalId:id}:{projectName:data.payload?.projectName,ref:data.payload?.ref,approvalId:id};
    const executionResponse=await fetch((gateway.endsWith("/")?gateway.slice(0,-1):gateway)+route,{method:"POST",headers:{"Authorization":auth,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const execution=await executionResponse.json();
    await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"approval.execution_attempted",target:id,status:executionResponse.ok?"success":"failed",details:execution});
    return json({approval:data,execution,message:executionResponse.ok?"Approved action submitted to the connected provider.":"Approval saved, but provider execution failed."},executionResponse.ok?200:502);
   }
   return json({approval:data,message:decision==="approved"?"Approved. No external execution was associated with this action.":"Rejected. No action was executed."});
  }
  if(task==="execute_approved"){
   const approvalId=String(p.approvalId||"");if(!approvalId)return json({error:"Approval ID is required."},400);
   const {data:approved,error:approvalError}=await supabase.from("jarvis_approvals").select("*").eq("id",approvalId).eq("user_id",user.id).eq("status","approved").single();
   if(approvalError||!approved)return json({error:"Approved action not found."},404);
   if(!["github.create_repository","cloudflare.deploy_pages"].includes(approved.action))return json({error:"No executor is registered for this approved action yet."},400);
   const gateway=Deno.env.get("JARVIS_GATEWAY_URL");if(!gateway)return json({error:"Add JARVIS_GATEWAY_URL to Supabase Edge Function Secrets before executing."},503);
   const base=gateway.endsWith("/")?gateway.slice(0,-1):gateway;
   const route=approved.action==="github.create_repository"?"/api/github/repositories":"/api/deploy/cloudflare";
   const requestBody=approved.action==="github.create_repository"?{...approved.payload,approvalId}:{approvalId};
   const response=await fetch(base+route,{method:"POST",headers:{"Authorization":auth,"Content-Type":"application/json"},body:JSON.stringify(requestBody)});
   const execution=await response.json();
   await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"approval.execution_attempted",target:approvalId,status:response.ok?"success":"failed",details:execution});
   return json({approval:approved,execution},response.ok?200:502);
  }
  if(task==="run_agent"){
   const goal=String(p.goal||"").trim().slice(0,4000);if(!goal)return json({error:"Describe what you want the agent to do."},400);
   if(!configured("gemini"))return json({error:"AI planning requires the Gemini API key.",missingProviders:["gemini"]},503);
   const gateway=await gatewayProviders(auth);
   const available=Object.keys(required).filter(id=>!["github","cloudflare"].includes(id)&&configured(id));
   if(gateway.github)available.push("github");
   if(gateway.cloudflare)available.push("cloudflare");
   const planResponse=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(Deno.env.get("GEMINI_API_KEY")!),{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     systemInstruction:{parts:[{text:"You are JARVIS X autonomous project planner. Convert the user goal into a practical ordered execution plan. Never claim to have executed anything. For a request to build a website or app, include a github create_repository step requiring approval, with parameters {name,description,private:true,files:[{path,content}]} containing 3–8 complete, working source files for a minimal responsive Vite web app; include package.json, index.html, src/main.js and style.css where appropriate. Use relative paths only and keep total generated source under 250 KB. If deployment is requested, include a cloudflare deploy_pages step requiring approval with parameters {projectName,repository,branch}. The repository value must be the full name pycgamingstudio-sys/<parameters.name>, and branch should be main. For non-code requests do not invent repository actions. Return JSON only with shape {summary:string,steps:[{title:string,description:string,provider:string|null,requiresApproval:boolean,kind:string,parameters:object}]}"}]},
     contents:[{role:"user",parts:[{text:"Goal: "+goal+"\\nConnected providers: "+available.join(", ")+"\\nAvailable integrations can still require additional OAuth scopes, project access, billing or configuration. Plan safely."}]}],
     generationConfig:{temperature:0.2,responseMimeType:"application/json",maxOutputTokens:12000}
    })
   });
   const planResult=await planResponse.json();
   if(!planResponse.ok)return json({error:planResult.error?.message||"AI planner request failed."},502);
   const planText=planResult.candidates?.[0]?.content?.parts?.map((part:any)=>part.text||"").join("")||"";
   let plan:any;try{plan=JSON.parse(planText);}catch{return json({error:"AI planner returned invalid structured output."},502);}
   if(!Array.isArray(plan.steps)||!plan.summary)return json({error:"AI planner returned an incomplete plan."},502);
   const {data:run,error}=await supabase.from("jarvis_agent_runs").insert({user_id:user.id,goal,status:"waiting_approval",plan:plan.steps,result:{summary:plan.summary,model:"gemini-2.5-flash"}}).select().single();
   if(error)return json({error:error.message},400);
   const approvals:any[]=[];
   for(const step of plan.steps){
    let action="";
    if(step.requiresApproval && step.provider==="github" && step.kind==="create_repository")action="github.create_repository";
    if(step.requiresApproval && step.provider==="cloudflare" && step.kind==="deploy_pages")action="cloudflare.deploy_pages";
    if(action){
     const {data:approval,error:approvalError}=await supabase.from("jarvis_approvals").insert({user_id:user.id,action,payload:step.parameters&&typeof step.parameters==="object"?step.parameters:{},status:"pending"}).select().single();
     if(!approvalError&&approval)approvals.push({id:approval.id,action,step:step.title,payload:approval.payload});
    }
   }
   await supabase.from("jarvis_audit_logs").insert({user_id:user.id,run_id:run.id,action:"agent.plan_created",details:{goal,availableProviders:available,approvalCount:approvals.length}});
   return json({run,summary:plan.summary,steps:plan.steps,approvals,availableProviders:available,message:"AI execution plan created. External actions are waiting for your approval."});
  }
  return json({error:"Unknown agent task.",supported:["capabilities","create_project","create_task","request_approval","decide_approval","run_agent"]},400);
 }catch(error){return json({error:error instanceof Error?error.message:"Unexpected agent error"},500);}
});
