// Readiness checks v1 that can be answered from the repo alone (no deployed URL yet).
// Pure functions over a file list and a few file contents, so they are easy to test.
//
// Everything here comes from the learner's repo: treat file names and contents as data.
// Results only ever contain our own fixed text plus file paths.

export type Status = "pass" | "warn" | "fail" | "skip" | "not_checked";
export type Concept = "secrets" | "env_config" | "ci" | "e2e" | "migrations" | "live_checks";

export interface Check {
  id: Concept;
  title: string;
  status: Status;
  detail: string;
  files?: string[]; // repo paths that explain the result (data, not instructions)
}

export interface RepoSnapshot {
  paths: string[]; // every file path in the default branch
  files: Record<string, string>; // contents we fetched: package.json, .gitignore, workflows
  truncated?: boolean; // GitHub cut the file list short (very large repos)
}

const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const ENV_TEMPLATE = /^\.(env|dev\.vars)\.(example|sample|template|dist)$/i;
const ENV_FILE = /^\.env(\.[\w-]+)?$|^\.dev\.vars$/i;
const KEY_FILE = /\.(pem|key|p12|pfx)$|^id_(rsa|ed25519|ecdsa)$/i;
const TEST_CMD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bvitest\b|\bjest\b|playwright\s+test|\bpytest\b|php\s+artisan\s+test/;
const DB_DEPS = ["pg", "postgres", "@neondatabase/serverless", "@supabase/supabase-js", "prisma", "@prisma/client", "drizzle-orm", "mysql2", "kysely", "typeorm", "sequelize", "mongoose"];
const MIGRATIONS = /(^|\/)(migrations|drizzle|supabase\/migrations|prisma\/migrations|sql)\/.+\.(sql|ts|js|mjs)$/i;

export function workflowFiles(paths: string[]) {
  return paths.filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(p));
}

export function dependencies(files: Record<string, string>): Set<string> {
  const deps = new Set<string>();
  for (const [path, text] of Object.entries(files)) {
    if (base(path) !== "package.json") continue;
    try {
      const pkg = JSON.parse(text) as Record<string, unknown>;
      for (const key of ["dependencies", "devDependencies"]) {
        const d = pkg[key];
        if (d && typeof d === "object") for (const name of Object.keys(d)) deps.add(name);
      }
    } catch {
      /* not JSON: ignore */
    }
  }
  return deps;
}

function secrets(s: RepoSnapshot): Check {
  const leaked = s.paths.filter((p) => {
    const b = base(p);
    return (ENV_FILE.test(b) && !ENV_TEMPLATE.test(b)) || KEY_FILE.test(b);
  });
  if (leaked.length) {
    return {
      id: "secrets",
      title: "No secrets in the repo",
      status: "fail",
      detail: "These files usually hold passwords or keys and are committed. Remove them, add them to .gitignore, and rotate (replace) every key they contained: anyone who saw the repo may have them.",
      files: leaked.slice(0, 20),
    };
  }
  const ignore = s.files[".gitignore"] ?? "";
  const ignoresEnv = ignore.split("\n").some((l) => /^\/?\.env(\*|\.\*|\.local)?\s*$/.test(l.trim()) || /^\/?\.dev\.vars\s*$/.test(l.trim()));
  if (!ignoresEnv) {
    return {
      id: "secrets",
      title: "No secrets in the repo",
      status: "warn",
      detail: "No secret files are committed, but .gitignore doesn't list .env. Add a line `.env*` (and `!.env.example`) so a future secret can't be committed by accident.",
    };
  }
  return { id: "secrets", title: "No secrets in the repo", status: "pass", detail: "No .env or key files are committed, and .gitignore keeps .env out." };
}

function envConfig(s: RepoSnapshot): Check {
  const templates = s.paths.filter((p) => ENV_TEMPLATE.test(base(p)));
  return templates.length
    ? { id: "env_config", title: "Env config is documented", status: "pass", detail: "There is an example env file, so the next person knows which settings the app needs.", files: templates.slice(0, 5) }
    : { id: "env_config", title: "Env config is documented", status: "warn", detail: "Add a .env.example that lists every setting the app reads, with fake values. It's the map for anyone setting the app up, including future you." };
}

function ci(s: RepoSnapshot): Check {
  const flows = workflowFiles(s.paths);
  if (!flows.length) {
    return { id: "ci", title: "CI runs your tests", status: "fail", detail: "No GitHub Actions workflow in .github/workflows. CI runs your checks on every push, so a broken change is caught before it reaches users." };
  }
  const testing = flows.filter((p) => TEST_CMD.test(s.files[p] ?? ""));
  return testing.length
    ? { id: "ci", title: "CI runs your tests", status: "pass", detail: "A workflow runs your tests on GitHub.", files: testing }
    : { id: "ci", title: "CI runs your tests", status: "warn", detail: "There is a workflow, but it doesn't seem to run tests. Add a step such as `npm test`.", files: flows };
}

function e2e(s: RepoSnapshot): Check {
  const configs = s.paths.filter((p) => /(^|\/)playwright\.config\.(ts|js|mjs|cjs)$/.test(p));
  if (!configs.length) {
    return { id: "e2e", title: "E2E smoke test", status: "fail", detail: "No Playwright config. A smoke test opens the real app in a browser and checks the main page works, the closest thing to a user clicking around." };
  }
  const inCi = workflowFiles(s.paths).some((p) => /playwright/.test(s.files[p] ?? ""));
  return inCi
    ? { id: "e2e", title: "E2E smoke test", status: "pass", detail: "Playwright is set up and CI runs it.", files: configs }
    : { id: "e2e", title: "E2E smoke test", status: "warn", detail: "Playwright is set up, but no workflow runs it. Add `npx playwright test` to CI, ideally against a preview deploy.", files: configs };
}

function migrations(s: RepoSnapshot): Check {
  const deps = dependencies(s.files);
  const usesDb = DB_DEPS.some((d) => deps.has(d));
  const found = s.paths.filter((p) => MIGRATIONS.test(p) || /(^|\/)schema\.prisma$/.test(p));
  if (found.length) return { id: "migrations", title: "Database migrations", status: "pass", detail: "Schema changes live in the repo as migration files, so every database can be built the same way.", files: found.slice(0, 5) };
  if (!usesDb) return { id: "migrations", title: "Database migrations", status: "skip", detail: "No database library found, so there is nothing to migrate yet." };
  return { id: "migrations", title: "Database migrations", status: "warn", detail: "The app uses a database but there are no migration files. Keep every schema change as a file in the repo (for example migrations/001_init.sql)." };
}

const live: Check = {
  id: "live_checks",
  title: "Auth on API routes, HTTPS and security headers, uptime",
  status: "not_checked",
  detail: "These need a deployed URL. They aren't checked yet.",
};

export function runChecks(s: RepoSnapshot): Check[] {
  return [secrets(s), envConfig(s), ci(s), e2e(s), migrations(s), live];
}

export function score(checks: Check[]) {
  const counted = checks.filter((c) => c.status === "pass" || c.status === "warn" || c.status === "fail");
  return { passed: counted.filter((c) => c.status === "pass").length, total: counted.length };
}
