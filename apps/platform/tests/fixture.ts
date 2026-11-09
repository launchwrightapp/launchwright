// A learner's /api/me for tests (same shape as worker/learner.ts). Served with page.route, so the
// local test server doesn't need a database.
import type { Page, Route } from "@playwright/test";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export const me = {
  user: { id: 1, login: "test-learner", name: "Test Learner" },
  configured: { database: true, encryption: true, supabase: false },
  projects: [
    {
      repo: "juan/barbershop-booking", framework: "Next.js", packageManager: "npm", database: "Neon", hosting: "Cloudflare Workers", worker: "barbershop",
      productionUrl: "https://barbershop.example.com", readiness: { passed: 5, total: 8 }, checkedAt: ago(20), updatedAt: ago(20),
      checks: [
        { id: "secrets", title: "No secrets in the repo", status: "pass", detail: "No .env files are committed and CI scans the history." },
        { id: "env_config", title: "Env config is documented", status: "pass", detail: "There is an example env file." },
        { id: "ci", title: "CI runs your tests", status: "pass", detail: "A workflow runs your tests.", files: [".github/workflows/ci.yml"] },
        { id: "e2e", title: "E2E smoke test", status: "warn", detail: "CI runs Playwright, but only against a local server." },
        { id: "api_auth", title: "Auth on API routes", status: "fail", detail: "These routes answered with data to a request with no login: /api/bookings." },
        { id: "migrations", title: "Database migrations", status: "pass", detail: "Schema changes live in the repo as migration files." },
        { id: "security_headers", title: "HTTPS and security headers", status: "pass", detail: "Redirects to HTTPS and sends every header." },
        { id: "uptime", title: "Uptime check", status: "not_checked", detail: "Needs your deployed URL." },
      ],
    },
  ],
  conceptsSeen: ["project_status", "pull_requests", "code_review", "env_config", "secrets", "secret_storage", "env_drift", "readiness"],
  connections: [{ provider: "cloudflare", method: "api_key", label: "Juan's account", scopes: "Workers Scripts: Edit", connectedAt: ago(60 * 24) }],
  approvals: [
    { id: "0b8e6a2e-6a8a-4c55-9a39-1a2b3c4d5e6f", repo: "juan/barbershop-booking", client: "Claude Code", tool: "deploy", action: "deploy:production:main", title: "Deploy juan/barbershop-booking (main) to production", summary: "Builds main and replaces what your users see.", detail: { workflow: "launchwright-deploy.yml", branch: "main" }, createdAt: ago(4), expiresAt: ago(-60 * 24) },
  ],
  audit: [
    { actor: "ai", client: "Claude Code", tool: "deploy", repo: "juan/barbershop-booking", summary: "Asked for approval: Deploy to production", outcome: "pending", at: ago(4) },
    { actor: "ai", client: "Claude Code", tool: "check_readiness", repo: "juan/barbershop-booking", summary: "5 of 8 checks passed", outcome: "ok", at: ago(20) },
    { actor: "learner", client: "Dashboard", tool: "set_secret", repo: "juan/barbershop-booking", summary: "Typed the value of RESEND_API_KEY on the dashboard (hidden)", outcome: "ok", at: ago(40) },
    { actor: "ai", client: "Cursor", tool: "get_logs", repo: "juan/barbershop-booking", summary: "Couldn't read the logs", outcome: "error", at: ago(90) },
    { actor: "ai", client: "Claude Code", tool: "setup_ci", repo: "juan/barbershop-booking", summary: "Opened PR #7 with 4 files", outcome: "ok", at: ago(120) },
  ],
  secrets: [{ repo: "juan/barbershop-booking", name: "RESEND_API_KEY", target: "github_actions", updatedAt: ago(40) }],
  mcp: { connected: true, client: "Claude Code", lastSeen: ago(4) },
};

export async function serveMe(page: Page, data: unknown = me) {
  await page.route("**/api/me", (route: Route) => route.fulfill({ json: data }));
}

// Wait until learner.ts has filled the page in.
export const loaded = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.loaded === "true");
