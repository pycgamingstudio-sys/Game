export const INTEGRATIONS = [
  { id:'gemini', name:'Google Gemini', category:'AI models', required:true, secrets:['GEMINI_API_KEY'], capabilities:['Chat and reasoning','Vision and document understanding','Tool calling'] },
  { id:'github', name:'GitHub', category:'Development', required:false, secrets:['GITHUB_TOKEN'], capabilities:['Create repositories','Read and write files','Branches, commits and pull requests'] },
  { id:'cloudflare', name:'Cloudflare', category:'Deployment', required:false, secrets:['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'], capabilities:['Create Pages projects','Deploy websites','Manage Workers and domains'] },
  { id:'supabase', name:'Supabase', category:'Backend', required:true, secrets:['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'], capabilities:['Auth, database and storage','Edge Functions','Realtime and vector search'] },
  { id:'google', name:'Google OAuth', category:'Identity', required:false, secrets:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'], capabilities:['Google sign-in','Consent-based Google integrations'] },
  { id:'search', name:'Web search', category:'Research', required:false, secrets:['SEARCH_API_KEY'], capabilities:['Live web search','Source citations','Research reports'] },
  { id:'image', name:'Image generation', category:'Creative', required:false, secrets:['IMAGE_PROVIDER_API_KEY'], capabilities:['Generate images','Edit reference images'] },
  { id:'speech', name:'Voice provider', category:'Voice', required:false, secrets:['TTS_API_KEY'], capabilities:['Natural speech output','Multilingual voice'] },
  { id:'email', name:'Email provider', category:'Productivity', required:false, secrets:['EMAIL_PROVIDER_API_KEY'], capabilities:['Search and summarize email','Draft and send after approval'] }
];
export const CAPABILITY_GROUPS = [
  { id:'chat', title:'AI conversation', items:['Multi-turn chat','Model selection','Persistent history','Personal memory','Custom instructions'] },
  { id:'research', title:'Research and knowledge', items:['Web search with citations','Deep research workflows','PDF and document analysis','Image understanding','Structured data analysis'] },
  { id:'creation', title:'Creation studio', items:['Website and app generation','Code editor and project files','Image generation integration','Document and report creation','Reusable project workspaces'] },
  { id:'developer', title:'Developer agent', items:['GitHub repository management','Code changes and pull requests','Automated build checks','Cloudflare deployments','Deployment link and logs'] },
  { id:'agent', title:'Autonomous agent', items:['Task planning and execution','Background jobs','Approval queue for risky actions','Run history and audit log','Retry and failure recovery'] },
  { id:'voice', title:'Voice and accessibility', items:['Speech-to-text','Text-to-speech','Conversation read-aloud','Keyboard and mobile support'] }
];
export function integrationStatus(id, secrets = {}) {
  const item = INTEGRATIONS.find(entry => entry.id === id);
  if (!item) return 'unknown';
  return item.secrets.every(key => Boolean(secrets[key])) ? 'configured' : 'needs_setup';
}
