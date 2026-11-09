# launchwright MCP server

The remote MCP server learners connect their AI tool to: `https://mcp.launchwright.app/mcp`.

```sh
claude mcp add --transport http launchwright https://mcp.launchwright.app/mcp
```

Every tool call returns the result **and** a short lesson. The first time a learner meets a
concept the lesson is full; after that it's one line (`src/lessons.ts`, stored in Neon by
`sql/001_lesson_progress.sql`).

## Tools (v0.1, first slice)

| Tool | What it does |
|---|---|
| `project_status` | Framework, package manager, database, hosting, readiness score, next step |
| `check_readiness` | Secrets, env config, CI with tests, Playwright E2E, migrations. Live checks (auth, headers, uptime) are reported as not checked |

Prompt: `lesson-readiness` (guided fix-it walkthrough). Both tools are read-only.

## Auth

OAuth 2.1 via `@cloudflare/workers-oauth-provider`. The learner approves the client on our
consent page, then signs in with the same GitHub App as the platform. GitHub's token is kept
only in the grant's encrypted props; the AI never sees it.

## Setup (once)

1. `npx wrangler kv namespace create OAUTH_KV`, put the id in `wrangler.jsonc` (done).
2. GitHub App → add callback URLs `https://mcp.launchwright.app/callback` and `https://localhost:8792/callback`.
3. Secrets: CI deploys with the platform's repo secrets (`PLATFORM_GITHUB_CLIENT_SECRET`, `PLATFORM_DATABASE_URL`), since it's the same GitHub App and database.
4. Run `sql/001_lesson_progress.sql` on the platform's Neon database.

## Local dev

```sh
cp .dev.vars.example .dev.vars   # fill in, never commit
npm run dev -w apps/mcp          # https://localhost:8792
npm test -w apps/mcp
```
