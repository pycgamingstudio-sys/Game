import { INTEGRATIONS, CAPABILITY_GROUPS } from './integrations.js';
import { invokeAgent, loadWorkspace } from './agent-client.js';

const $ = (s) => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initializeWorkspace({supabase,getUser,toast,onChat}) {
  const area=$('#messages');
  const labels={chat:'Chats',projects:'Projects',tools:'Agent studio',memory:'Memory',activity:'Activity',integrations:'Integrations'};
  async function refresh(){return await loadWorkspace(supabase);}
  function activate(view){
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
    $('.breadcrumb b').textContent=labels[view]||'Workspace';
    $('#sidebar').classList.remove('open');$('#sidebar-backdrop').classList.remove('visible');
    if(view==='chat'){onChat?.();return;}
    if(view==='integrations')return renderIntegrations();
    render(view);
  }
  async function render(view){
    let w;try{w=await refresh();}catch(e){toast(e.message);return;}
    if(view==='projects'){
      area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">YOUR WORKSPACE</p><h2>Projects</h2><p>Organise websites, apps, code and ideas.</p></div><button class="gold-button" id="create-project">＋ New project</button></div><div class="workspace-grid">${w.projects.map(p=>`<article class="workspace-card"><span class="card-symbol">◇</span><h3>${esc(p.name)}</h3><p>${esc(p.description||'No description yet')}</p><small>${esc(p.project_type)} · ${esc(p.status)}</small>${p.repository_url?`<a href="${esc(p.repository_url)}" target="_blank" rel="noreferrer">Repository ↗</a>`:''}${p.deployment_url?`<a href="${esc(p.deployment_url)}" target="_blank" rel="noreferrer">Live website ↗</a>`:''}</article>`).join('')||'<div class="empty-card">Your projects will appear here. Start by creating one.</div>'}</div></div>`;
      $('#create-project').onclick=async()=>{const name=prompt('Project name?');if(!name?.trim())return;const description=prompt('What should it do?')||'';try{await invokeAgent(supabase,'create_project',{name,description});toast('Project created');render(view);}catch(e){toast(e.message);}};
    }else if(view==='tools'){
      area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">AUTONOMOUS WORKSPACE</p><h2>Agent studio</h2><p>Describe the outcome. JARVIS X prepares a plan and checks connected services.</p></div></div><div class="agent-launch"><div class="agent-orb">✳</div><div class="agent-input"><textarea id="agent-goal" rows="3" placeholder="Build a business website, create a GitHub repository and deploy it to Cloudflare Pages..."></textarea><button class="gold-button" id="run-agent">Create execution plan ↗</button></div></div><div class="section-title">Recent tasks</div><div class="workspace-list">${w.tasks.map(t=>`<article class="list-card"><div><b>${esc(t.title)}</b><small>${esc(t.description||'')}</small></div><span class="status-pill">${esc(t.status)}</span></article>`).join('')||'<div class="empty-card">No agent tasks yet.</div>'}</div><div class="section-title">Capability roadmap</div><div class="capability-grid">${CAPABILITY_GROUPS.map(g=>`<article class="capability-card"><h3>${esc(g.title)}</h3>${g.items.map(i=>`<p>◇ ${esc(i)}</p>`).join('')}</article>`).join('')}</div></div>`;
      $('#run-agent').onclick=async()=>{const goal=$('#agent-goal').value.trim();if(!goal)return toast('Describe the task first.');try{const result=await invokeAgent(supabase,'run_agent',{goal});toast(result.message||'Plan created');render(view);}catch(e){toast(e.message);}};
    }else if(view==='memory'){
      area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">PERSONAL CONTEXT</p><h2>Memory</h2><p>Information available across conversations.</p></div><button class="gold-button" id="add-memory">＋ Add memory</button></div><div class="workspace-list">${w.memories.map(m=>`<article class="list-card"><div><b>${esc(m.content)}</b><small>${esc(m.category)} · ${new Date(m.created_at).toLocaleDateString()}</small></div><button class="text-button" data-delete-memory="${m.id}">Delete</button></article>`).join('')||'<div class="empty-card">No saved memories yet.</div>'}</div></div>`;
      $('#add-memory').onclick=async()=>{const content=prompt('What should JARVIS X remember?');if(!content?.trim())return;const {error}=await supabase.from('jarvis_memories').insert({user_id:getUser().id,content:content.trim(),category:'general'});if(error)return toast(error.message);toast('Memory saved');render(view);};
      area.querySelectorAll('[data-delete-memory]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.from('jarvis_memories').delete().eq('id',b.dataset.deleteMemory);if(error)return toast(error.message);render(view);});
    }else if(view==='activity'){
      area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">CONTROL CENTRE</p><h2>Activity & approvals</h2><p>Review actions before the agent performs them.</p></div></div><div class="section-title">Pending approvals</div><div class="workspace-list">${w.approvals.map(a=>`<article class="list-card"><div><b>${esc(a.action)}</b><small>Requested ${new Date(a.created_at).toLocaleString()}</small></div><div class="approval-actions"><button class="text-button" data-decision="rejected" data-id="${a.id}">Reject</button><button class="gold-button compact" data-decision="approved" data-id="${a.id}">Approve</button></div></article>`).join('')||'<div class="empty-card">Nothing is waiting for approval.</div>'}</div><div class="section-title">Recent tasks</div><div class="workspace-list">${w.tasks.map(t=>`<article class="list-card"><div><b>${esc(t.title)}</b><small>${esc(t.description||'')}</small></div><span class="status-pill">${esc(t.status)}</span></article>`).join('')||'<div class="empty-card">Agent activity will appear here.</div>'}</div></div>`;
      area.querySelectorAll('[data-decision]').forEach(b=>b.onclick=async()=>{try{await invokeAgent(supabase,'decide_approval',{approvalId:b.dataset.id,decision:b.dataset.decision});toast('Approval updated.');render(view);}catch(e){toast(e.message);}});
    }
  }
  async function renderIntegrations(){
    let providers=[];try{const result=await invokeAgent(supabase,'capabilities');providers=result.providers||[];}catch(e){toast(e.message);}
    area.innerHTML=`<div class="page-view"><div class="page-heading"><div><p class="welcome-kicker">CONNECT YOUR SERVICES</p><h2>Integrations</h2><p>Provider credentials belong in secure server-side secrets, never in browser code or chat.</p></div></div><div class="integration-grid">${INTEGRATIONS.map(item=>{const ready=providers.find(p=>p.id===item.id)?.configured||false;return `<article class="integration-card"><div class="integration-top"><span class="integration-icon">${item.id==='github'?'⌘':item.id==='cloudflare'?'☁':item.id==='gemini'?'✳':'◇'}</span><span class="status-pill ${ready?'ready':''}">${ready?'Configured':'Needs setup'}</span></div><h3>${esc(item.name)}</h3><small>${esc(item.category)}</small><p>${item.capabilities.map(esc).join(' · ')}</p><div class="secret-list">${item.secrets.map(k=>`<code>${esc(k)}</code>`).join('')}</div></article>`}).join('')}</div><div class="notice-card"><b>Where do API keys go?</b><p>Supabase Dashboard → Edge Functions → Secrets. Add each key there. OAuth also needs provider-console configuration and redirect URLs.</p><a href="https://supabase.com/dashboard/project/tmlrveloeirxsankeqrs/functions/secrets" target="_blank" rel="noreferrer">Open Edge Function secrets ↗</a></div></div>`;
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.view)));
  $('.settings-button')?.addEventListener('click',()=>activate('integrations'));
  window.addEventListener('jarvis:navigate',e=>activate(e.detail));
}
