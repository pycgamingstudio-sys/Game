import { createClient } from '@supabase/supabase-js';

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
const state = { user: null, conversations: [], activeId: null, messages: [], model: 'gemini-2.5-flash', busy: false, files: [] };

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
      ${message.role === 'assistant' ? '<div class="message-tools"><button class="copy-message" title="Copy response">Copy</button></div>' : ''}</div>
    </article>`).join('');
  area.querySelectorAll('.copy-message').forEach((button,index) => button.addEventListener('click', () => {
    const msg = state.messages.filter(m => m.role === 'assistant')[index]; navigator.clipboard?.writeText(msg?.content || ''); toast('Copied to clipboard');
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
  if (error) return toast(error.message);
  state.conversations.unshift(data); state.activeId = data.id; state.messages = []; renderConversations(); renderMessages(); $('#composer-input').focus(); closeSidebar();
}
async function openConversation(id) {
  state.activeId = id; renderConversations();
  const { data, error } = await supabase.from('jarvis_messages').select('*').eq('conversation_id',id).order('created_at',{ascending:true});
  if (error) return toast(error.message);
  state.messages = (data || []).map(m => ({role:m.role,content:m.content,id:m.id}));
  renderMessages(); closeSidebar();
}
async function sendMessage() {
  const input = $('#composer-input'); const content = input.value.trim();
  if (!content || state.busy) return;
  if (!state.activeId) await newConversation();
  state.busy = true; $('#send-button').disabled = true; input.value=''; resizeComposer();
  state.messages.push({role:'user',content}); renderMessages();
  const { error: saveError } = await supabase.from('jarvis_messages').insert({conversation_id:state.activeId,user_id:state.user.id,role:'user',content});
  if (saveError) toast('Message could not be saved: '+saveError.message);
  const typing = document.createElement('div'); typing.className='typing-indicator'; typing.innerHTML='<span></span><span></span><span></span>'; $('#messages').append(typing);
  try {
    if (!CONFIG.chatFunction) throw new Error('AI endpoint is not configured yet. Add the Gemini API key to the secure server function to enable replies.');
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(CONFIG.chatFunction, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
      body:JSON.stringify({conversationId:state.activeId,model:state.model,messages:state.messages.slice(-30).map(({role,content})=>({role,content}))})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The assistant could not respond.');
    const answer = result.reply || 'I could not generate a response.';
    state.messages.push({role:'assistant',content:answer}); typing.remove(); renderMessages();
    await supabase.from('jarvis_messages').insert({conversation_id:state.activeId,user_id:state.user.id,role:'assistant',content:answer,model:state.model});
    const current = state.conversations.find(c=>c.id===state.activeId);
    if (current?.title === 'New chat') {
      current.title = content.slice(0,48); await supabase.from('jarvis_conversations').update({title:current.title,updated_at:new Date().toISOString()}).eq('id',state.activeId);
      renderConversations();
    } else await supabase.from('jarvis_conversations').update({updated_at:new Date().toISOString()}).eq('id',state.activeId);
  } catch(error) {
    typing.remove(); state.messages.push({role:'assistant',content:`I’m ready, but the AI connection needs setup. ${error.message}`}); renderMessages();
  } finally { state.busy=false; $('#send-button').disabled=false; input.focus(); }
}
function resizeComposer() {
  const input=$('#composer-input'); input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,180)+'px';
}
function closeSidebar(){ $('#sidebar').classList.remove('open'); $('#sidebar-backdrop').classList.remove('visible'); }
function setupUI() {
  $('#new-chat').addEventListener('click',newConversation);
  $('#send-button').addEventListener('click',sendMessage);
  $('#composer-input').addEventListener('input',resizeComposer);
  $('#composer-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
  $('#model-select').addEventListener('change',e=>state.model=e.target.value);
  $('#signout-button').addEventListener('click',()=>supabase.auth.signOut());
  $('#menu-button').addEventListener('click',()=>{ $('#sidebar').classList.add('open'); $('#sidebar-backdrop').classList.add('visible');});
  $('#sidebar-backdrop').addEventListener('click',closeSidebar);
  $('#attach-button').addEventListener('click',()=>$('#file-input').click());
  $('#file-input').addEventListener('change',e=>{
    const files=[...e.target.files]; if(!files.length)return;
    state.files=files; $('#attachment-note').textContent=files.map(f=>f.name).join(' · '); $('#attachment-note').hidden=false;
    toast('File selected. Secure upload and document analysis will be enabled in the next integration step.');
  });
  $('#voice-button').addEventListener('click',()=>{
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition)return toast('Voice input is not supported in this browser.');
    const recognition=new SpeechRecognition(); recognition.lang='en-IN'; recognition.interimResults=false;
    recognition.onresult=e=>{ $('#composer-input').value += ( $('#composer-input').value ? ' ' : '')+e.results[0][0].transcript; resizeComposer(); };
    recognition.onerror=()=>toast('Voice input could not start.'); recognition.start();
  });
  $('#auth-google').addEventListener('click',async()=>{
    if(!configured)return toast('Supabase project configuration is missing.');
    const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
    if(error)toast(error.message);
  });
  $('#theme-note').textContent='Pearl · Champagne · Ivory';
}
async function start() {
  setupUI();
  if(!configured){$('#auth-screen').hidden=false;$('#setup-warning').hidden=false;return;}
  const {data:{session}}=await supabase.auth.getSession(); state.user=session?.user||null; setAuthView();
  supabase.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;setAuthView();if(state.user)loadConversations();});
  if(state.user) await loadConversations();
}
start();
