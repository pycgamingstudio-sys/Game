# Provider setup checklist

Configure secrets only in the relevant provider dashboard; do not commit them.

## Supabase
- Frontend build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Edge Function secrets: `GEMINI_API_KEY`, `APP_ORIGIN`.
- Enable Google provider in Supabase Auth and add the app's deployed URL to redirect URLs.
- Confirm all `jarvis_*` tables have RLS enabled and policies restrict rows to `auth.uid() = user_id`.

## GitHub agent
- `GITHUB_TOKEN` with minimum required repository permissions. Prefer GitHub App installation tokens over a broad personal access token.
- Create repository, branch, commit, pull request and deployment actions as separate tools. Require approval before writes, deletion, visibility changes or repository creation.

## Cloudflare agent
- `CLOUDFLARE_API_TOKEN` scoped to Pages projects/deployments and `CLOUDFLARE_ACCOUNT_ID`.
- Add a project-specific Pages deploy action; do not grant account-wide administrator permissions.

## Additional providers
- `SEARCH_API_KEY` for web research.
- `IMAGE_PROVIDER_API_KEY` for image generation.
- `TTS_API_KEY` for premium speech. Browser speech input/output currently uses native Web Speech APIs where available.
- Optional email provider credentials only if email tools are enabled.

## Safety policy
- Never expose provider secrets to the browser.
- Validate user JWT on every Edge Function request.
- Apply per-user rate limits and usage budgets before enabling public access.
- Require explicit approval for external side effects (GitHub writes, deployments, email sending, destructive DB actions, billing).
- Audit every agent run, approval and tool execution.
