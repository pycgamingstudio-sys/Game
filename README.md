# JARVIS X

A responsive, light-first personal AI workspace.

## Visual direction
Pearl, ivory, warm beige and champagne-gold. No dark/neon default theme.

## Stack
- Vite frontend
- Supabase Auth + Postgres (RLS)
- Supabase Edge Function for server-side Gemini calls

## Local setup
1. Copy `.env.example` to `.env` and fill the Supabase URL and publishable key.
2. `npm install`
3. `npm run dev`

## Supabase setup
- Apply migration `supabase/migrations/202611070001_jarvis_x_core_schema.sql`.
- Enable Google provider in Supabase Auth and add the app redirect URLs.
- Deploy `supabase/functions/jarvis-chat`.
- Set Edge Function secret `GEMINI_API_KEY`; optionally set `APP_ORIGIN`.

## Safety
Only the user's own records are accessible through RLS. Provider secrets remain server-side. High-impact agent actions must use explicit approval flows before execution.
