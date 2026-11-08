// Sample data for the v0.1 dashboard mockup. Nothing here is real.

export const project = {
  name: "barbershop-booking",
  framework: "Next.js",
  url: "barbershop.juan.dev",
  repo: "juan/barbershop-booking",
  commit: "a41f9c2",
  deployedAgo: "2h ago",
  branch: "main",
  stack: "Cloudflare + Neon",
  preview: "Preview ready",
  user: { name: "Juan D.", first: "Juan", initials: "JD" },
};

export type CheckStatus = "pass" | "fail" | "pending";
export interface Check {
  id: string;
  name: string;
  status: CheckStatus;
  simple: string; // what it means, plain words
  tech: string; // what we actually run
  why: string;
  fix?: { simple: string; prompt: string; command: string };
}

export const checks: Check[] = [
  { id: "secrets", name: "No secrets in repo", status: "pass", simple: "No passwords or API keys are saved in your code.", tech: "gitleaks detect on full git history, every push.", why: "Anyone who can read your repo could use a leaked key, even if you delete it later." },
  { id: "env", name: "Environment config", status: "pass", simple: "Your app's settings are stored outside the code.", tech: "All process.env reads have a value in production and preview; .env* is git-ignored.", why: "Settings change between your laptop, previews, and production. Keeping them out of code means one build works everywhere." },
  { id: "ci", name: "CI pipeline with tests", status: "pass", simple: "Your tests run automatically every time you push.", tech: "GitHub Actions workflow runs typecheck + tests on pull_request and push to main.", why: "You find mistakes before your users do." },
  { id: "e2e", name: "Playwright E2E on preview deploy", status: "pass", simple: "A robot clicks through your app on a test copy before it goes live.", tech: "Playwright smoke suite runs against the PR preview URL.", why: "Some bugs only appear on a real deploy, not on your laptop." },
  {
    id: "auth", name: "Auth on API routes", status: "fail",
    simple: "Anyone on the internet can call /api/bookings without logging in.",
    tech: "POST /api/bookings returned 200 to an unauthenticated request (no session or bearer token).",
    why: "Strangers could create, read, or delete bookings, including customers' phone numbers.",
    fix: {
      simple: "Ask your AI tool to add a login check to the route. Launchwright explains each change as it goes.",
      prompt: "Use launchwright to fix the failing auth check on /api/bookings",
      command: "check_readiness --fix auth",
    },
  },
  { id: "migrations", name: "Database migrations", status: "pass", simple: "Database changes are saved as files you can review and undo.", tech: "drizzle-kit migrations in /drizzle; applied in CI before deploy.", why: "You can see exactly what changed and roll back if something breaks." },
  { id: "https", name: "HTTPS and security headers", status: "pass", simple: "Your site uses a secure connection and blocks common attacks.", tech: "HSTS, CSP, X-Content-Type-Options, Referrer-Policy present on /.", why: "Browsers protect your users better when your site tells them how." },
  {
    id: "uptime", name: "Uptime check", status: "pending",
    simple: "Nothing tells you yet when your site goes down.",
    tech: "No uptime monitor configured for barbershop.juan.dev.",
    why: "Without it, your customers find out before you do.",
    fix: { simple: "Set up a free check that emails you if the site stops responding.", prompt: "Use launchwright to set up an uptime check for my site", command: "check_readiness --fix uptime" },
  },
];
export const passing = checks.filter((c) => c.status === "pass").length;

export type ModuleStatus = "done" | "current" | "next";
export const modules: { n: string; name: string; status: ModuleStatus; concepts: number; total: number; blurb: string }[] = [
  { n: "01", name: "Git and GitHub", status: "done", concepts: 4, total: 4, blurb: "Commits, branches, pull requests." },
  { n: "02", name: "Env and secrets", status: "done", concepts: 3, total: 3, blurb: "Keep keys out of code." },
  { n: "03", name: "Database", status: "done", concepts: 4, total: 4, blurb: "Neon, schemas, migrations." },
  { n: "04", name: "CI/CD", status: "done", concepts: 3, total: 3, blurb: "Tests on every push." },
  { n: "05", name: "Testing", status: "done", concepts: 3, total: 3, blurb: "Playwright on a preview deploy." },
  { n: "06", name: "Security", status: "current", concepts: 2, total: 4, blurb: "Auth, headers, least privilege." },
  { n: "07", name: "Deploy", status: "next", concepts: 1, total: 3, blurb: "Previews, production, rollback." },
  { n: "08", name: "Monitoring", status: "next", concepts: 0, total: 3, blurb: "Logs, uptime, alerts." },
];
export const modulesDone = modules.filter((m) => m.status === "done").length;
export const conceptsCovered = modules.reduce((n, m) => n + m.concepts, 0);

