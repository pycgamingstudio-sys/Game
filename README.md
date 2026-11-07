# JARVIS X — Private Personal Intelligence

A local-first, single-owner AI workspace. The app opens directly into the workspace: no sign-in, signup, OTP, Google Auth, public launch or subscription flow.

## Private local mode
- Chat history is stored in this browser's local storage on this device.
- Voice input uses browser speech recognition where available; read-aloud uses browser speech synthesis.
- The UI opens even before any provider API is configured.
- Do not publish this build to a public URL. The local access key is intended only for a private, single-user local setup.

## Run
1. Copy `.env.example` to `.env.local`.
2. Fill in the Supabase project URL, publishable key and a long random local access key.
3. Set the same local access key as the Supabase Edge Function secret `JARVIS_LOCAL_ACCESS_KEY`.
4. Set `GEMINI_API_KEY` and `GITHUB_TOKEN` as Supabase Edge Function secrets when ready.
5. Install dependencies with `npm install`, then run `npm run dev`.

The UI opens directly at the local Vite address. No user account is required.

## Current capabilities and staged integrations
- Local chat sessions and history.
- Browser speech input and read-aloud.
- Text/CSV/JSON/Markdown attachments plus PDF/image request payload support.
- Project, Agent Studio, Memory, Activity and Integrations workspace screens.
- GitHub private repository creation endpoint and Projects screen action (requires a server-side `GITHUB_TOKEN` with repository creation permission).
- Planned provider adapters: Gemini, GitHub (repositories, branches, commits, pull requests), Cloudflare, web research, image generation and voice.
- GitHub and Cloudflare actions must be permission-checked and require explicit approval for writes/deployments.

## Security boundary
This is a personal local app, not a public multi-user service. Never commit API keys. Keep the local access key out of Git, bind local development to localhost, and do not deploy this frontend publicly: a browser-held local key can be extracted by anyone who can access the app. For remote/private access, add a server-side authenticated gateway first.

## Honest status
The interface and local-first conversation foundation are being built before provider credentials are added. A feature shown in the workspace is not considered operational until its provider adapter, permission checks and end-to-end tests are implemented.
