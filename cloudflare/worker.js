const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const cors=(env,origin)=>origin&&origin===env.APP_ORIGIN?{"access-control-allow-origin":origin,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,content-type","vary":"Origin"}:{};
async function authenticate(request,env){
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)throw new Error("Sign in required.");
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)throw new Error("Supabase gateway settings are missing.");
 const response=await fetch(env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:"Bearer "+token}});
 if(!response.ok)throw new Error("Your JARVIS X session is invalid.");
 const user=await response.json();
 const allowed=(env.JARVIS_OWNER_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!user.email||!allowed.includes(user.email.toLowerCase()))throw new Error("This workspace is not authorised for this account.");
 return {user,token};
}
async function approval(env,auth,id,expectedAction){
 if(!id)throw new Error("An approved action ID is required.");
 const url=new URL(env.SUPABASE_URL+"/rest/v1/jarvis_approvals");
 url.searchParams.set("id","eq."+id);url.searchParams.set("user_id","eq."+auth.user.id);url.searchParams.set("status","eq.approved");url.searchParams.set("select","id,action,payload");
 const response=await fetch(url,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:"Bearer "+auth.token}});
 if(!response.ok)throw new Error("Could not verify the approval record.");
 const rows=await response.json();const row=rows[0];
 if(!row||row.action!==expectedAction)throw new Error("No matching approved action was found.");
 return row;
}
async function audit(env,auth,action,target,details){
 await fetch(env.SUPABASE_URL+"/rest/v1/jarvis_audit_logs",{method:"POST",headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:"Bearer "+auth.token,"content-type":"application/json",prefer:"return=minimal"},body:JSON.stringify({user_id:auth.user.id,action,target,details})});
}
export default {
 async fetch(request,env){
  const origin=request.headers.get("origin")||"";
  const headers=cors(env,origin);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  const url=new URL(request.url);
  if(url.pathname==="/health"&&request.method==="GET")return json({service:"jarvis-x-gateway",status:"ready"},200,headers);
  try{
   const auth=await authenticate(request,env);
   if(url.pathname==="/capabilities"&&request.method==="GET"){
    return json({providers:{gemini:Boolean(env.GEMINI_API_KEY),github:Boolean(env.GITHUB_TOKEN),cloudflareDeploy:Boolean(env.GITHUB_TOKEN&&env.GITHUB_OWNER&&env.GITHUB_REPO),supabase:Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY)}},200,headers);
   }
   if(url.pathname==="/api/github/repositories"&&request.method==="POST"){
    const body=await request.json();
    const approved=await approval(env,auth,body.approvalId,"github.create_repository");
    const approvedPayload=approved.payload||{};
    const approvedName=String(approvedPayload.name||"").trim().toLowerCase().replace(/[^a-z0-9._-]/g,"-").slice(0,80);
    if(!approvedName)return json({error:"The approved request does not include a repository name."},400,headers);
    if(!env.GITHUB_TOKEN)return json({error:"GitHub token is not configured."},503,headers);
    const response=await fetch("https://api.github.com/user/repos",{method:"POST",headers:{authorization:"Bearer "+env.GITHUB_TOKEN,accept:"application/vnd.github+json","content-type":"application/json","x-github-api-version":"2022-11-28","user-agent":"JARVIS-X"},body:JSON.stringify({name:approvedName,description:String(approvedPayload.description||"Created by JARVIS X").slice(0,300),private:approvedPayload.private!==false,auto_init:true})});
    const result=await response.json();if(!response.ok)return json({error:result.message||"GitHub repository creation failed."},response.status,headers);
    await audit(env,auth,"github.repository_created",result.full_name,{url:result.html_url,private:result.private});
    return json({success:true,repository:{name:result.full_name,url:result.html_url,private:result.private}},201,headers);
   }
   if(url.pathname==="/api/deploy/cloudflare"&&request.method==="POST"){
    const body=await request.json();
    const approved=await approval(env,auth,body.approvalId,"cloudflare.deploy_pages");
    const projectName=String(approved.payload?.projectName||"").toLowerCase().replace(/[^a-z0-9-]/g,"-").slice(0,58);
    if(!projectName)return json({error:"The approved request does not include a Pages project name."},400,headers);
    if(!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO)return json({error:"GitHub workflow dispatch integration is not configured."},503,headers);
    const ref=String(approved.payload?.ref||"jarvis-x-foundation");
    const endpoint="https://api.github.com/repos/"+env.GITHUB_OWNER+"/"+env.GITHUB_REPO+"/actions/workflows/deploy-cloudflare.yml/dispatches";
    const response=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+env.GITHUB_TOKEN,accept:"application/vnd.github+json","content-type":"application/json","x-github-api-version":"2022-11-28","user-agent":"JARVIS-X"},body:JSON.stringify({ref,inputs:{project_name:projectName,branch:ref}})});
    if(!response.ok){const result=await response.json();return json({error:result.message||"Could not start Cloudflare deployment."},response.status,headers);}
    await audit(env,auth,"cloudflare.deployment_requested",projectName,{ref});
    return json({success:true,message:"Cloudflare deployment workflow started.",projectName,workflow:"deploy-cloudflare.yml"},202,headers);
   }
   return json({error:"Route not found."},404,headers);
  }catch(error){return json({error:error instanceof Error?error.message:"Gateway error."},401,headers);}
 }
};
