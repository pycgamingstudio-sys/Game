# JARVIS X feature status

JARVIS X is being built as a light-first personal AI workspace. This file separates working code paths from provider-dependent and future work.

## Implemented in the current branch
- Responsive pearl/ivory/champagne chat interface and PWA shell.
- Google OAuth sign-in flow with a database-backed email allowlist.
- Supabase chat history, model selection, conversation search and custom instructions.
- Optional automatic memory extraction for non-sensitive preferences and project details; the user must enable it in Settings.
- Private file storage and library.
- Chat analysis for images, PDFs and plain-text/CSV/JSON files (15 MB total per request); Word/Excel file content extraction is not yet implemented.
- Gemini image generation and natural text-to-speech endpoints.
- Browser speech input, with language selection.
- Tavily web search with Gemini summaries and source links.
- Projects, memories, tasks, agent run history and approval queue.
- Agent planning that can prepare a new private GitHub repository with generated starter source files.
- Approval-gated Cloudflare Pages deployment workflow and a Cloudflare Worker gateway.
- Supabase Row Level Security on user data and private storage; all deployed Edge Functions verify JWTs.

## Requires provider configuration before live use
- Gemini API key for chat, image generation, agent planning and natural speech.
- Tavily API key for web research.
- Google OAuth client configured in Supabase Auth.
- GitHub token and Cloudflare API token/account ID for repository creation and deployment.
- Approved Gmail addresses in the database allowlist and Worker allowlist.
- Frontend Supabase URL and publishable key in the Cloudflare Pages build secrets.

## Not yet at full ChatGPT parity
- Live, interruptible real-time voice conversations.
- Gmail inbox access, drafting and sending.
- General-purpose GitHub issue/PR management and editing arbitrary existing repositories.
- Full DOCX/XLSX extraction, video understanding/generation and long-form audio transcription.
- A secure interactive code execution/data-analysis sandbox.
- Background scheduling and unattended task execution.
- Broad third-party integrations and automatic tool selection across every provider.

## Execution policy
- Read-only operations may run when the connected account grants access.
- Repository creation and deployment require explicit approval.
- The gateway verifies the signed-in user and checks the approved action payload before performing side effects.
- Provider keys remain in server-side secrets; never place them in browser variables, database rows, logs or Git history.
- A provider marked needs setup must never be represented as connected.
- Actions are recorded in the audit log.

## Configuration guide
See [Provider setup](PROVIDER-SETUP.md) and [.env.example](../.env.example). A key being present does not imply that OAuth consent, API permissions, billing or provider-side configuration is complete.
