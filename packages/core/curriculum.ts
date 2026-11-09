// The Level 1 curriculum: modules, and the concepts inside them.
// Tool calls teach concepts (the MCP server records them in lesson_progress); the platform
// shows the same modules with each learner's progress. One source for both.

export type ModuleId = "git" | "env" | "database" | "cicd" | "testing" | "deploy" | "monitoring" | "security";

export type Concept =
  | "project_status"
  | "pull_requests"
  | "env_config"
  | "secrets"
  | "secret_storage"
  | "env_drift"
  | "database"
  | "migrations"
  | "ci"
  | "secret_scanning"
  | "e2e"
  | "preview_deploys"
  | "deploy"
  | "production_approval"
  | "rollback"
  | "logs"
  | "reading_errors"
  | "uptime"
  | "readiness"
  | "api_auth"
  | "security_headers"
  | "least_privilege"
  | "data_privacy";

export interface Lesson {
  module: ModuleId;
  title: string;
  full: string; // first time
  short: string; // every time after
}

export interface Module {
  id: ModuleId;
  n: string;
  name: string;
  blurb: string;
  prompt: string | null; // the guided MCP prompt for this module
}

export const MODULES: Module[] = [
  { id: "git", n: "01", name: "Git and GitHub", blurb: "Know your stack, work in pull requests.", prompt: null },
  { id: "env", n: "02", name: "Env and secrets", blurb: "Settings outside the code, keys the AI never sees.", prompt: "lesson-secrets" },
  { id: "database", n: "03", name: "Database", blurb: "Neon or Supabase, connection strings, migrations.", prompt: "lesson-database" },
  { id: "cicd", n: "04", name: "CI/CD", blurb: "Checks on every push, secret scanning.", prompt: "lesson-ci" },
  { id: "testing", n: "05", name: "Testing", blurb: "Playwright on a preview deploy.", prompt: "lesson-ci" },
  { id: "deploy", n: "06", name: "Deploy", blurb: "Previews, production with approval, rollback.", prompt: "lesson-deploy" },
  { id: "monitoring", n: "07", name: "Monitoring", blurb: "Logs, reading errors, uptime.", prompt: "lesson-debug" },
  { id: "security", n: "08", name: "Security", blurb: "Auth, headers, least privilege, the Data Privacy Act.", prompt: "lesson-security" },
];

