# launchwright MCP server

The remote MCP server learners connect their AI tool to: `https://mcp.launchwright.app/mcp`.

```sh
claude mcp add --transport http launchwright https://mcp.launchwright.app/mcp
```

Every tool call returns the result **and** a short lesson. The first time a learner meets a
concept the lesson is full; after that it's one line. The curriculum (8 Level 1 modules and their
concepts) lives in `packages/core/curriculum.ts`, shared with the dashboard.

## Tools (v0.1)

| Tool | What it does | Changes things? |
|---|---|---|
| `project_status` | Framework, package manager, database, hosting, connected accounts, readiness, next step | No |
| `check_readiness` | The 8 readiness checks. Repo: secret scanning, env config, CI with tests, E2E on a preview, migrations. Live (with `url`): auth on API routes, HTTPS + security headers, uptime | No (plain GETs) |
| `check_env` | Settings the code reads vs. `.env.example` vs. production (Worker vars/secrets, Actions secrets); secrets exposed to the browser | No |
| `set_secret` | Returns a dashboard link; the learner types the value; a second call writes it to GitHub Actions and/or the Worker | Yes |
| `connect_database` | Lists or creates a Neon/Supabase project and writes the pooled `DATABASE_URL` straight into secrets | Yes (replacing one needs approval) |
| `setup_ci` | Opens a PR: gitleaks, checks, Playwright, Cloudflare previews + E2E on the preview, production deploy with smoke test and rollback, uptime check | PR only |
| `deploy` | Dispatches the deploy workflow in the learner's repo. Preview now; production and rollback need dashboard approval | Yes (gated) |
| `get_logs` | CI run logs around the first error, or recent Worker logs; redacted and fenced as untrusted | No |
| `explain_error` | Plain-words explanation, likely causes and the smallest fix for common errors | No |

Prompts (guided lessons): `lesson-readiness`, `lesson-secrets`, `lesson-database`, `lesson-ci`,
`lesson-deploy`, `lesson-debug`, `lesson-security`.

## Security model

- **The AI never sees a credential.** Provider keys are pasted on the dashboard, checked with the
  provider and sealed (AES-256-GCM, `TOKEN_KEY`, bound to the learner). Secret values are typed on
  `/secret?id=…` and wiped after they're written. Tool results contain names only.
- **Approvals.** Production deploys, rollbacks and replacing an existing `DATABASE_URL` create an
  approval on the dashboard. The tool runs only when called again with that `approval_id`;
  approvals are single-use, bound to the action and repo, and expire after a day.
- **Untrusted content.** Repo files and logs are redacted (`packages/core/untrusted.ts`), size
  capped, and fenced with a note telling the AI it's data, not instructions.
- **Audit log.** Every tool call (and every dashboard decision) is written to `audit_log`.
- **Never the default branch.** `setup_ci` commits to a new branch and opens a PR.

## Auth

OAuth 2.1 via `@cloudflare/workers-oauth-provider`. The learner approves the client on our
consent page, then signs in with the same GitHub App as the platform. GitHub's token is kept
only in the grant's encrypted props; the AI never sees it.

## Setup (once)

1. `npx wrangler kv namespace create OAUTH_KV`, put the id in `wrangler.jsonc` (done).
2. GitHub App → add callback URLs `https://mcp.launchwright.app/callback` and `https://localhost:8792/callback`.
3. GitHub App → permissions (repository): Contents **read & write**, Pull requests **read & write**,
   Workflows **read & write**, Actions **read & write**, Secrets **read & write**, Variables
   **read & write**, Metadata read. Learners accept the new permissions on their installation.
4. Run `sql/001_lesson_progress.sql` and `sql/002_v0_1.sql` on the platform's Neon database.
5. `openssl rand -base64 32` → repo secret `PLATFORM_TOKEN_KEY` (CI gives it to both Workers as `TOKEN_KEY`).
6. Optional, Supabase: create an OAuth app in the launchwright Supabase org with callback
   `https://platform.launchwright.app/auth/supabase/callback`; repo variable `SUPABASE_CLIENT_ID`,
   repo secret `SUPABASE_CLIENT_SECRET`.
7. Secrets: CI deploys with the platform's repo secrets (`PLATFORM_GITHUB_CLIENT_SECRET`, `PLATFORM_DATABASE_URL`, `PLATFORM_TOKEN_KEY`).

## Local dev

```sh
cp .dev.vars.example .dev.vars   # fill in, never commit
npm run dev -w apps/mcp          # https://localhost:8792
npm test -w apps/mcp             # unit tests + every tool end to end against a fake GitHub
```

`GET /health` reports whether sign-in, the database and the encryption key are configured.