export const audit: { time: string; tool: string; client: string; result: string; tone?: "ok" | "warn" }[] = [
  { time: "14:02", tool: "deploy", client: "Claude Code", result: "Waiting for your approval", tone: "warn" },
  { time: "13:48", tool: "check_readiness", client: "Claude Code", result: "6 of 8 checks passed" },
  { time: "13:40", tool: "set_secret", client: "Cursor", result: "RESEND_API_KEY saved (value hidden)" },
  { time: "12:15", tool: "get_logs", client: "Claude Code", result: "3 errors, 1 explained" },
  { time: "11:57", tool: "setup_ci", client: "Claude Code", result: "Done", tone: "ok" },
];

export const connections: { name: string; detail: string; scope: string; on: boolean }[] = [
  { name: "GitHub", detail: "juan/barbershop-booking", scope: "Contents, Actions, Pull requests (1 repo)", on: true },
  { name: "Cloudflare", detail: "Workers · 1 project", scope: "Workers Scripts: Edit (1 account)", on: true },
  { name: "Neon", detail: "main + 2 preview branches", scope: "Project-scoped API key", on: true },
  { name: "Supabase", detail: "Optional", scope: "Not connected", on: false },
];

export const secrets: { name: string; where: string; updated: string }[] = [
  { name: "DATABASE_URL", where: "Production, Preview", updated: "3 days ago" },
  { name: "RESEND_API_KEY", where: "Production", updated: "today" },
  { name: "SESSION_SECRET", where: "Production, Preview", updated: "3 days ago" },
];

export const approval = {
  title: "Migration drops a column",
  client: "Claude Code",
  tool: "deploy",
  ago: "4 min ago",
  diff: "- ALTER TABLE bookings DROP COLUMN phone;",
  simple: "This deletes the phone numbers saved in 132 bookings. You can only get them back from a backup.",
  tech: "Destructive migration (DROP COLUMN) on bookings, 132 rows affected. Last backup: 06:00 today (PITR available, 7 days).",
};

// The lesson behind the current blocker (shown in the lesson panel).
export const lesson = {
  module: "06",
  area: "Security",
  minutes: 8,
  title: "Add login checks to your API",
  steps: [
    { simple: "What \"logged in\" means to a server", tech: "Sessions vs bearer tokens" },
    { simple: "Find the routes anyone can call", tech: "Enumerate unauthenticated handlers" },
    { simple: "Add the check with your AI tool", tech: "Middleware guard on /api/*" },
    { simple: "Run the check again", tech: "check_readiness auth → expect 401" },
  ],
};

// Plain-language summary of recent events. The raw tool log lives in the bottom panel.
export type EventKind = "action" | "approval" | "lesson" | "problem";
export const events: { kind: EventKind; time: string; simple: string; tech: string }[] = [
  { kind: "approval", time: "14:02", simple: "Claude Code wants to change your database. It's waiting for you.", tech: "deploy → destructive migration held for approval" },
  { kind: "problem", time: "13:48", simple: "Readiness check found an API anyone can use without logging in.", tech: "check_readiness: auth failed on POST /api/bookings (200, expected 401)" },
  { kind: "action", time: "13:40", simple: "Cursor saved your email service key. The AI never saw it.", tech: "set_secret RESEND_API_KEY (production), value redacted" },
  { kind: "lesson", time: "12:15", simple: "You learned how to read error logs.", tech: "get_logs: 3 errors, concept logs.reading covered" },
  { kind: "action", time: "11:57", simple: "Your tests now run every time you push.", tech: "setup_ci: .github/workflows/ci.yml created" },
];

// Short labels for the readiness chart.
export const checkShort: Record<string, string> = {
  secrets: "Secrets", env: "Env", ci: "CI", e2e: "E2E", auth: "Auth", migrations: "DB", https: "HTTPS", uptime: "Uptime",
};
