export async function invokeAgent(supabase, task, payload = {}) {
  const { data, error } = await supabase.functions.invoke('jarvis-agent', { body: { task, payload } });
  if (error) throw new Error(error.message || 'Agent request failed');
  return data;
}
export async function loadWorkspace(supabase) {
  const [projects, tasks, approvals, memories] = await Promise.all([
    supabase.from('jarvis_projects').select('*').order('updated_at', { ascending:false }).limit(50),
    supabase.from('jarvis_tasks').select('*').order('created_at', { ascending:false }).limit(50),
    supabase.from('jarvis_approvals').select('*').in('status',['pending','approved']).order('created_at',{ascending:false}).limit(50),
    supabase.from('jarvis_memories').select('*').order('created_at',{ascending:false}).limit(100)
  ]);
  for (const result of [projects,tasks,approvals,memories]) if (result.error) throw result.error;
  return { projects:projects.data || [], tasks:tasks.data || [], approvals:approvals.data || [], memories:memories.data || [] };
}
