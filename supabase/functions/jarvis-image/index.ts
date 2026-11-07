import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
const cors={"Access-Control-Allow-Origin":Deno.env.get("APP_ORIGIN")||"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return json({error:"Sign in required."},401);
 const key=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
 if(!key)return json({error:"Supabase publishable key is missing."},503);
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,key,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return json({error:"Invalid session."},401);
 const apiKey=Deno.env.get("GEMINI_API_KEY");if(!apiKey)return json({error:"GEMINI_API_KEY is not configured."},503);
 try{
  const body=await req.json(),prompt=String(body.prompt||"").trim().slice(0,4000);
  if(!prompt)return json({error:"Describe the image you want to create."},400);
  const allowed=["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"];
  const aspectRatio=allowed.includes(body.aspectRatio)?body.aspectRatio:"1:1";
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent",{method:"POST",headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseFormat:{image:{aspectRatio}}}})});
  const result=await response.json();if(!response.ok)return json({error:result.error?.message||"Image generation failed."},502);
  const parts=result.candidates?.[0]?.content?.parts||[];
  const imagePart=parts.find((part:any)=>part.inlineData?.data&&String(part.inlineData.mimeType||"").startsWith("image/"));
  if(!imagePart)return json({error:"The image model returned no image. Try a clearer prompt."},502);
  const binary=atob(imagePart.inlineData.data),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const mimeType=String(imagePart.inlineData.mimeType||"image/png");
  const extension=mimeType==="image/jpeg"?"jpg":mimeType==="image/webp"?"webp":"png";
  const fileName="jarvis-generated-"+crypto.randomUUID()+"."+extension;
  const storagePath=user.id+"/"+fileName;
  const {error:uploadError}=await supabase.storage.from("jarvis-private").upload(storagePath,bytes,{contentType:mimeType,upsert:false});
  if(uploadError)return json({error:"Image generated but secure storage failed: "+uploadError.message},500);
  const {data:file,error:fileError}=await supabase.from("jarvis_files").insert({user_id:user.id,file_name:fileName,mime_type:mimeType,size_bytes:bytes.byteLength,storage_path:storagePath}).select().single();
  if(fileError)return json({error:"Image generated but file record could not be saved."},500);
  const {data:signed,error:signedError}=await supabase.storage.from("jarvis-private").createSignedUrl(storagePath,3600);
  if(signedError)return json({error:"Image saved, but preview link could not be created."},500);
  await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"image.generated",target:file.id,details:{model:"gemini-3.1-flash-image",aspectRatio}});
  return json({fileId:file.id,fileName,mimeType,size:bytes.byteLength,storagePath,imageUrl:signed.signedUrl,model:"gemini-3.1-flash-image"});
 }catch(error){return json({error:error instanceof Error?error.message:"Unexpected image generation error."},500);}
});
