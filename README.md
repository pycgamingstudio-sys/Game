# JARVIS X — Personal Intelligence

A light-first personal AI workspace with a pearl, ivory and champagne visual system. The canonical app is the Vite project at the repository root.

## Implemented in this branch
- Responsive chat UI and installable PWA shell.
- Google OAuth flow with a database-backed email allowlist.
- Supabase conversation history, model selection, search and custom instructions.
- Optional automatic memory extraction (off until enabled in Settings).
- Private file library; image, PDF and plain-text/CSV/JSON analysis.
- Gemini image generation and natural text-to-speech.
- Browser speech input with language preference.
- Tavily web research with source links.
- Projects, memories, tasks, agent runs and approval queue.
- Agent planning for generated starter projects, approval-gated GitHub repository creation and Cloudflare Pages deployment.
- Supabase RLS, private Storage policies and JWT-verified Edge Functions.

See [the feature matrix](docs/FEATURE-MATRIX.md) for limitations and features not yet at full ChatGPT parity.

## Local development
1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run `npm install`, then `npm run dev`.
4. Run `npm test` and `npm run build`.

## Supabase setup
- Project ref: `tmlrveloeirxsankeqrs` (Driver saathi; Plivex is not used).
- Migrations: `supabase/migrations`.
- Edge Functions: `jarvis-chat`, `jarvis-agent`, `jarvis-research`, `jarvis-image`, `jarvis-tts`.
- Configure Google OAuth under Supabase Auth → Providers and set allowed redirect URLs.
- Add approved Gmail addresses to `public.jarvis_allowed_users` using the SQL example in [Provider setup](docs/PROVIDER-SETUP.md). The allowlist is empty by default.
- Keep all server-side keys in the correct provider's secrets store.

## Credentials by location
- Supabase Edge Function Secrets: `GEMINI_API_KEY`, `TAVILY_API_KEY`, `JARVIS_GATEWAY_URL`, and optional `APP_ORIGIN`.
- GitHub Actions Secrets: `GITHUB_TOKEN_JARVIS`, `GITHUB_OWNER`, `GITHUB_REPO`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `JARVIS_OWNER_EMAILS`, `APP_ORIGIN`, and the `VITE_*` frontend build variables.
- Google OAuth: configure the Client ID and Client Secret in Supabase Auth provider settings.
- Never use a Supabase service-role or secret key in a `VITE_*` variable or browser code.

## Safety model
- User data is isolated with RLS and an email allowlist.
- Repository creation and deployment require explicit approval.
- The gateway verifies the signed-in user and the approved action payload before performing side effects.
- Provider keys are never stored in Git history or chat.

## Current status
This is a working foundation in the `jarvis-x-foundation` branch with CI passing. Provider credentials, OAuth configuration, end-to-end tests and Cloudflare deployment are still required before the live app can be used. This project does not claim full ChatGPT feature parity yet.
