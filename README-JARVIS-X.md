# JARVIS X

A light, premium personal AI workspace built with Vite and Supabase. The visual system uses pearl, ivory, warm stone and champagne accents; no dark theme or neon gradients.

## Current foundation
- Responsive web app/PWA shell and Google OAuth entry point.
- Supabase Auth, persistent chat history, projects, memory, tasks, approvals, agent runs and audit log.
- Supabase Edge Functions: `jarvis-chat` and `jarvis-agent`.
- Provider status screen and secret-name checklist.
- Cloudflare Worker gateway starter and Wrangler deployment config.
- Risky actions are designed around explicit approvals; credentials remain server-side.

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and set the Supabase URL and publishable key.
3. In Supabase Auth, enable Google and configure the OAuth redirect URLs for the app domain.
4. Add `GEMINI_API_KEY` to Supabase Edge Function secrets.
5. Run `npm run dev`; validate with `npm run build`.

## Supabase Edge Function secrets
Required for AI chat: `GEMINI_API_KEY`.

Optional integrations: `GITHUB_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SEARCH_API_KEY`, `IMAGE_PROVIDER_API_KEY`, `TTS_API_KEY`, `EMAIL_PROVIDER_API_KEY`.

Supabase URL and publishable key are public client configuration values. Never place service-role keys, OAuth client secrets, or provider tokens in frontend variables or source control.

## Cloudflare
Set `APP_ORIGIN` and provider credentials as Worker secrets/vars. Deploy using Wrangler only after configuring the Cloudflare account and reviewing the deployment target.

## Current limitations
External GitHub actions, real web search, image generation, file parsing, background scheduling and production Cloudflare deployments still require their provider adapters, credentials, tests and explicit authorization. The presence of a settings entry does not mean an integration is active.
