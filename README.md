# JARVIS X — Private Personal Intelligence

A local-first, single-owner AI workspace. It opens directly without login, signup, OTP, Google Auth or subscription.

## Current implementation
- Direct-open responsive workspace; no account flow.
- Browser-local conversations, projects, memories and activity history.
- Gemini 2.5 Flash/Pro chat through a server-side Edge Function.
- Voice input and read-aloud using supported browser capabilities.
- Text, CSV, JSON, Markdown, XML and log files; PDF/image data is sent to Gemini inline.
- Clarify-first AI task planner: asks questions when the brief is incomplete, otherwise produces a structured plan.
- Explicitly confirmed GitHub actions: create a private repository or generate a starter project with Gemini and upload it to a new private repository.
- Provider screen reports whether required server secrets are present (not whether provider scopes, billing or permissions are valid).

## Supabase backend already connected
Project: `tmlrveloeirxsankeqrs` (Driver saathi workspace, JARVIS tables/functions).

The `jarvis-chat` and `jarvis-agent` Edge Functions have been deployed with platform JWT verification disabled. Each function checks `x-jarvis-local-key` against the server-only `JARVIS_LOCAL_ACCESS_KEY`, and checks the configured browser origin. This is custom single-owner access, not public anonymous access.

## Setup — only required values
1. Copy `.env.example` to `.env.local`.
2. Set a long random value for `VITE_JARVIS_LOCAL_ACCESS_KEY`.
3. Set the exact same value as Supabase Edge Function secret `JARVIS_LOCAL_ACCESS_KEY`.
4. Add `GEMINI_API_KEY` and `GITHUB_TOKEN` as Supabase Edge Function secrets.
5. Keep `APP_ORIGIN=http://localhost:5173` unless you intentionally run from another local origin.
6. Run `npm install`, `npm test`, `npm run build`, then `npm run dev`.

Supabase URL and publishable key are already filled in the example file. The publishable key is intended for client use; never expose a Supabase secret/service-role key.

## Security
- Chat, projects and memories are stored in this browser's local storage; they do not sync across devices yet.
- Never commit actual API keys. Never put Gemini or GitHub credentials in a `VITE_` variable.
- The local access key is bundled into the private local frontend so it can call the protected Edge Functions. Do not publish this app or expose it to other people. Remote access needs a server-side authenticated gateway.
- GitHub project creation is private by default and requires a separate confirmation click.
- The current source repository is still the existing `Game` repository. It is not the final private repository home. Do not treat it as a private repository: its GitHub visibility is currently public.

## Not yet implemented or not end-to-end verified
Cloudflare deployment, general web search, image generation, cross-device memory, arbitrary existing-repository editing, and autonomous multi-step execution still need provider adapters, permissions and end-to-end tests. They are not represented as completed features.