export const LESSONS: Record<Concept, Lesson> = {
  project_status: {
    module: "git",
    title: "Knowing your stack",
    full: "Before changing anything, a production engineer checks what the app is made of: the framework, the package manager, the database, where it's hosted. Each one decides how you install, build, test and deploy. Reading package.json and the config files at the root of the repo answers most of it.",
    short: "Stack first: framework, package manager, database and hosting decide every later step.",
  },
  pull_requests: {
    module: "git",
    title: "Working in pull requests",
    full: "A pull request (PR) is a proposed change on its own branch. Nothing reaches main until you read it and merge it. Launchwright never pushes to your main branch: it opens a PR, CI runs on it, and you decide. That's how teams keep main working.",
    short: "PRs: changes land on a branch first; you review and merge.",
  },
  env_config: {
    module: "env",
    title: "Documenting env config",
    full: "Your app reads settings from the environment: a database URL, an API key, a site URL. A .env.example file lists every one with a fake value, so anyone (including your CI and your future self) can set the app up without guessing. The real .env stays on your machine.",
    short: "Env config: .env.example lists every setting, with fake values.",
  },
  secrets: {
    module: "env",
    title: "Secrets stay out of git",
    full: "Passwords and API keys belong in environment variables, not in the code. Git keeps every version forever, so a key that was committed once is exposed even after you delete the file: remove it, then rotate it (make a new key and revoke the old one). .gitignore stops it happening again.",
    short: "Secrets: env vars only; a committed key must be rotated, not just deleted.",
  },
  secret_storage: {
    module: "env",
    title: "Where production secrets live",
    full: "In production, secrets are stored by the platform that runs your code: Cloudflare keeps Worker secrets encrypted, GitHub keeps Actions secrets encrypted. You type the value once into a secure form; after that nobody can read it back, not even you. Your AI tool asks for a secret by name, never by value.",
    short: "Secret storage: set once in a secure form; the AI only ever knows the name.",
  },
  env_drift: {
    module: "env",
    title: "Env drift",
    full: "Env drift is when the settings your code reads, the ones you documented, and the ones production actually has stop matching. It's the classic \"works on my machine\" bug: a variable exists on your laptop but not in production, so the app crashes after deploy. Compare all three before you ship.",
    short: "Env drift: code, .env.example and production must list the same settings.",
  },
  database: {
    module: "database",
    title: "Connecting a database",
    full: "A managed Postgres database (Neon or Supabase) runs on someone else's servers; your app reaches it with a connection string, a URL that includes a password. That string is a secret: it goes into the environment, never into the code. Use a pooled connection for serverless apps, since every request may open a new connection.",
    short: "Database: the connection string is a secret; use the pooled one for serverless.",
  },
  migrations: {
    module: "database",
    title: "Database migrations",
    full: "A migration is a file that changes the database schema: create a table, add a column. Keeping them in the repo, numbered and in order, means every database (yours, CI's, production's) can be built the same way, and every change is reviewed like code.",
    short: "Migrations: schema changes are numbered files in the repo.",
  },
  ci: {
    module: "cicd",
    title: "Continuous integration",
    full: "CI is a computer that runs your checks every time you push. With GitHub Actions it's a YAML file in .github/workflows. If the tests fail, the change is flagged before anyone merges it, so main stays deployable.",
    short: "CI: every push runs the tests, so main stays deployable.",
  },
  secret_scanning: {
    module: "cicd",
    title: "Secret scanning",
    full: "A secret scanner (like gitleaks) reads every commit in your history looking for things shaped like keys: AWS keys, tokens, private keys, database URLs with passwords. Running it in CI means a leaked key is caught on the push, not months later by someone else.",
    short: "Secret scanning: gitleaks checks the whole history on every push.",
  },
  e2e: {
    module: "testing",
    title: "End-to-end smoke tests",
    full: "Unit tests check pieces; an end-to-end (E2E) test opens the real app in a browser and clicks through it like a user. Playwright does this. A small smoke test (does the home page load, does the main button work) catches the bugs that only show up when everything is wired together.",
    short: "E2E: Playwright opens the real app and checks the main flow works.",
  },
  preview_deploys: {
    module: "testing",
    title: "Preview deploys",
    full: "A preview deploy is a private copy of your app built from a pull request, with its own URL. You (and your E2E tests) try the change there before it touches production. If the preview is broken, production never sees it.",
    short: "Previews: every PR gets its own URL to test before production.",
  },
  deploy: {
    module: "deploy",
    title: "Deploying",
    full: "Deploying means building your app and putting that build where users can reach it. Doing it from CI (not your laptop) means every deploy is built the same way, from a commit everyone can see, with the tests already passed. The deploy log tells you exactly what happened.",
    short: "Deploy from CI: same build every time, from a known commit.",
  },
  production_approval: {
    module: "deploy",
    title: "Approving production changes",
    full: "Anything that changes what real users see, or that can't be undone, needs a human to say yes. Your AI tool can prepare a production deploy, but you approve it in the dashboard. Teams call this a change gate; it's why one bad prompt can't take your app down.",
    short: "Production needs your approval in the dashboard; the AI can only ask.",
  },
  rollback: {
    module: "deploy",
    title: "Rollback",
    full: "A rollback puts the previous working version back. On Cloudflare every deploy is a version, so rolling back is fast: you don't fix forward under pressure, you restore the last good version first, then debug calmly.",
    short: "Rollback first, debug second.",
  },
  logs: {
    module: "monitoring",
    title: "Reading logs",
    full: "Logs are what your app and your CI wrote while running. Start at the first error, not the last line: later errors are often caused by the first one. Logs can contain user data and even secrets, so Launchwright hides anything that looks like a key before showing them.",
    short: "Logs: read from the first error down.",
  },
  reading_errors: {
    module: "monitoring",
    title: "Reading an error message",
    full: "An error message has three useful parts: the type (what kind of failure), the message (what went wrong), and the stack trace (where). Find the first line of the stack that points at your own code; that's usually where to look. Search the exact message only after you've read it.",
    short: "Errors: type, message, then the first stack line in your own code.",
  },
  uptime: {
    module: "monitoring",
    title: "Uptime checks",
    full: "An uptime check visits your site every few minutes and tells you when it stops answering. Without one, your users notice outages before you do. A good check hits a page that touches the database, so it fails when the app is really broken.",
    short: "Uptime: something outside your app checks it every few minutes.",
  },
  readiness: {
    module: "security",
    title: "Production readiness",
    full: "An app is ready for real users when it keeps working while you change it. That means no secrets in the code, settings written down, tests that run on every push, a browser test of the real app, a database you can rebuild from files, and a deployed site that is secure and watched. Fix one item at a time, starting with failures.",
    short: "Readiness: fix failures first, then warnings, one at a time.",
  },
  api_auth: {
    module: "security",
    title: "Auth on API routes",
    full: "Every API route that reads or changes private data must check who is asking. If a route answers without a session or token, anyone on the internet can call it directly, no UI needed. The check belongs on the server, in the route (or a middleware in front of it), never only in the frontend.",
    short: "API auth: check the session on the server, in every private route.",
  },
  security_headers: {
    module: "security",
    title: "HTTPS and security headers",
    full: "HTTPS encrypts traffic between the browser and your app. Security headers tell the browser how to protect your users: HSTS (always use HTTPS), Content-Security-Policy (which scripts may run), X-Content-Type-Options (don't guess file types) and a frame policy (don't let other sites embed you).",
    short: "Headers: HSTS, CSP, nosniff and a frame policy on every page.",
  },
  least_privilege: {
    module: "security",
    title: "Least privilege",
    full: "Give every key and every app only the access it needs, nothing more. A Cloudflare token that can only edit Workers can't delete your DNS. If it leaks, the damage is small. Launchwright asks for the smallest scopes, and you can disconnect any account at any time.",
    short: "Least privilege: smallest scopes, easy to revoke.",
  },
  data_privacy: {
    module: "security",
    title: "The Data Privacy Act (RA 10173)",
    full: "If your app stores personal data of people in the Philippines (names, emails, phone numbers), the Data Privacy Act applies. The basics: collect only what you need, say why in a privacy notice, get consent, protect it (encryption, access control), and report breaches to the NPC within 72 hours. Your database and logs count.",
    short: "RA 10173: collect less, explain why, protect it, report breaches in 72h.",
  },
};

export const CONCEPTS = Object.keys(LESSONS) as Concept[];
export const isConcept = (s: string): s is Concept => s in LESSONS;
export const conceptsIn = (m: ModuleId) => CONCEPTS.filter((c) => LESSONS[c].module === m);

export interface ModuleProgress extends Module {
  concepts: { id: Concept; title: string; full: string; done: boolean }[];
  done: number;
  total: number;
  status: "done" | "current" | "next";
}

// Progress per module from the concepts a learner has seen. The first unfinished module is "current".
export function progress(seen: Iterable<string>): ModuleProgress[] {
  const s = new Set(seen);
  let current = false;
  return MODULES.map((m) => {
    const concepts = conceptsIn(m.id).map((id) => ({ id, title: LESSONS[id].title, full: LESSONS[id].full, done: s.has(id) }));
    const done = concepts.filter((c) => c.done).length;
    let status: ModuleProgress["status"] = "next";
    if (done === concepts.length) status = "done";
    else if (!current) {
      status = "current";
      current = true;
    }
    return { ...m, concepts, done, total: concepts.length, status };
  });
}
