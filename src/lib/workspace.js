import { INTEGRATIONS, CAPABILITY_GROUPS } from './integrations.js';
import { invokeAgent, loadWorkspace } from './agent-client.js';

const $ = (s) => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initializeWorkspace({supabase,getUser,toast,onChat}) {
  const area=$('#messages');
  let lastPlan=null;
  const labels={chat:'Chats',projects:'Projects',tools:'Agent studio',research:'Research',images:'Image studio',memory:'Memory',activity:'Activity',integrations:'Integrations',settings:'Settings'};
  async function refresh(){return await loadWorkspace(supabase);}
  function activate(view){
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
    $('.breadcrumb b').textContent=labels[view]||'Workspace';
    $('#sidebar').classList.remove('open');$('#sidebar-backdrop').classList.remove('visible');
    if(view==='chat'){onChat?.();return;}
    if(view==='integrations')return renderIntegrations();
    if(view==='research')return renderResearch();
    if(view==='images')return renderImageStudio();
    if(view==='settings')return renderSettings();
    render(view);
  }
  async function render(view){
    let w;try{w=await refresh();}catch(e){toast(e.message);return;}
    if(view==='projects'){
      area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">YOUR WORKSPACE</p><h2>Projects</h2><p>Organise websites, apps, code and ideas.</p></div><button class="gold-button" id="create-project">＋ New project</button></div><div class="workspace-grid">${w.projects.map(p=>`<article class="workspace-card"><span class="card-symbol">◇</span><h3>${esc(p.name)}</h3><p>${esc(p.description||'No description yet')}</p><small>${esc(p.project_type)} · ${esc(p.status)}</small>${p.repository_url?`<a href="${esc(p.repository_url)}" target="_blank" rel="noreferrer">Repository ↗</a>`:''}${p.deployment_url?`<a href="${esc(p.deployment_url)}" target="_blank" rel="noreferrer">Live website ↗</a>`:''}</article>`).join('')||'<div class="empty-card">Your projects will appear here. Start by creating one.</div>'}</div></div>`;
      $('#create-project').onclick=async()=>{const name=prompt('Project name?');if(!name?.trim())return;const description=prompt('What should it do?')||'';try{await invokeAgent(supabase,'create_project',{name,description});toast('Project created');render(view);}catch(e){toast(e.message);}};
    }else if(view==='tools'){
      area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">AUTONOMOUS WORKSPACE</p><h2>Agent studio</h2><p>Describe the outcome. JARVIS X prepares a plan and checks connected services.</p></div></div><div class="agent-launch"><div class="agent-orb">✳</div><div class="agent-input"><textarea id="agent-goal" rows="3" placeholder="Build a business website, create a GitHub repository and deploy it to Cloudflare Pages..."></textarea><button class="gold-button" id="run-agent">Create execution plan ↗</button></div></div>${lastPlan?`<div class="plan-card"><b>${esc(lastPlan.summary||'Execution plan')}</b><ol>${(lastPlan.steps||[]).map(step=>`<li><strong>${esc(step.title)}</strong><small>${esc(step.description||'')}${step.requiresApproval?' · Approval required':''}</small></li>`).join('')}</ol></div>`:''}<div class="section-title">Recent agent runs</div><div class="workspace-list">${w.runs.map(run=>`<article class="list-card"><div><b>${esc(run.goal)}</b><small>${esc(run.status)} · ${new Date(run.created_at).toLocaleString()}</small></div><span class="status-pill">${esc(run.status)}</span></article>`).join('')||'<div class="empty-card">No agent runs yet.</div>'}</div><div class="section-title">Recent tasks</div><div class="workspace-list">${w.tasks.map(t=>`<article class="list-card"><div><b>${esc(t.title)}</b><small>${esc(t.description||'')}</small></div><span class="status-pill">${esc(t.status)}</span></article>`).join('')||'<div class="empty-card">No agent tasks yet.</div>'}</div><div class="section-title">Capability roadmap</div><div class="capability-grid">${CAPABILITY_GROUPS.map(g=>`<article class="capability-card"><h3>${esc(g.title)}</h3>${g.items.map(i=>`<p>◇ ${esc(i)}</p>`).join('')}</article>`).join('')}</div></div>`;
      $('#run-agent').onclick=async()=>{const goal=$('#agent-goal').value.trim();if(!goal)return toast('Describe the task first.');try{const result=await invokeAgent(supabase,'run_agent',{goal});lastPlan=result;toast(result.message||'Plan created');render(view);}catch(e){toast(e.message);}};
    }else if(view==='memory'){
      area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">PERSONAL CONTEXT</p><h2>Memory</h2><p>Information available across conversations.</p></div><button class="gold-button" id="add-memory">＋ Add memory</button></div><div class="workspace-list">${w.memories.map(m=>`<article class="list-card"><div><b>${esc(m.content)}</b><small>${esc(m.category)} · ${new Date(m.created_at).toLocaleDateString()}</small></div><button class="text-button" data-delete-memory="${m.id}">Delete</button></article>`).join('')||'<div class="empty-card">No saved memories yet.</div>'}</div></div>`;
      $('#add-memory').onclick=async()=>{const content=prompt('What should JARVIS X remember?');if(!content?.trim())return;const {error}=await supabase.from('jarvis_memories').insert({user_id:getUser().id,content:content.trim(),category:'general'});if(error)return toast(error.message);toast('Memory saved');render(view);};
      area.querySelectorAll('[data-delete-memory]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.from('jarvis_memories').delete().eq('id',b.dataset.deleteMemory);if(error)return toast(error.message);render(view);});
    }else if(view==='activity'){
      area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">CONTROL CENTRE</p><h2>Activity & approvals</h2><p>Review actions before the agent performs them.</p></div></div><div class="section-title">Pending approvals</div><div class="workspace-list">${w.approvals.map(a=>`<article class="list-card"><div><b>${esc(a.action)}</b><small>${esc(a.status)} · ${new Date(a.created_at).toLocaleString()} · ${esc(Array.isArray(a.payload?.files)?a.payload.files.map(file=>file.path).join(', '):JSON.stringify(a.payload||{}))}</small></div><div class="approval-actions">${a.status==='approved'?`<button class="gold-button compact" data-execute="${a.id}">Execute</button>`:`<button class="text-button" data-decision="rejected" data-id="${a.id}">Reject</button><button class="gold-button compact" data-decision="approved" data-id="${a.id}">Approve</button>`}</div></article>`).join('')||'<div class="empty-card">Nothing is waiting for approval.</div>'}</div><div class="section-title">Recent tasks</div><div class="workspace-list">${w.tasks.map(t=>`<article class="list-card"><div><b>${esc(t.title)}</b><small>${esc(t.description||'')}</small></div><span class="status-pill">${esc(t.status)}</span></article>`).join('')||'<div class="empty-card">Agent activity will appear here.</div>'}</div></div>`;
      area.querySelectorAll('[data-decision]').forEach(b=>b.onclick=async()=>{try{const result=await invokeAgent(supabase,'decide_approval',{approvalId:b.dataset.id,decision:b.dataset.decision});const url=result.execution?.repository?.url||result.execution?.deploymentUrl;toast(url?`Ready: ${url}`:(result.message||'Approval updated.'));render(view);}catch(e){toast(e.message);}});
      area.querySelectorAll('[data-execute]').forEach(b=>b.onclick=async()=>{try{const result=await invokeAgent(supabase,'execute_approved',{approvalId:b.dataset.execute});const url=result.execution?.repository?.url||result.execution?.deploymentUrl;toast(url?`Ready: ${url}`:(result.execution?.message||'Execution submitted.'));render(view);}catch(e){toast(e.message);}});
    }
  }
  async function renderSettings(){
    const user=getUser();let prefs=null;
    const {data,error}=await supabase.from('jarvis_preferences').select('*').eq('user_id',user.id).maybeSingle();
    if(error){toast(error.message);return;}prefs=data||{};
    area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">YOUR PERSONAL WORKSPACE</p><h2>Settings</h2><p>Set how JARVIS X communicates and works with you.</p></div></div><div class="settings-panel"><label class="settings-field"><span>Preferred language</span><select id="pref-language"><option value="auto">Automatic</option><option value="hi">Hindi</option><option value="en">English</option><option value="hinglish">Hinglish</option></select></label><label class="settings-field"><span>Default AI model</span><select id="pref-model"><option value="gemini-3.8-flash">Gemini 3.8 Flash</option><option value="gemini-3.7-flash">Gemini 3.7 Flash</option></select></label><label class="settings-field"><span>Personal instructions</span><textarea id="pref-instructions" rows="5" maxlength="3000" placeholder="Tell JARVIS X how you prefer answers, what to remember, and how it should help…"></textarea><small>These instructions are added to your AI conversations. Do not put passwords or API keys here.</small></label><label class="settings-check"><input type="checkbox" id="pref-voice"><span>Read responses aloud when I choose Read aloud</span></label><div class="settings-theme"><b>Appearance</b><span>Pearl · Ivory · Champagne — light theme only</span></div><button class="gold-button" id="save-preferences">Save preferences</button></div></div>`;
    $('#pref-language').value=prefs.preferred_language||'auto';
    $('#pref-model').value=prefs.selected_model||'gemini-3.8-flash';
    $('#pref-instructions').value=prefs.custom_instructions||'';
    $('#pref-voice').checked=prefs.settings?.voice_output!==false;
    $('#save-preferences').onclick=async()=>{
      const selectedModel=$('#pref-model').value;
      const {error:saveError}=await supabase.from('jarvis_preferences').upsert({user_id:user.id,preferred_language:$('#pref-language').value,selected_model:selectedModel,custom_instructions:$('#pref-instructions').value.trim(),settings:{voice_output:$('#pref-voice').checked},updated_at:new Date().toISOString()});
      if(saveError)return toast(saveError.message);
      const modelSelect=$('#model-select');if(modelSelect){modelSelect.value=selectedModel;modelSelect.dispatchEvent(new Event('change'));}
      toast('Preferences saved.');
    };
  }
  async function renderImageStudio(){
    area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">CREATIVE STUDIO</p><h2>Image studio</h2><p>Create images from a prompt and keep them in your private workspace.</p></div></div><div class="research-launch"><textarea id="image-prompt" rows="4" placeholder="Describe the image in detail…"></textarea><div class="image-controls"><label>Aspect ratio <select id="image-ratio"><option>1:1</option><option>16:9</option><option>9:16</option><option>3:2</option><option>2:3</option><option>4:3</option><option>3:4</option><option>4:5</option><option>5:4</option><option>21:9</option></select></label><button class="gold-button" id="generate-image">Generate image ↗</button></div><small class="image-note">Image generation uses your Gemini API key. Provider billing or model access may be required.</small></div><div id="image-result"></div></div>`;
    $('#generate-image').onclick=async()=>{
      const prompt=$('#image-prompt').value.trim();if(!prompt)return toast('Describe the image first.');
      const button=$('#generate-image');button.disabled=true;button.textContent='Creating image…';
      try{
        const {data,error}=await supabase.functions.invoke('jarvis-image',{body:{prompt,aspectRatio:$('#image-ratio').value}});
        if(error)throw new Error(error.message||'Image generation failed.');
        if(data?.error)throw new Error(data.error);
        $('#image-result').innerHTML=`<article class="generated-image-card"><img src="${esc(data.imageUrl)}" alt="${esc(data.fileName||'Generated image')}"><div><b>${esc(data.fileName||'Generated image')}</b><small>Saved privately · ${Math.round((data.size||0)/1024)} KB</small><a href="${esc(data.imageUrl)}" target="_blank" rel="noreferrer">Open image ↗</a></div></article>`;
      }catch(e){toast(e.message);}
      finally{button.disabled=false;button.textContent='Generate image ↗';}
    };
  }
  async function renderResearch(){
    area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">LIVE WEB KNOWLEDGE</p><h2>Research</h2><p>Search the web, compare sources and get a cited summary.</p></div></div><div class="research-launch"><textarea id="research-query" rows="3" placeholder="What would you like me to research?"></textarea><button class="gold-button" id="run-research">Research with sources ↗</button></div><div id="research-result"></div></div>`;
    $('#run-research').onclick=async()=>{
      const query=$('#research-query').value.trim();if(!query)return toast('Enter a research question.');
      const button=$('#run-research');button.disabled=true;button.textContent='Researching…';
      try{
        const {data,error}=await supabase.functions.invoke('jarvis-research',{body:{query}});
        if(error)throw new Error(error.message||'Research request failed.');
        if(data?.error)throw new Error(data.error);
        const result=$('#research-result');
        const sources=(data.sources||[]).map(source=>{
          const url=/^https?:\/\//i.test(source.url)?source.url:'#';
          return `<a class="source-card" href="${esc(url)}" target="_blank" rel="noreferrer"><span>[${source.number}]</span><div><b>${esc(source.title)}</b><small>${esc(source.url)}</small></div><span>↗</span></a>`;
        }).join('');
        result.innerHTML=`<article class="research-answer"><div class="section-title">RESEARCH SUMMARY</div><div class="research-copy">${esc(data.summary||'No summary returned.').replace(/\n/g,'<br>')}</div></article><div class="section-title">SOURCES (${(data.sources||[]).length})</div><div class="source-list">${sources||'<div class="empty-card">No sources returned.</div>'}</div>`;
      }catch(e){toast(e.message);}
      finally{button.disabled=false;button.textContent='Research with sources ↗';}
    };
  }
  async function renderIntegrations(){
    let providers=[];try{const result=await invokeAgent(supabase,'capabilities');providers=result.providers||[];}catch(e){toast(e.message);}
    area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">CONNECT YOUR SERVICES</p><h2>Integrations</h2><p>Provider credentials belong in secure server-side secrets, never in browser code or chat.</p></div></div><div class="integration-grid">${INTEGRATIONS.map(item=>{const ready=providers.find(p=>p.id===item.id)?.configured||false;return `<article class="integration-card"><div class="integration-top"><span class="integration-icon">${item.id==='github'?'⌘':item.id==='cloudflare'?'☁':item.id==='gemini'?'✳':'◇'}</span><span class="status-pill ${ready?'ready':''}">${ready?'Configured':item.setup?'Dashboard setup':'Needs setup'}</span></div><h3>${esc(item.name)}</h3><small>${esc(item.category)}</small><p>${item.capabilities.map(esc).join(' · ')}</p>${item.setup||item.instructions?`<div class="setup-copy">${esc(item.setup||item.instructions)}</div>`:''}<div class="secret-list">${item.secrets.map(k=>`<code>${esc(k)}</code>`).join('')}</div></article>`}).join('')}</div><div class="notice-card"><b>Where do API keys go?</b><p>Each provider has its own secure location: Supabase Edge Function Secrets, GitHub Actions Secrets, frontend public configuration, or OAuth provider settings. Follow the instructions shown on each card. Never put private tokens in browser code or chat.</p><a href="https://supabase.com/dashboard/project/tmlrveloeirxsankeqrs/functions/secrets" target="_blank" rel="noreferrer">Open Edge Function secrets ↗</a></div></div>`;
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.view)));
  $('.settings-button')?.addEventListener('click',()=>activate('settings'));
  window.addEventListener('jarvis:navigate',e=>activate(e.detail));
}
