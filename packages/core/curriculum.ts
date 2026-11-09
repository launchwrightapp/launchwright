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
    full: "Before changing anything, a production engineer checks what the app is made of: the framework, the package manager, the database, where it's hosted. Each one decides how you install, build, test and deploy. package.json, the lockfile and the config files at the root of the repo answer most of it.",
    short: "Stack first: framework, package manager, database and hosting decide every later step.",
  },
  pull_requests: {
    module: "git",
    title: "Working in pull requests",
    full: "A pull request (PR) proposes merging the changes on one branch into another, usually main. It's where you read the change and see CI's results before deciding. A PR alone doesn't stop anyone pushing straight to main: branch protection does, by requiring a PR and passing checks before anything merges. Launchwright never pushes to your main branch. It opens a PR and you decide.",
    short: "PRs: changes land on a branch first; branch protection makes review and checks required.",
  },
  env_config: {
    module: "env",
    title: "Documenting env config",
    full: "Your app reads settings from the environment: a database URL, an API key, a site URL. A .env.example file documents every one, with safe placeholder values and a note on which are required, so anyone (including your future self) can set the app up without guessing. It's documentation only: CI and production get their real values configured separately. Your local .env with real values stays out of git.",
    short: "Env config: .env.example documents every setting with placeholders; real values live elsewhere.",
  },
  secrets: {
    module: "env",
    title: "Secrets stay out of git",
    full: "Passwords and API keys never belong in the code. Git keeps every version, and copies of the repo may exist elsewhere, so a committed key is exposed even after you delete the file. First revoke or rotate it (make a new key, cancel the old one), then remove it from the code. .gitignore only stops new files from being added; it doesn't untrack a file that's already committed. Also watch frontend env vars: anything bundled into browser code is public, so it must never hold a secret.",
    short: "Secrets: never in git or frontend code; a leaked key gets rotated first, then removed.",
  },
  secret_storage: {
    module: "env",
    title: "Where production secrets live",
    full: "In production, secrets live in the platform's secret storage: Cloudflare Worker secrets, GitHub Actions secrets. You enter the value once in a secure form, and the dashboard won't show it again. Your app's code and your CI jobs can still read it when they run (that's the point), so keep those trusted. Launchwright's set_secret gives you a secure link to type the value in, so it never goes through the AI chat.",
    short: "Secret storage: enter it in a secure form, never in chat; your running code can still read it.",
  },
  env_drift: {
    module: "env",
    title: "Env drift",
    full: "Env drift is when the settings your code needs, the ones you documented, and the ones an environment actually has stop lining up. It's the classic \"works on my machine\" bug: a variable exists on your laptop but not in production, so the app crashes after deploy. Environments can differ on purpose (different databases, optional settings), but each one must have every setting it needs. Check before you ship.",
    short: "Env drift: each environment has every required setting, and the docs explain the differences.",
  },
  database: {
    module: "database",
    title: "Connecting a database",
    full: "A managed Postgres database (Neon or Supabase) runs on someone else's servers. Your app reaches it with a connection string: a URL that includes a password, so treat it as a secret and keep it out of the code. How you connect depends on your driver: serverless apps using a normal Postgres client should use the provider's pooled connection, while HTTP-based drivers handle this for you. Migration tools sometimes need the direct connection instead.",
    short: "Database: the connection string is a secret; pick the connection mode your driver needs.",
  },
  migrations: {
    module: "database",
    title: "Database migrations",
    full: "A migration is a file that changes the database schema: create a table, add a column. Keeping them in the repo, in order, means every database (yours, CI's, production's) gets the same structure, and every change is reviewed like code. Apply them with your migration tool and try them on a dev database first. Migrations rebuild the structure, not the data: for that you need backups.",
    short: "Migrations: schema changes are ordered files in the repo; data needs backups.",
  },
  ci: {
    module: "cicd",
    title: "Continuous integration",
    full: "CI is a computer that runs your checks automatically on the events you choose, usually every pull request and every push to main. With GitHub Actions it's a YAML file in .github/workflows. A failed check flags the change, but it only blocks merging if branch protection requires it. Turn that on so broken changes can't reach main.",
    short: "CI: checks run on every PR and push to main; require them before merging.",
  },
  secret_scanning: {
    module: "cicd",
    title: "Secret scanning",
    full: "A secret scanner (like gitleaks) reads your files and commit history looking for things shaped like keys: cloud keys, tokens, private keys, database URLs with passwords. The CI Launchwright sets up scans the whole history on every pull request and push to main, so a leaked key is usually caught early instead of months later by someone else. Scanners can miss unusual secrets, so don't rely on one alone.",
    short: "Secret scanning: gitleaks checks the history on every PR and push to main.",
  },
  e2e: {
    module: "testing",
    title: "End-to-end smoke tests",
    full: "Unit tests check pieces. An end-to-end (E2E) test opens the real app in a browser and uses it like a person would. Playwright does this. A small smoke test (does the home page load, does the main action show the right result) catches the bugs that only show up when everything is wired together. Always check the result, not just that a button could be clicked.",
    short: "E2E: Playwright opens the real app and checks the main flow gives the right result.",
  },
  preview_deploys: {
    module: "testing",
    title: "Preview deploys",
    full: "A preview deploy gives a pull request's change its own URL, so you (and your E2E tests) can try it before production. If the preview is broken, you fix it before merging. Preview URLs are usually public unless you protect them, and a preview may still talk to the same database as production, so use test data where you can.",
    short: "Previews: test a change at its own URL first; it may be public and share your data.",
  },
  deploy: {
    module: "deploy",
    title: "Deploying",
    full: "Deploying means building your app and putting that build where users can reach it. Deploying from CI (not your laptop) means every deploy runs the same steps, from a commit everyone can see, and it can be set to wait for the checks to pass first. Pin your dependencies with a lockfile so builds stay the same. The deploy log shows what happened.",
    short: "Deploy from CI: the same steps every time, from a known commit, after the checks pass.",
  },
  production_approval: {
    module: "deploy",
    title: "Approving production changes",
    full: "Launchwright asks a human before production deploys, rollbacks and replacing a saved secret. Your AI tool can prepare the change, but you approve it on the dashboard. Each approval works once, for that one action, and expires after a day. It gives you a chance to look at what's about to happen before it runs. Teams call this a change gate.",
    short: "Production changes wait for your approval on the dashboard; each approval works once.",
  },
  rollback: {
    module: "deploy",
    title: "Rollback",
    full: "A rollback puts a previous version of your app's code back. On Cloudflare every deploy is a version, so it's fast. It doesn't undo database changes: if the new version changed the schema or data, the old code may not work with it any more. When the old version is still compatible, roll back first and debug calmly; when it isn't, ship a careful fix forward instead.",
    short: "Rollback: restore the last good version, if it still works with your current data.",
  },
  logs: {
    module: "monitoring",
    title: "Reading logs",
    full: "Logs are what your app and your CI wrote while running. Find the failing run or request, then start at its first error, not the last line: later errors are often caused by the first one. Logs can hold user data and even secrets, so don't log them. Launchwright hides anything that looks like a key before showing logs, but that's a safety net, not a guarantee.",
    short: "Logs: find the failing run, then read from its first error down.",
  },
  reading_errors: {
    module: "monitoring",
    title: "Reading an error message",
    full: "Most error messages have three useful parts: the type (what kind of failure), the message (what went wrong), and the stack trace (where). Find the first line of the stack that points at your own code; that's usually where to look. Read the message before searching it, and remove keys, emails and IDs before you paste it anywhere.",
    short: "Errors: type, message, then the first stack line in your own code.",
  },
  uptime: {
    module: "monitoring",
    title: "Uptime checks",
    full: "An uptime check visits your site from outside every few minutes and alerts you when it stops answering. Without one, your users notice outages before you do. The one Launchwright adds checks your production URL every 15 minutes, and GitHub emails you when it fails. A page that answers doesn't prove every feature works, so keep your smoke tests too.",
    short: "Uptime: something outside your app checks it every few minutes and alerts you.",
  },
  readiness: {
    module: "security",
    title: "Production readiness",
    full: "Readiness checks look for common risks before real users arrive: secrets in the code, undocumented settings, missing tests on every PR, no browser test of the real app, no migrations, a deployed site without HTTPS, security headers or an uptime check. Passing them is a good baseline, not proof that the app is secure: you still need access checks on your data and backups you can restore. Fix one item at a time, starting with failures.",
    short: "Readiness: a baseline; fix failures first, then warnings, one at a time.",
  },
  api_auth: {
    module: "security",
    title: "Auth on API routes",
    full: "Every API route that reads or changes private data must check two things on the server: who is asking (authentication), and whether they're allowed to do this to this exact record (authorization). If a route only checks that someone is logged in, any user can change the ID in the request and read someone else's data. Hiding a button in the frontend isn't access control.",
    short: "API auth: on the server, check who is asking and whether they may touch this record.",
  },
  security_headers: {
    module: "security",
    title: "HTTPS and security headers",
    full: "HTTPS encrypts traffic between the browser and your app. Security headers tell the browser how to protect your users: HSTS (always use HTTPS), Content-Security-Policy (which scripts, styles and other resources may load, and with frame-ancestors, who may embed your pages) and X-Content-Type-Options (don't guess file types). Test them on your real app, since a strict policy can break features. Headers don't replace access checks.",
    short: "Headers: HSTS, CSP (with frame-ancestors) and nosniff, tested on your app.",
  },
  least_privilege: {
    module: "security",
    title: "Least privilege",
    full: "Give every key and every app only the access it needs, nothing more. A Cloudflare token that can only edit Workers can't delete your DNS, so if it leaks, less can go wrong. Launchwright asks for the smallest scopes it can. Disconnecting an account in Launchwright removes our copy; to cancel a key completely, revoke it with the provider too.",
    short: "Least privilege: smallest scopes; revoke keys at the provider when done.",
  },
  data_privacy: {
    module: "security",
    title: "The Data Privacy Act (RA 10173)",
    full: "If your app collects personal data (names, emails, phone numbers) and you or your users are in the Philippines, the Data Privacy Act likely applies. The basics: have a valid reason to process it (consent is the common one, not the only one), explain it in a privacy notice, collect only what you need, protect it, and respect people's rights to access and delete it. If a breach could cause serious harm, such as leaked sensitive data, you must tell the NPC and the affected people within 72 hours of finding out. Your database, logs and third-party services all count.",
    short: "RA 10173: a valid reason, a clear notice, minimal data, protection, and 72-hour breach reports.",
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
