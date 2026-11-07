import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import {
  Activity, Archive, ArrowDown, ArrowUp, AudioLines, Bot, Check, ChevronDown, CircleHelp,
  Command, FileText, FolderKanban, Globe2, ImagePlus, Menu, Mic, MoreHorizontal,
  Paperclip, Plus, Search, Settings2, ShieldCheck, Sparkles, SquarePen, Sun, WandSparkles,
  X, PanelLeftClose, LogIn, LogOut, Brain, Code2, Rocket, SlidersHorizontal
} from 'lucide-react';

const MODELS = [
  { id: 'gemini-2.5-flash', label: 'JARVIS Fast', detail: 'Quick everyday work' },
  { id: 'gemini-2.5-pro', label: 'JARVIS Pro', detail: 'Deeper reasoning' }
];
const starterPrompts = [
  { icon: <Code2 size={18}/>, title: 'Build something', text: 'Help me plan and build a complete web app.' },
  { icon: <Globe2 size={18}/>, title: 'Research a topic', text: 'Research a topic thoroughly and cite reliable sources.' },
  { icon: <FileText size={18}/>, title: 'Work with files', text: 'Help me understand and summarize a document.' },
  { icon: <Rocket size={18}/>, title: 'Create an action plan', text: 'Turn my goal into a practical step-by-step plan.' }
];

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState(MODELS[0].id);
  const [modelMenu, setModelMenu] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [view, setView] = useState('chat');
  const [settingsTab, setSettingsTab] = useState('providers');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [files, setFiles] = useState([]);
  const [capabilities, setCapabilities] = useState([]);
  const [listening, setListening] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const currentModel = MODELS.find(m => m.id === model) || MODELS[0];

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  useEffect(() => {
    if (!session || !supabase) { setChats([]); return; }
    loadChats();
    loadCapabilities();
  }, [session]);

  async function loadChats() {
    const { data, error } = await supabase.from('jarvis_conversations').select('*').order('updated_at', { ascending: false }).limit(80);
    if (!error && data) setChats(data);
  }
  async function loadCapabilities() {
    const { data, error } = await supabase.functions.invoke('jarvis-agent', { body: { task: 'capabilities' } });
    if (!error && data?.providers) setCapabilities(data.providers);
  }
  async function signIn() {
    if (!supabase) { setNotice('Add Supabase URL and publishable key to enable secure sign-in.'); return; }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) setNotice(error.message);
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setMessages([]); setActiveId(null); }
  function newChat() { setActiveId(null); setMessages([]); setDraft(''); setView('chat'); inputRef.current?.focus(); }

  async function openChat(chat) {
    setActiveId(chat.id); setModel(chat.model || MODELS[0].id); setView('chat');
    if (!supabase || !session) return;
    const { data } = await supabase.from('jarvis_messages').select('*').eq('conversation_id', chat.id).order('created_at');
    setMessages((data || []).map(m => ({ id:m.id, role:m.role, content:m.content, attachments:m.attachments || [] })));
  }

  async function persistConversation(firstText) {
    if (!supabase || !session) return null;
    const { data, error } = await supabase.from('jarvis_conversations').insert({ user_id:session.user.id, title:firstText.slice(0,58) || 'New chat', model }).select().single();
    if (error) { setNotice(error.message); return null; }
    setActiveId(data.id); setChats(prev => [data, ...prev]); return data.id;
  }
  async function persistMessage(conversationId, message) {
    if (!supabase || !session || !conversationId) return;
    const { error } = await supabase.from('jarvis_messages').insert({ conversation_id:conversationId, user_id:session.user.id, role:message.role, content:message.content, attachments:message.attachments || [], model });
    if (error) setNotice(error.message);
    await supabase.from('jarvis_conversations').update({ updated_at:new Date().toISOString(), model }).eq('id',conversationId);
  }

  async function sendMessage(text = draft) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setDraft(''); setFiles([]); setBusy(true); setNotice('');
    const userMsg = { id:crypto.randomUUID(), role:'user', content:prompt, attachments:files.map(f => ({ name:f.name, type:f.type, size:f.size })) };
    const next = [...messages, userMsg]; setMessages(next);
    let conversationId = activeId;
    if (!conversationId && session) conversationId = await persistConversation(prompt);
    if (conversationId) await persistMessage(conversationId, userMsg);
    if (!isSupabaseConfigured || !session) {
      setMessages(prev => [...prev, { id:crypto.randomUUID(), role:'assistant', content:'Your workspace is ready in preview mode. Connect Supabase and sign in to enable private chat history, then add the Gemini API key to activate live AI responses.' }]);
      setBusy(false); return;
    }
    const { data, error } = await supabase.functions.invoke('jarvis-chat', { body: { model, messages: next.map(m => ({ role:m.role, content:m.content })) } });
    const answer = error ? (error.message || 'The AI service is not available yet.') : (data?.reply || data?.error || 'No response received.');
    const assistantMsg = { id:crypto.randomUUID(), role:'assistant', content:answer };
    setMessages(prev => [...prev, assistantMsg]);
    if (conversationId) await persistMessage(conversationId, assistantMsg);
    setBusy(false); loadChats();
  }

  function attachFiles(event) {
    const selected = Array.from(event.target.files || []);
    setFiles(prev => [...prev, ...selected].slice(0,5));
    event.target.value = '';
  }
  function voiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setNotice('Voice typing is not supported in this browser. Try Chrome.'); return; }
    const recognition = new SpeechRecognition(); recognition.lang = 'hi-IN'; recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = e => setDraft(Array.from(e.results).map(r => r[0].transcript).join(' '));
    recognition.start();
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'hi-IN'; window.speechSynthesis.speak(utterance);
  }
  const filteredChats = useMemo(() => chats.filter(c => (c.title || '').toLowerCase().includes(searchTerm.toLowerCase())), [chats, searchTerm]);

  return <div className="app-shell">
    {sidebar && <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={19}/></div><div><b>JARVIS <span>X</span></b><small>PERSONAL INTELLIGENCE</small></div><button className="icon-btn close-sidebar" onClick={() => setSidebar(false)} aria-label="Close sidebar"><PanelLeftClose size={18}/></button></div>
      <button className="new-chat" onClick={newChat}><SquarePen size={17}/> New conversation <span>⌘ K</span></button>
      <div className="side-search"><Search size={16}/><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search conversations"/></div>
      <div className="side-label">WORKSPACE</div>
      <button className={view==='projects'?'nav-item active':'nav-item'} onClick={()=>setView('projects')}><FolderKanban size={17}/> Projects</button>
      <button className={view==='agent'?'nav-item active':'nav-item'} onClick={()=>setView('agent')}><WandSparkles size={17}/> Agent workspace <span className="nav-new">NEW</span></button>
      <button className={view==='activity'?'nav-item active':'nav-item'} onClick={()=>setView('activity')}><Activity size={17}/> Activity & tasks</button>
      <div className="history-head"><span>RECENT</span><MoreHorizontal size={16}/></div>
      <div className="history-list">{filteredChats.map(chat=><button key={chat.id} onClick={()=>openChat(chat)} className={activeId===chat.id?'history-item selected':'history-item'}><span className="history-dot"/><span>{chat.title || 'New chat'}</span></button>)}
        {filteredChats.length===0 && <p className="empty-history">{session?'Your conversations will appear here.':'Sign in to sync your history.'}</p>}</div>
      <div className="sidebar-bottom">
        <div className="plan-card"><div className="plan-icon"><Brain size={17}/></div><div><b>Your AI workspace</b><small>Private • Secure • Yours</small></div></div>
        <button className="profile-row" onClick={()=>setView('settings')}><div className="avatar">{session?.user?.email?.[0]?.toUpperCase() || 'J'}</div><div className="profile-info"><b>{session?.user?.email || 'Guest workspace'}</b><small>{session?'Connected account':'Preview mode'}</small></div><Settings2 size={17}/></button>
      </div>
    </aside>}
    <main className="main-panel">
      <header className="topbar">
        <div className="top-left">{!sidebar && <button className="icon-btn" onClick={()=>setSidebar(true)}><Menu size={19}/></button>}<div className="model-wrap"><button className="model-select" onClick={()=>setModelMenu(!modelMenu)}><span className="model-orb"><Sparkles size={14}/></span>{currentModel.label}<ChevronDown size={15}/></button>{modelMenu && <div className="model-menu">{MODELS.map(m=><button key={m.id} onClick={()=>{setModel(m.id);setModelMenu(false)}}><b>{m.label}</b><small>{m.detail}</small>{model===m.id&&<Check size={16}/>}</button>)}</div>}</div></div>
        <div className="top-actions"><span className="secure-indicator"><ShieldCheck size={14}/> Private workspace</span><button className="icon-btn" title="Settings" onClick={()=>setView('settings')}><Settings2 size={18}/></button>{session?<button className="sign-btn" onClick={signOut}><LogOut size={15}/> Sign out</button>:<button className="sign-btn" onClick={signIn}><LogIn size={15}/> Sign in</button>}</div>
      </header>

      {view==='chat' && <section className="chat-view">
        {messages.length===0 ? <div className="welcome">
          <div className="welcome-emblem"><div className="emblem-inner"><Sparkles size={27}/></div><i/><i/><i/></div>
          <div className="eyebrow">YOUR PERSONAL INTELLIGENCE</div>
          <h1>Good to see you.<br/><span>What shall we create?</span></h1>
          <p className="welcome-sub">A thoughtful space for ideas, research, creation and getting things done.</p>
          <div className="prompt-grid">{starterPrompts.map(p=><button className="prompt-card" key={p.title} onClick={()=>sendMessage(p.text)}><span className="prompt-icon">{p.icon}</span><b>{p.title}</b><small>{p.text}</small></button>)}</div>
        </div> : <div className="message-list">{messages.map(m=><article className={'message '+m.role} key={m.id}><div className="message-avatar">{m.role==='assistant'?<Sparkles size={16}/>:<span>{session?.user?.email?.[0]?.toUpperCase()||'Y'}</span>}</div><div className="message-body"><div className="message-author">{m.role==='assistant'?'JARVIS X':'You'}</div><div className="message-content">{m.content}</div>{m.attachments?.length>0&&<div className="attached-pills">{m.attachments.map(a=><span key={a.name}><FileText size={13}/>{a.name}</span>)}</div>}{m.role==='assistant'&&<button className="speak-btn" onClick={()=>speak(m.content)}><AudioLines size={14}/> Read aloud</button>}</div></article>)}{busy&&<div className="thinking"><span/><span/><span/> <small>JARVIS is thinking</small></div>}<div ref={bottomRef}/></div>}
        {notice&&<div className="notice"><CircleHelp size={15}/>{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
        <div className="composer-wrap"><div className="composer">
          {files.length>0&&<div className="file-strip">{files.map((f,i)=><span key={i}><FileText size={13}/>{f.name}<button onClick={()=>setFiles(prev=>prev.filter((_,n)=>n!==i))}><X size={12}/></button></span>)}</div>}
          <textarea ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder="Message JARVIS X..." rows={1}/>
          <div className="composer-tools"><div className="tool-left"><button className="tool-btn" onClick={()=>fileRef.current?.click()}><Paperclip size={17}/><span>Attach</span></button><input ref={fileRef} type="file" multiple hidden onChange={attachFiles} accept="image/*,.pdf,.txt,.md,.doc,.docx,.csv,.xlsx"/></div><div className="tool-right"><button className={listening?'tool-btn listening':'tool-btn'} onClick={voiceInput} title="Voice typing"><Mic size={17}/></button><button className="send-btn" onClick={()=>sendMessage()} disabled={!draft.trim()||busy}><ArrowUp size={18}/></button></div></div>
        </div><div className="composer-foot">JARVIS X can make mistakes. Verify important information. <span>{currentModel.label}</span></div></div>
      </section>}

      {view==='settings' && <section className="content-page"><div className="page-kicker">PREFERENCES</div><h1>Settings</h1><p className="page-lead">Configure your workspace and connect services when you are ready.</p><div className="settings-layout"><nav className="settings-nav">{[['providers','Connected services'],['account','Account & privacy'],['appearance','Appearance']].map(([id,label])=><button className={settingsTab===id?'active':''} onClick={()=>setSettingsTab(id)} key={id}>{label}</button>)}</nav><div className="settings-content">{settingsTab==='providers'?<><h2>Service connections</h2><p>Keys are stored server-side in Supabase Edge Function secrets. Never paste private keys into chat or browser settings.</p>{(capabilities.length?capabilities:[{id:'gemini',configured:false,requiredSecrets:['GEMINI_API_KEY']},{id:'github',configured:false,requiredSecrets:['GITHUB_TOKEN']},{id:'cloudflare',configured:false,requiredSecrets:['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']},{id:'search',configured:false,requiredSecrets:['SEARCH_API_KEY']},{id:'image',configured:false,requiredSecrets:['IMAGE_PROVIDER_API_KEY']},{id:'speech',configured:false,requiredSecrets:['TTS_API_KEY']}]).map(c=><div className="provider-row" key={c.id}><div className="provider-symbol">{c.id==='github'?<Code2/>:c.id==='cloudflare'?<Globe2/>:c.id==='gemini'?<Sparkles/>:<SlidersHorizontal/>}</div><div className="provider-copy"><b>{c.id[0].toUpperCase()+c.id.slice(1)}</b><small>{c.requiredSecrets.join(' • ')}</small></div><span className={c.configured?'status connected':'status'}>{c.configured?'Connected':'Needs setup'}</span></div>)}</>:settingsTab==='account'?<><h2>Account & privacy</h2><p>Authentication uses Supabase Auth. Conversation records are protected by row-level security. {session?'Your account is connected.':'Sign in with Google to sync your private workspace.'}</p><button className="primary-action" onClick={session?signOut:signIn}>{session?'Sign out':'Continue with Google'}</button></>:<><h2>Appearance</h2><p>JARVIS X uses a warm light palette with ivory, pearl, champagne and restrained bronze accents. A dark theme is intentionally not enabled.</p><div className="swatches"><i/><i/><i/><i/></div></>}</div></div></section>}

      {view==='projects' && <section className="content-page"><div className="page-kicker">YOUR WORKSPACE</div><h1>Projects</h1><p className="page-lead">Keep ideas, code and ongoing work organized in one place.</p><div className="empty-state-card"><div className="empty-icon"><FolderKanban size={25}/></div><h2>Your next big idea starts here.</h2><p>Project creation and connected GitHub workflows will appear here once the developer integrations are configured.</p><button className="primary-action" onClick={()=>setView('agent')}><WandSparkles size={16}/> Open agent workspace</button></div></section>}

      {view==='agent' && <section className="content-page"><div className="page-kicker">AUTONOMOUS WORKSPACE</div><h1>Agent workspace</h1><p className="page-lead">Describe an outcome. JARVIS prepares a plan, checks integrations and asks before external or destructive actions.</p><div className="agent-card"><div className="agent-head"><div className="agent-symbol"><WandSparkles size={22}/></div><div><b>JARVIS Agent</b><small>Planning • Tool access • Human approval</small></div><span className="status">Awaiting setup</span></div><textarea id="agent-goal" placeholder="Example: Create a portfolio website, put it in a new GitHub repository and deploy it to Cloudflare Pages."/><button className="primary-action" onClick={async()=>{const goal=document.getElementById('agent-goal')?.value?.trim();if(!goal)return;if(!supabase||!session){setNotice('Sign in to create an agent task.');return;}const {data,error}=await supabase.functions.invoke('jarvis-agent',{body:{task:'run_agent',payload:{goal}}});setNotice(error?.message||data?.message||data?.error||'Agent request submitted.');}}><Sparkles size={16}/> Prepare execution plan</button><p className="fine-print"><ShieldCheck size={14}/> Creating a plan does not execute GitHub writes, deployments, emails or destructive changes. Those actions require explicit approval.</p></div></section>}

      {view==='activity' && <section className="content-page"><div className="page-kicker">OVERSIGHT</div><h1>Activity & tasks</h1><p className="page-lead">Review agent activity, queued tasks and approval requests here.</p><div className="empty-state-card"><div className="empty-icon"><Activity size={25}/></div><h2>No activity yet</h2><p>When you start agent tasks, their progress and approval requests will be listed here.</p></div></section>}
      <footer className="app-footer"><span>JARVIS X</span><span>Made for clarity, built for capability.</span><span><Sun size={13}/> Light edition</span></footer>
    </main>
  </div>;
}
export default App;
