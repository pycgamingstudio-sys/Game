alter table public.jarvis_conversations alter column model set default 'gemini-3.8-flash';
alter table public.jarvis_preferences alter column selected_model set default 'gemini-3.8-flash';
update public.jarvis_conversations set model='gemini-3.8-flash' where model='gemini-2.5-flash';
update public.jarvis_preferences set selected_model='gemini-3.8-flash' where selected_model='gemini-2.5-flash';
