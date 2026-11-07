export const INTEGRATIONS = [
  { id:'gemini', name:'Google Gemini', category:'AI models', required:true, secrets:['GEMINI_API_KEY'], instructions:'Add GEMINI_API_KEY under Supabase Edge Functions → Secrets. Used by chat, vision and AI task planning.', capabilities:['Chat and reasoning','Image and PDF understanding','Structured agent planning'] },
  { id:'github', name:'GitHub', category:'Development', required:false, secrets:['GITHUB_TOKEN_JARVIS','GITHUB_OWNER','GITHUB_REPO'], instructions:'Add GITHUB_TOKEN_JARVIS as a GitHub Actions secret. The Worker deployment workflow installs it as GITHUB_TOKEN. Grant only the repository and Actions permissions needed; repository creation requires account-level repository creation permission.', capabilities:['Create private repositories','Read and write project files','Branches, commits and pull requests'] },
  { id:'cloudflare', name:'Cloudflare', category:'Deployment', required:false, secrets:['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','JARVIS_GATEWAY_URL'], instructions:'Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID as GitHub Actions secrets. Use a scoped token for Pages deployment and Worker deployment.', capabilities:['Create Pages projects','Deploy production builds','Run the secure gateway Worker'] },
  { id:'supabase', name:'Supabase', category:'Backend', required:true, secrets:[], setup:'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the frontend host. Keep service-role and secret keys server-side.', capabilities:['Auth, database and private storage','Edge Functions','Realtime and vector search'] },
  { id:'google', name:'Google OAuth', category:'Identity', required:false, secrets:[], setup:'Configure the Google OAuth client in Supabase Auth → Providers → Google, then add the Supabase callback URL to Google Cloud Console. Request Gmail scopes only when that feature is enabled.', capabilities:['Google sign-in','Consent-based Gmail integrations'] },
  { id:'search', name:'Web search', category:'Research', required:false, secrets:['TAVILY_API_KEY'], instructions:'Add SEARCH_API_KEY under Supabase Edge Functions → Secrets after selecting the search provider.', capabilities:['Live web search','Source citations','Research reports'] },
  { id:'image', name:'Image generation', category:'Creative', required:false, secrets:['IMAGE_PROVIDER_API_KEY'], instructions:'Add IMAGE_PROVIDER_API_KEY under Supabase Edge Functions → Secrets if using a separate image provider. Gemini image models may use the Gemini key.', capabilities:['Generate images','Edit reference images'] },
  { id:'speech', name:'Voice provider', category:'Voice', required:false, secrets:['TTS_API_KEY'], instructions:'Add TTS_API_KEY under Supabase Edge Functions → Secrets when a dedicated speech provider is selected.', capabilities:['Natural speech output','Multilingual voice'] },
  { id:'email', name:'Gmail access', category:'Productivity', required:false, secrets:[], setup:'Use Google OAuth consent for Gmail scopes. Read-only access is separate from draft/send permissions; sending always requires explicit approval.', capabilities:['Search and summarise email','Draft and send after approval'] }
];
export const CAPABILITY_GROUPS = [
  { id:'chat', title:'AI conversation', items:['Multi-turn chat','Model selection','Persistent history','Personal memory','Custom instructions'] },
  { id:'research', title:'Research and knowledge', items:['Web search with citations','Deep research workflows','PDF and document analysis','Image understanding','Structured data analysis'] },
  { id:'creation', title:'Creation studio', items:['Website and app generation','Code editor and project files','Image generation integration','Document and report creation','Reusable project workspaces'] },
  { id:'developer', title:'Developer agent', items:['GitHub repository management','Code changes and pull requests','Automated build checks','Cloudflare deployments','Deployment link and logs'] },
  { id:'agent', title:'Autonomous agent', items:['Task planning and execution','Background jobs','Approval queue for risky actions','Run history and audit trail','Retry and failure recovery'] },
  { id:'voice', title:'Voice and accessibility', items:['Speech-to-text','Text-to-speech','Conversation read-aloud','Keyboard and mobile support'] }
];
export function integrationStatus(id,secrets={}) {
  const item=INTEGRATIONS.find(entry=>entry.id===id);
  if(!item)return 'unknown';
  if(item.setup)return 'manual_setup';
  return item.secrets.length&&item.secrets.every(key=>Boolean(secrets[key]))?'configured':'needs_setup';
}
