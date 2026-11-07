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
 let body:any;
 try { body=await req.json(); } catch { return json({error:"Request body must be valid JSON."},400); }
 const task=String(body.task||""),p=body.payload&&typeof body.payload==="object"?body.payload:{};
 if(task==="capabilities"){
  return json({providers:Object.keys(required).map(id=>({id,configured:configured(id),requiredSecrets:required[id]}))});
 }
 if(task==="plan_task"){
  const goal=String(p.goal||"").trim().slice(0,6000);
  if(!goal)return json({error:"Tell JARVIS what outcome you want first."},400);
  const apiKey=Deno.env.get("GEMINI_API_KEY");
  if(!apiKey)return json({error:"Gemini is not connected yet. Add GEMINI_API_KEY to Supabase Edge Function Secrets."},503);
  const available=Object.keys(required).filter(configured);
  const upstream=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(apiKey),{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({
    systemInstruction:{parts:[{text:"You are JARVIS X, a careful personal AI project partner. Understand the user's goal. If essential requirements are unclear, DO NOT invent them: return needs_clarification=true and ask 1-3 concise, specific questions in questions. Otherwise return a practical, ordered plan. Never claim execution. Identify which steps require connected providers and explicit approval. Return JSON only: {needs_clarification:boolean,questions:string[],summary:string,steps:[{title:string,description:string,provider:string|null,requiresApproval:boolean}]}. Keep the plan concrete and realistic. Reply in the user's language."}]},
    contents:[{role:"user",parts:[{text:"User request:\n"+goal+"\nConfigured provider secrets (not proof of permissions): "+available.join(", ")}]}],
    generationConfig:{temperature:0.25,responseMimeType:"application/json",maxOutputTokens:3500}
   })
  });
  const result=await upstream.json();
  if(!upstream.ok)return json({error:result.error?.message||"JARVIS planning request failed."},502);
  const raw=result.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"";
  let plan:any;try{plan=JSON.parse(raw);}catch{return json({error:"JARVIS received an invalid planning response. Please try again."},502);}
  if(typeof plan.needs_clarification!=="boolean"||!Array.isArray(plan.questions)||!Array.isArray(plan.steps)||typeof plan.summary!=="string")return json({error:"The planning response was incomplete."},502);
  return json({plan,availableProviders:available,executed:false});
 }
 if(task==="create_github_project"){
  const name=String(p.name||"").trim(),goal=String(p.goal||"").trim().slice(0,7000);
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(name))return json({error:"Repository name must use 1–100 letters, numbers, dots, underscores or hyphens."},400);
  if(goal.length<20)return json({error:"Describe the project in at least 20 characters so JARVIS can generate a useful starter."},400);
  const token=Deno.env.get("GITHUB_TOKEN"),apiKey=Deno.env.get("GEMINI_API_KEY");
  if(!token||!apiKey)return json({error:"This action needs both GEMINI_API_KEY and GITHUB_TOKEN server secrets."},503);
  const generated=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key="+encodeURIComponent(apiKey),{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({
    systemInstruction:{parts:[{text:"You are a senior software architect. Generate a small but genuinely runnable starter project matching the user's brief. Return JSON only with shape {description:string,files:[{path:string,content:string}]}. Include a useful README and minimal working source/config files. Limit to 8 files and 45000 characters per file. Avoid secrets, credentials, telemetry, hidden network calls, destructive scripts and fake functionality. Do not include package lockfiles. Choose a simple stack appropriate to the request. Do not use placeholder TODOs for core requested behavior."}]},
    contents:[{role:"user",parts:[{text:"Create a runnable starter project. Repository: "+name+"\nProject brief: "+goal}]}],
    generationConfig:{temperature:0.25,responseMimeType:"application/json",maxOutputTokens:12000}
   })
  });
  const gen=await generated.json();
  if(!generated.ok)return json({error:gen.error?.message||"Code generation failed."},502);
  const raw=gen.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"";
  let scaffold:any;try{scaffold=JSON.parse(raw);}catch{return json({error:"The code generator returned invalid project files."},502);}
  if(!Array.isArray(scaffold.files)||!scaffold.files.length||scaffold.files.length>8)return json({error:"Generated project file list is invalid."},502);
  for(const file of scaffold.files){
   if(typeof file.path!=="string"||typeof file.content!=="string"||file.content.length>45000||file.path.startsWith("/")||file.path.split("/").some((part:string)=>part===".."||part==="."))return json({error:"Generated project contains an unsafe or oversized file path."},502);
  }
  const created=await fetch("https://api.github.com/user/repos",{method:"POST",headers:{"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},body:JSON.stringify({name,description:String(scaffold.description||goal).slice(0,350),private:true,auto_init:true})});
  const repository=await created.json();
  if(!created.ok)return json({error:repository.message||"GitHub repository creation failed."},created.status);
  const uploaded:string[]=[];
  for(const file of scaffold.files){
   const bytes=new TextEncoder().encode(file.content);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
   const put=await fetch("https://api.github.com/repos/"+repository.full_name+"/contents/"+file.path.split("/").map(encodeURIComponent).join("/"),{
    method:"PUT",headers:{"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
    body:JSON.stringify({message:"JARVIS X: add "+file.path,content:btoa(binary)})
   });
   if(!put.ok){const failure=await put.json();return json({error:"Repository created, but upload failed at "+file.path+": "+(failure.message||"GitHub error"),repository:{name:repository.name,full_name:repository.full_name,url:repository.html_url,private:true},uploadedFiles:uploaded},502);}
   uploaded.push(file.path);
  }
  return json({repository:{name:repository.name,full_name:repository.full_name,url:repository.html_url,private:true,default_branch:repository.default_branch},files:uploaded,message:"Private GitHub project created and starter files uploaded."});
 }
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
