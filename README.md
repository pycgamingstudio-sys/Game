# JARVIS X — Personal Intelligence

A light-first, responsive personal AI workspace with a pearl, ivory and champagne visual system.

## Current foundation
- Vite frontend, mobile-responsive layout and installable PWA metadata.
- Supabase Auth (Google OAuth flow), private conversation history and owner-scoped database policies.
- Projects, personal memories, agent task/approval screens and integration status panel.
- Private file bucket with per-user storage policies.
- Gemini chat, private image generation and Tavily research Edge Functions.
- Authenticated agent planning, approval queue and a Cloudflare Worker gateway for GitHub repository creation and Pages deployment.
- Feature registry and integration secret checklist.
- Build and unit-test workflow.

## Local development
1. Copy .env.example to .env and fill the Supabase URL and publishable key.
2. npm install
3. npm run dev
4. npm test && npm run build

## Supabase setup
- Project ref: tmlrveloeirxsankeqrs (Driver saathi; Plivex is not used).
- Migrations: supabase/migrations.
- Edge Functions: jarvis-chat and jarvis-agent.
- Configure Google OAuth under Supabase Auth providers and allowed redirect URLs.
- Add provider credentials through Supabase Edge Function Secrets, never frontend environment variables.

## Integration secrets
- GEMINI_API_KEY
- GITHUB_TOKEN
- CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
- SEARCH_API_KEY
- IMAGE_PROVIDER_API_KEY
- TTS_API_KEY
- EMAIL_PROVIDER_API_KEY
- APP_ORIGIN

A credential being present is not proof that provider permissions, OAuth consent, billing, account ownership or deployment configuration are complete.

## Safety model
Read-only tools may run when permissions are available. Repository writes, deployments, sending messages, destructive changes and other high-impact operations must have explicit user approval and an audit record.

## Important status
This is an active foundation, not a claim of full ChatGPT feature parity. External integrations are not operational until their providers are configured and end-to-end tests pass.
