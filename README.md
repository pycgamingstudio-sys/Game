# JARVIS X — Private Personal Intelligence

A local-first, single-owner AI workspace. It opens directly without login, signup, OTP, Google Auth, subscription or public-user accounts.

## What works in this foundation
- Local chat sessions and persistent browser history.
- Gemini chat endpoint with Flash/Pro model selection.
- Voice input and read-aloud using browser capabilities.
- Text, CSV, JSON, Markdown, log and XML files; PDF and image payloads are passed to Gemini.
- Local projects, saved memories and an activity log stored on this device.
- Clarify-first AI planning: JARVIS asks questions when the brief is incomplete, otherwise returns an ordered plan.
- Explicitly confirmed GitHub actions: create a private repository, or generate a starter project with Gemini and upload its files to a new private GitHub repository.
- Provider status screen checks whether server-side secrets are present (not whether all provider permissions/billing are valid).

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_JARVIS_LOCAL_ACCESS_KEY`.
3. Set the matching `JARVIS_LOCAL_ACCESS_KEY` as a Supabase Edge Function secret.
4. Add `GEMINI_API_KEY` and `GITHUB_TOKEN` as Supabase Edge Function secrets.
5. Run `npm install`, `npm test`, `npm run build`, then `npm run dev`.

## Required server secrets
- `JARVIS_LOCAL_ACCESS_KEY` — same random value as the local frontend setting.
- `GEMINI_API_KEY` — Gemini chat, clarification/planning and starter-code generation.
- `GITHUB_TOKEN` — GitHub repository creation and starter-file upload. Give it only the repository permissions needed for the personal account.

Optional future providers (not active features yet): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SEARCH_API_KEY`, `IMAGE_PROVIDER_API_KEY`, `TTS_API_KEY`, `EMAIL_PROVIDER_API_KEY`.

`APP_ORIGIN` defaults to `http://localhost:5173`. If the local origin changes, set the exact origin as a server-side secret.

## Privacy and security
- No user login or account is created. Chat, project and memory data are stored in this browser's local storage and do not sync to another device.
- Never commit actual keys. Never put Gemini or GitHub credentials in any `VITE_` variable.
- The local access key is necessarily present in the local frontend bundle. Do not publish this frontend or expose it to other people. This is a single-user local setup, not a secure public service. Remote access requires a server-side authenticated gateway.
- GitHub project generation creates a private repository only after the user presses the explicit confirmation button. The AI planner itself does not execute actions.
- Provider secret presence is not proof of account permissions, API scopes, billing or successful live operation.

## Current boundaries
Cloudflare deployment, general-purpose web search, image generation, long-term cross-device memory, arbitrary repository editing after initial scaffold, and autonomous multi-step tool execution are not yet implemented. They must not be presented as working until their provider adapters and end-to-end tests are added.
