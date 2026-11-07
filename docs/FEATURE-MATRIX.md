# JARVIS X feature matrix

This repository is the application foundation. Provider credentials are intentionally absent from source control.

## Product areas
- Conversation: multi-turn chat, saved threads, model picker, copy response, speech input.
- Workspace: projects, files, memories, task queue, approvals and audit trail.
- Creation: project scaffolding, file editing, build/test and deployment orchestration.
- Research: web search, source collection, citation and report generation.
- Multimodal: image and document input, generated images, speech synthesis.
- Developer tools: GitHub repository, branch, commit, pull-request and workflow integrations.
- Infrastructure: Cloudflare Pages/Workers, Supabase Auth/Database/Storage/Functions.

## Execution policy
- Read-only operations may run when the connected account grants access.
- Writes to code, repositories, project settings, deployments, emails, payments or production data require a visible approval step.
- API keys are server-side secrets only. Never put provider secrets in browser variables, database rows, logs, or Git history.
- A provider marked needs setup must never be represented as connected.
- Every tool invocation must be logged with requested action, actor, approval, outcome and timestamp.

## Required configuration
See .env.example and the Integrations page. A key being present does not imply that an OAuth consent screen, API permission, billing plan or provider-side project configuration is complete.
