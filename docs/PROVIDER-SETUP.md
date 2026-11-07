# JARVIS X provider setup

Do not paste secrets into the chat, source code, issue comments or frontend environment variables.

## Frontend host variables
- VITE_SUPABASE_URL — project URL.
- VITE_SUPABASE_PUBLISHABLE_KEY — publishable key only. Never use the secret/service-role key in VITE_ variables.
- VITE_CHAT_FUNCTION_URL — jarvis-chat function URL.

## Supabase Edge Function Secrets
Add these under Supabase Dashboard → Edge Functions → Secrets:
- GEMINI_API_KEY — required for chat and agent planning.
- TAVILY_API_KEY — Tavily web search key used by the Research workspace.
- Image generation uses GEMINI_API_KEY with Gemini 3.1 Flash Image; the image model may require billing or model access in the Google AI project.
- APP_ORIGIN — exact deployed frontend origin for CORS, e.g. https://app.example.com.
- JARVIS_GATEWAY_URL — deployed Cloudflare Worker gateway URL used by the agent after approval.

## Frontend build variables
Add these as GitHub Actions secrets for the Cloudflare Pages build: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, and VITE_CHAT_FUNCTION_URL. These are injected at build time; the publishable key is designed for browser use, but never use a Supabase service-role or secret key in a VITE_ variable.

## Cloudflare Worker and GitHub Actions secrets
The Worker deployment workflow reads these GitHub repository Actions secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, JARVIS_OWNER_EMAILS, APP_ORIGIN, GITHUB_TOKEN_JARVIS, GITHUB_OWNER, and GITHUB_REPO. Set GITHUB_OWNER=pycgamingstudio-sys and GITHUB_REPO=Game for the gateway workflow host. The Worker only accepts users whose verified email is listed in JARVIS_OWNER_EMAILS (comma-separated). The Pages deployment workflow also requires CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_TOKEN_JARVIS for private source checkout, and the three VITE_ frontend build variables above. Give the GitHub token only the permissions required to create repositories, write repository contents, read metadata, and dispatch Actions. A GitHub App is preferred where possible; verify repository-creation support before enabling it. The Cloudflare token should be scoped to Pages: Edit and Workers Scripts: Edit on the intended account.

## Dashboard configuration (not Edge Function secrets)
- Supabase Auth → Providers → Google: configure OAuth Client ID and Client Secret.
- Google Cloud Console: add the Supabase OAuth callback URL to authorized redirect URIs.
- Supabase project URL and publishable key are frontend build-time environment variables.
- Enable the Data API for the app and verify the public schema is exposed if the frontend uses supabase-js table queries. The SQL migrations grant only authenticated access and enable owner-scoped RLS on each application table.
- Enable leaked-password protection in Supabase Auth security settings.
- Configure allowed redirect URLs for local development and the deployed app.

## OAuth permissions
Start with Google sign-in only. Gmail access must be separately consented and should request read-only scopes first. Draft/send permissions must be added only when those features are implemented and must always use an explicit send approval.

## Before going live
1. Confirm every provider key is stored server-side.
2. Test a signed-in user's access and confirm another account cannot read or modify their rows or files.
3. Test chat and agent planning with the real provider key.
4. Test provider permissions with a restricted GitHub repository and a non-production Cloudflare Pages project.
5. Review Supabase Security and Performance Advisors.
6. Configure rate limits, usage alerts and provider spend limits.
