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
  const body=await req.json(),text=String(body.text||"").trim().slice(0,4000);
  if(!text)return json({error:"Text to speak is required."},400);
  const voice=["Kore","Puck","Charon","Fenrir","Aoede","Leda"].includes(body.voice)?body.voice:"Kore";
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},body:JSON.stringify({model:"gemini-3.8-flash-tts",input:"[clear, warm, natural conversational delivery] "+text,response_format:{type:"audio"},generation_config:{speech_config:[{voice}]}})});
  const result=await response.json();if(!response.ok)return json({error:result.error?.message||"Speech generation failed."},502);
  const audioData=result.output_audio?.data;if(!audioData)return json({error:"The speech model returned no audio."},502);
  const binary=atob(audioData),pcm=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)pcm[i]=binary.charCodeAt(i);
  const sampleRate=24000,channels=1,bitsPerSample=16,blockAlign=channels*bitsPerSample/8,byteRate=sampleRate*blockAlign;
  const bytes=new Uint8Array(44+pcm.length),view=new DataView(bytes.buffer);
  const write=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
  write(0,"RIFF");view.setUint32(4,36+pcm.length,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,sampleRate,true);view.setUint32(28,byteRate,true);view.setUint16(32,blockAlign,true);view.setUint16(34,bitsPerSample,true);write(36,"data");view.setUint32(40,pcm.length,true);bytes.set(pcm,44);
  const fileName="jarvis-voice-"+crypto.randomUUID()+".wav",storagePath=user.id+"/"+fileName;
  const {error:uploadError}=await supabase.storage.from("jarvis-private").upload(storagePath,bytes,{contentType:"audio/wav",upsert:false});
  if(uploadError)return json({error:"Audio was generated but could not be saved privately."},500);
  const {data:file,error:fileError}=await supabase.from("jarvis_files").insert({user_id:user.id,file_name:fileName,mime_type:"audio/wav",size_bytes:bytes.byteLength,storage_path:storagePath}).select().single();
  if(fileError)return json({error:"Audio was generated but its file record could not be saved."},500);
  const {data:signed,error:signedError}=await supabase.storage.from("jarvis-private").createSignedUrl(storagePath,3600);
  if(signedError)return json({error:"Audio saved but preview link could not be created."},500);
  await supabase.from("jarvis_audit_logs").insert({user_id:user.id,action:"speech.generated",target:file.id,details:{model:"gemini-3.8-flash-tts",voice}});
  return json({audioUrl:signed.signedUrl,fileName,size:bytes.byteLength,voice});
 }catch(error){return json({error:error instanceof Error?error.message:"Unexpected speech error."},500);}
});
