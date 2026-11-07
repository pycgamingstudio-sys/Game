import { createClient } from '@supabase/supabase-js';
import { initializeWorkspace } from './lib/workspace.js';

const CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  chatFunction: import.meta.env.VITE_CHAT_FUNCTION_URL || ''
};
const configured = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);
const supabase = configured ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const $ = (selector) => document.querySelector(selector);
const state = { user: null, conversations: [], activeId: null, messages: [], model: 'gemini-3.8-flash', busy: false, files: [] };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function initials(user) {
  const name = user?.user_metadata?.full_name || user?.email || 'J';
  return name.split(/[ @._-]/).filter(Boolean).slice(0,2).map(x => x[0].toUpperCase()).join('');
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}
function setAuthView() {
  $('#auth-screen').hidden = Boolean(state.user);
  $('#app-shell').hidden = !state.user;
  if (state.user) {
    $('#profile-avatar').textContent = initials(state.user);
    $('#profile-name').textContent = state.user.user_metadata?.full_name || state.user.email;
    $('#profile-email').textContent = state.user.email || '';
  }
}
function renderConversations() {
  $('#history-list').innerHTML = state.conversations.map(item => `
    <button class="history-item ${item.id === state.activeId ? 'active' : ''}" data-id="${item.id}">
      <span class="history-icon">▤</span><span class="history-title">${escapeHtml(item.title)}</span>
      <span class="history-more" aria-hidden="true">···</span>
    </button>`).join('') || '<p class="empty-history">Your conversations will appear here.</p>';
  $('#history-list').querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => openConversation(button.dataset.id)));
}
function renderMessages() {
  const area = $('#messages');
  if (!state.messages.length) {
    area.innerHTML = `<div class="welcome">
      <div class="welcome-mark"><span>✳</span></div>
      <p class="welcome-kicker">YOUR PERSONAL INTELLIGENCE</p>
      <h1>What can I help<br><em>you with today?</em></h1>
      <p class="welcome-sub">Ideas, answers, research and creation — all in one place.</p>
      <div class="prompt-grid">
        <button class="prompt-card" data-prompt="Help me plan my week with clear priorities."><span>✧</span><b>Plan my week</b><small>Turn ideas into a clear plan</small></button>
        <button class="prompt-card" data-prompt="Explain a complex topic in simple language."><span>⌘</span><b>Learn something</b><small>Make the complicated simple</small></button>
        <button class="prompt-card" data-prompt="Help me research a new business idea."><span>◈</span><b>Explore an idea</b><small>Research and think it through</small></button>
        <button class="prompt-card" data-prompt="Write a polished professional email for me."><span>✎</span><b>Write something</b><small>Start with a first draft</small></button>
      </div>
    </div>`;
    area.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => { $('#composer-input').value = button.dataset.prompt; sendMessage(); }));
    return;
  }
  area.innerHTML = state.messages.map(message => `
    <article class="message ${message.role === 'user' ? 'from-user' : 'from-ai'}">
      <div class="message-avatar">${message.role === 'user' ? escapeHtml(initials(state.user)) : '✳'}</div>
      <div class="message-body"><div class="message-author">${message.role === 'user' ? 'You' : 'Jarvis X'}</div>
      <div class="message-content">${escapeHtml(message.content).replace(/\n/g,'<br>')}</div>
      ${message.attachments?.length ? `<div class="message-attachments">${message.attachments.map(file=>`<span>▧ ${escapeHtml(file.fileName||file.name||'Attachment')}</span>`).join('')}</div>` : ''}
      ${message.role === 'assistant' ? '<div class="message-tools"><button class="copy-message" title="Copy response">Copy</button><button class="speak-message" title="Read response aloud">Read aloud</button></div>' : ''}</div>
    </article>`).join('');
  area.querySelectorAll('.copy-message').forEach((button,index) => button.addEventListener('click', () => {
    const msg = state.messages.filter(m => m.role === 'assistant')[index]; navigator.clipboard?.writeText(msg?.content || ''); toast('Copied to clipboard');
  }));
  area.querySelectorAll('.speak-message').forEach((button,index) => button.addEventListener('click', () => {
    const msg = state.messages.filter(m => m.role === 'assistant')[index];
    if (!('speechSynthesis' in window)) return toast('Read aloud is not supported in this browser.');
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(msg?.content || '');
    utterance.lang = navigator.language || 'hi-IN';
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }));
  area.scrollTop = area.scrollHeight;
}
async function loadConversations() {
  const { data, error } = await supabase.from('jarvis_conversations').select('*').eq('archived', false).order('updated_at', {ascending:false}).limit(80);
  if (error) return toast(error.message);
  state.conversations = data || []; renderConversations();
  if (!state.activeId && state.conversations[0]) await openConversation(state.conversations[0].id);
  else if (!state.activeId) renderMessages();
}
async function newConversation() {
  const { data, error } = await supabase.from('jarvis_conversations').insert({user_id:state.user.id,title:'New chat',model:state.model}).select().single();
  if (error) { toast(error.message); return false; }
  state.conversations.unshift(data); state.activeId = data.id; state.messages = []; renderConversations(); renderMessages(); $('#composer-input').focus(); closeSidebar(); return true;
}
async function openConversation(id) {
  state.activeId = id; renderConversations();
  const { data, error } = await supabase.from('jarvis_messages').select('*').eq('conversation_id',id).order('created_at',{ascending:true});
  if (error) return toast(error.message);
  state.messages = (data || []).map(m => ({role:m.role,content:m.content,id:m.id,attachments:m.attachments||[]}));
  renderMessages(); closeSidebar();
}
async function uploadAttachments() {
  const uploaded=[];let totalBytes=0;
  for (const file of state.files) {
    totalBytes+=file.size;
    if (file.size > 15*1024*1024 || totalBytes > 15*1024*1024) throw new Error('Keep each message’s attachments under 15 MB total.');
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const storagePath=`${state.user.id}/${crypto.randomUUID()}-${safeName}`;
    const {error:uploadError}=await supabase.storage.from('jarvis-private').upload(storagePath,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(uploadError)throw uploadError;
    const {data,error}=await supabase.from('jarvis_files').insert({user_id:state.user.id,conversation_id:state.activeId,file_name:file.name,mime_type:file.type,size_bytes:file.size,storage_path:storagePath}).select().single();
    if(error)throw error;
    uploaded.push({id:data.id,fileName:file.name,mimeType:file.type,storagePath,size:file.size});
  }
  state.files=[];$('#file-input').value='';$('#attachment-note').hidden=true;$('#attachment-note').textContent='';
  return uploaded;
}
async function sendMessage() {
  const input=$('#composer-input'),typed=input.value.trim();
  if((!typed&&!state.files.length)||state.busy)return;
  if(!state.activeId&&!await newConversation())return;
  state.busy=true;$('#send-button').disabled=true;input.value='';resizeComposer();
  let attachments=[];
  try{attachments=await uploadAttachments();}
  catch(error){toast('File upload failed: '+error.message);state.busy=false;$('#send-button').disabled=false;return;}
  const content=typed||'Please analyse the attached file(s).';
  state.messages.push({role:'user',content,attachments});renderMessages();
  const {error:saveError}=await supabase.from('jarvis_messages').insert({conversation_id:state.activeId,user_id:state.user.id,role:'user',content,attachments});
  if(saveError)toast('Message could not be saved: '+saveError.message);
  const typing=document.createElement('div');typing.className='typing-indicator';typing.innerHTML='<span></span><span></span><span></span>';$('#messages').append(typing);
  try{
    const {data:result,error:invokeError}=await supabase.functions.invoke('jarvis-chat',{body:{conversationId:state.activeId,model:state.model,messages:state.messages.slice(-30).map(({role,content,attachments})=>({role,content,attachments:attachments||[]}))}});
    if(invokeError)throw new Error(invokeError.message||'The assistant could not respond.');
    if(result?.error)throw new Error(result.error);
    const answer=result?.reply||'I could not generate a response.';
    state.messages.push({role:'assistant',content:answer});typing.remove();renderMessages();
    await supabase.from('jarvis_messages').insert({conversation_id:state.activeId,user_id:state.user.id,role:'assistant',content:answer,model:state.model});
    const current=state.conversations.find(c=>c.id===state.activeId);
    if(current?.title==='New chat'){current.title=content.slice(0,48);await supabase.from('jarvis_conversations').update({title:current.title,updated_at:new Date().toISOString()}).eq('id',state.activeId);renderConversations();}
    else await supabase.from('jarvis_conversations').update({updated_at:new Date().toISOString()}).eq('id',state.activeId);
  }catch(error){typing.remove();state.messages.push({role:'assistant',content:`I’m ready, but the AI connection needs setup. ${error.message}`});renderMessages();}
  finally{state.busy=false;$('#send-button').disabled=false;input.focus();}
}
function resizeComposer() {
  const input=$('#composer-input'); input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,180)+'px';
}
function closeSidebar(){ $('#sidebar').classList.remove('open'); $('#sidebar-backdrop').classList.remove('visible'); }
function setupUI() {
  $('#new-chat').addEventListener('click',newConversation);
  window.addEventListener('jarvis:open-conversation',event=>openConversation(event.detail));
  $('#send-button').addEventListener('click',sendMessage);
  $('#composer-input').addEventListener('input',resizeComposer);
  $('#composer-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
  $('#model-select').addEventListener('change',async e=>{state.model=e.target.value;if(state.user)await supabase.from('jarvis_preferences').upsert({user_id:state.user.id,selected_model:state.model,updated_at:new Date().toISOString()});});
  $('#signout-button').addEventListener('click',()=>supabase.auth.signOut());
  $('#menu-button').addEventListener('click',()=>{ $('#sidebar').classList.add('open'); $('#sidebar-backdrop').classList.add('visible');});
  $('#sidebar-backdrop').addEventListener('click',closeSidebar);
  $('#attach-button').addEventListener('click',()=>$('#file-input').click());
  $('#file-input').addEventListener('change',e=>{
    const files=[...e.target.files]; if(!files.length)return;
    state.files=files; $('#attachment-note').textContent=files.map(f=>f.name).join(' · '); $('#attachment-note').hidden=false;
    toast('File selected. It will upload privately when you send the message.');
  });
  $('#voice-button').addEventListener('click',()=>{
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition)return toast('Voice input is not supported in this browser.');
    const recognition=new SpeechRecognition(); recognition.lang=navigator.language || 'hi-IN'; recognition.interimResults=false;
    recognition.onresult=e=>{ $('#composer-input').value += ( $('#composer-input').value ? ' ' : '')+e.results[0][0].transcript; resizeComposer(); };
    recognition.onerror=()=>toast('Voice input could not start.'); recognition.start();
  });
  $('#auth-google').addEventListener('click',async()=>{
    if(!configured)return toast('Supabase project configuration is missing.');
    const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
    if(error)toast(error.message);
  });
  $('#theme-note').textContent='Pearl · Champagne · Ivory';
  initializeWorkspace({supabase,getUser:()=>state.user,toast,onChat:renderMessages});
}
async function loadPreferences(){
  if(!state.user)return;
  const {data}=await supabase.from('jarvis_preferences').select('selected_model').eq('user_id',state.user.id).maybeSingle();
  if(data?.selected_model){state.model=data.selected_model;$('#model-select').value=state.model;}
}
async function start() {
  setupUI();
  if(!configured){$('#auth-screen').hidden=false;$('#setup-warning').hidden=false;return;}
  const {data:{session}}=await supabase.auth.getSession(); state.user=session?.user||null; setAuthView();
  supabase.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;setAuthView();if(state.user){loadPreferences();loadConversations();}});
  if(state.user) { await loadPreferences(); await loadConversations(); }
}
start();
