import { createClient } from '@supabase/supabase-js';

const CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  localKey: import.meta.env.VITE_JARVIS_LOCAL_ACCESS_KEY || ''
};
const configured = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey && CONFIG.localKey);
const supabase = configured ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { 'x-jarvis-local-key': CONFIG.localKey } }
}) : null;

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'jarvis-x-local-workspace-v1';
const state = { conversations: [], activeId: null, messages: [], model: 'gemini-2.5-flash', busy: false, files: [] };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversations: state.conversations })); }
  catch { toast('Local storage is full. Remove some large conversations.'); }
}
function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.conversations = Array.isArray(saved.conversations) ? saved.conversations : [];
  } catch { state.conversations = []; }
  renderConversations();
  if (state.conversations.length) openConversation(state.conversations[0].id);
  else { newConversation(); }
}
function renderConversations() {
  $('#history-list').innerHTML = state.conversations.map(item => `
    <button class="history-item ${item.id === state.activeId ? 'active' : ''}" data-id="${escapeHtml(item.id)}">
      <span class="history-icon">▤</span><span class="history-title">${escapeHtml(item.title)}</span><span class="history-more">···</span>
    </button>`).join('') || '<p class="empty-history">Your conversations will appear here.</p>';
  $('#history-list').querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => openConversation(button.dataset.id)));
}
function renderMessages() {
  const area = $('#messages');
  if (!state.messages.length) {
    area.innerHTML = `<div class="welcome">
      <div class="welcome-mark"><span>✳</span></div><p class="welcome-kicker">YOUR PRIVATE AI WORKSPACE</p>
      <h1>Good to see you.<br><em>What shall we do?</em></h1>
      <p class="welcome-sub">Talk naturally. Think together. Build something useful.</p>
      <div class="prompt-grid">
        <button class="prompt-card" data-prompt="Help me plan and build a new software project."><span>◇</span><b>Build a project</b><small>Plan it and work step by step</small></button>
        <button class="prompt-card" data-prompt="Explain this topic clearly and ask me questions if you need context."><span>✧</span><b>Think together</b><small>Ask, clarify and reason</small></button>
        <button class="prompt-card" data-prompt="Help me research a topic and prepare a cited report."><span>⌕</span><b>Research</b><small>Explore and organise information</small></button>
        <button class="prompt-card" data-prompt="Help me understand and improve this code."><span>⌘</span><b>Work with code</b><small>Review, debug and create</small></button>
      </div></div>`;
    area.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => { $('#composer-input').value = button.dataset.prompt; sendMessage(); }));
    return;
  }
  area.innerHTML = state.messages.map(message => `
    <article class="message ${message.role === 'user' ? 'from-user' : 'from-ai'}">
      <div class="message-avatar">${message.role === 'user' ? 'Y' : '✳'}</div>
      <div class="message-body"><div class="message-author">${message.role === 'user' ? 'You' : 'JARVIS X'}</div>
      <div class="message-content">${escapeHtml(message.content).replace(/\n/g,'<br>')}</div>
      ${message.role === 'assistant' ? '<div class="message-tools"><button class="copy-message">Copy</button><button class="speak-message">Read aloud</button></div>' : ''}</div>
    </article>`).join('');
  area.querySelectorAll('.copy-message').forEach((button,index) => button.addEventListener('click', () => {
    const msg = state.messages.filter(m => m.role === 'assistant')[index]; navigator.clipboard?.writeText(msg?.content || ''); toast('Copied');
  }));
  area.querySelectorAll('.speak-message').forEach((button,index) => button.addEventListener('click', () => {
    const msg = state.messages.filter(m => m.role === 'assistant')[index];
    if (!('speechSynthesis' in window)) return toast('Read aloud is not supported here.');
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(msg?.content || '');
    utterance.lang = navigator.language || 'hi-IN'; window.speechSynthesis.speak(utterance);
  }));
  area.scrollTop = area.scrollHeight;
}
function newConversation() {
  const item = { id: crypto.randomUUID(), title: 'New chat', messages: [], updatedAt: new Date().toISOString() };
  state.conversations.unshift(item); state.activeId = item.id; state.messages = [];
  persist(); renderConversations(); renderMessages(); $('#composer-input').focus(); closeSidebar();
}
function openConversation(id) {
  const item = state.conversations.find(c => c.id === id); if (!item) return;
  state.activeId = id; state.messages = Array.isArray(item.messages) ? item.messages : [];
  renderConversations(); renderMessages(); closeSidebar();
}
function currentConversation() { return state.conversations.find(c => c.id === state.activeId); }
async function readAttachments(files) {
  const output = [];
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) throw new Error(file.name + ' is larger than the 10 MB per-file limit.');
    if (/^(text\/|application\/(json|xml))/.test(file.type) || /\.(txt|md|csv|json|xml|log)$/i.test(file.name)) {
      const text = await file.text();
      output.push({ name:file.name, mimeType:'text/plain', text:text.slice(0,120000) });
    } else if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
      const data = await new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('Could not read '+file.name)); reader.readAsDataURL(file); });
      output.push({ name:file.name, mimeType:file.type, dataUrl:data });
    } else {
      output.push({ name:file.name, unsupported:true });
    }
  }
  return output;
}
async function sendMessage() {
  const input=$('#composer-input'); const content=input.value.trim();
  if ((!content && !state.files.length) || state.busy) return;
  if (!state.activeId) newConversation();
  state.busy=true; $('#send-button').disabled=true; input.value=''; resizeComposer();
  const files=state.files; state.files=[]; $('#file-input').value=''; $('#attachment-note').hidden=true;
  let attachments=[];
  try { attachments=await readAttachments(files); }
  catch(error) { state.busy=false; $('#send-button').disabled=false; toast(error.message); return; }
  const attachmentNames=attachments.map(a=>a.name);
  const visibleText=content || ('Please inspect these attached files: '+attachmentNames.join(', '));
  state.messages.push({role:'user',content:visibleText+(attachmentNames.length?'\n\nAttached: '+attachmentNames.join(', '):'')});
  renderMessages(); const item=currentConversation(); item.messages=state.messages; item.updatedAt=new Date().toISOString();
  if (item.title==='New chat') item.title=visibleText.slice(0,48) || 'File analysis';
  persist(); renderConversations();
  const typing=document.createElement('div'); typing.className='typing-indicator'; typing.innerHTML='<span></span><span></span><span></span>'; $('#messages').append(typing);
  try {
    if (!configured) throw new Error('The app is open in private local mode. Add the Supabase URL, publishable key, local access key and Gemini server secret when you are ready to enable AI replies.');
    const { data, error } = await supabase.functions.invoke('jarvis-chat', {
      body:{ model:state.model, messages:state.messages.slice(-30).map(({role,content})=>({role,content})), attachments }
    });
    if (error) throw new Error(error.message || 'The assistant could not respond.');
    if (data?.error) throw new Error(data.error);
    state.messages.push({role:'assistant',content:data?.reply || 'I could not generate a response.'});
  } catch(error) {
    state.messages.push({role:'assistant',content:'I am open and ready. The AI connection needs setup before I can answer: '+error.message});
  } finally {
    typing.remove(); item.messages=state.messages; item.updatedAt=new Date().toISOString(); persist(); renderMessages();
    state.busy=false; $('#send-button').disabled=false; input.focus();
  }
}
function resizeComposer() { const input=$('#composer-input'); input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,180)+'px'; }
function closeSidebar(){ $('#sidebar').classList.remove('open'); $('#sidebar-backdrop').classList.remove('visible'); }
function renderLocalPage(view) {
  const area=$('#messages');
  const pages={
    projects:['Projects','Keep your websites, apps, repositories and ideas organised.','Project records will be stored locally. GitHub repository creation becomes active when you add a GitHub token in the private server configuration.'],
    tools:['Agent studio','Describe the outcome. JARVIS X will plan the work, ask clarifying questions and request approval for important actions.','The execution engine and connected tools are being built in stages. No external action is claimed until it is actually completed.'],
    memory:['Memory','A private place for details you want JARVIS X to remember.','Long-term searchable memory will be connected to the local workspace store.'],
    activity:['Activity & approvals','Review proposed actions before changes are made.','High-impact actions such as repository writes, deployments and deletion must require your approval.'],
    integrations:['Integrations','Connect providers later without rebuilding the app.','Gemini · GitHub · Cloudflare · Supabase · Web search · Voice · Image generation']
  };
  const [title,sub,detail]=pages[view]||pages.chat;
  area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">PRIVATE WORKSPACE</p><h2>${title}</h2><p>${sub}</p></div></div><div class="notice-card"><b>${title}</b><p>${detail}</p></div><div class="section-title">Build status</div><div class="capability-grid"><article class="capability-card"><h3>Conversation</h3><p>Local chat history · voice input · read aloud</p></article><article class="capability-card"><h3>Files</h3><p>Text, CSV, PDF and image analysis integration point</p></article><article class="capability-card"><h3>Developer tools</h3><p>GitHub repository, branch, commit and pull request tools</p></article><article class="capability-card"><h3>Autonomy</h3><p>Planning, clarifying questions, approval and audit trail</p></article></div></div>`;
}
function setupUI() {
  $('#new-chat').addEventListener('click',newConversation);
  $('#send-button').addEventListener('click',sendMessage);
  $('#composer-input').addEventListener('input',resizeComposer);
  $('#composer-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
  $('#model-select').addEventListener('change',e=>state.model=e.target.value);
  $('#menu-button').addEventListener('click',()=>{ $('#sidebar').classList.add('open'); $('#sidebar-backdrop').classList.add('visible');});
  $('#sidebar-backdrop').addEventListener('click',closeSidebar);
  $('#attach-button').addEventListener('click',()=>$('#file-input').click());
  $('#file-input').addEventListener('change',e=>{
    state.files=[...e.target.files]; if(!state.files.length)return;
    $('#attachment-note').textContent=state.files.map(f=>f.name).join(' · '); $('#attachment-note').hidden=false;
  });
  $('#voice-button').addEventListener('click',()=>{
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition)return toast('Voice input is not supported in this browser.');
    const recognition=new SpeechRecognition(); recognition.lang=navigator.language||'hi-IN'; recognition.interimResults=false;
    recognition.onresult=e=>{ $('#composer-input').value += ($('#composer-input').value?' ':'')+e.results[0][0].transcript; resizeComposer(); };
    recognition.onerror=()=>toast('Voice input could not start.'); recognition.start();
  });
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    const view=button.dataset.view; document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b===button));
    $('.breadcrumb b').textContent=({chat:'New conversation',projects:'Projects',tools:'Agent studio',memory:'Memory',activity:'Activity',integrations:'Integrations'})[view]||'Workspace';
    if(view==='chat')renderMessages(); else renderLocalPage(view); closeSidebar();
  }));
  $('.settings-button')?.addEventListener('click',()=>{renderLocalPage('integrations');$('.breadcrumb b').textContent='Integrations';});
  $('#theme-note').textContent='Pearl · Champagne · Ivory';
}
function start() {
  $('#app-shell').hidden=false;
  $('#auth-screen')?.remove();
  setupUI();
  loadLocal();
  if (!configured) toast('Private mode ready · connect AI providers later in local configuration.');
}
start();
