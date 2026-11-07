# JARVIS X

A light, premium personal AI workspace for web, Android-friendly PWA use, and desktop.

## Stack
- React + Vite
- Supabase Auth, Postgres, Storage and Edge Functions
- Gemini provider called server-side only
- Pluggable provider adapters for GitHub, Cloudflare, search, image and speech services

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Add your Supabase project URL and publishable key.
3. `npm install`
4. `npm run dev`
5. `npm run build`

## Security
Do not put Gemini/GitHub/Cloudflare secrets in browser environment variables. Add them as Supabase Edge Function secrets. Keep RLS enabled. Destructive GitHub, database, deployment, email and billing actions must require explicit approval and be audit logged.

## Current integration status
The UI works in demo mode without credentials. Supabase sign-in and persistence activate after configuration. AI replies activate when the `jarvis-chat` Edge Function has `GEMINI_API_KEY` configured. Agent capabilities report missing provider keys instead of pretending an integration is connected.

## Deploy
Build output is `dist/`. Deploy to Cloudflare Pages with build command `npm run build`, root directory `jarvis-x`, output directory `dist`. Configure the two `VITE_` variables in the Pages project. Edge Function secrets are configured separately in Supabase.
