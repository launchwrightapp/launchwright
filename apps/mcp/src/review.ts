// review_pr: what a reviewer should look at first in a pull request, from its diff alone.
// Pure functions over the PR's files and patches, so they are easy to test.
//
// Launchwright doesn't review the code itself: the learner's own AI tool does, with the learner.
// These flags point both of them at the risky parts (secrets, data, access, CI, dependencies)
// so the review starts there. Patches come from the learner's repo: flags only ever contain our
// own fixed text plus file paths, and the diff goes back redacted and fenced as untrusted data.
import { looksLikeSecret } from "../../../packages/core/untrusted";
import type { Concept } from "../../../packages/core/curriculum";
import type { PullFile, Run } from "./github";
import { MIGRATIONS, apiRoutes, isSecretFile } from "./readiness";

export type Level = "stop" | "look";

export interface Flag {
  level: Level; // stop: fix or confirm before merging. look: read this part carefully.
  title: string;
  why: string;
  files: string[];
  concepts: Concept[];
}

const ENV_TEMPLATE = /(^|\/)\.(env|dev\.vars)\.(example|sample|template|dist)$/i;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(tests?|__tests__|e2e)\//;
const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/;
const ROUTE_DIR = /(^|\/)(api|routes|server|functions|middleware)(\/|\.[cm]?[jt]sx?$)/;
const PUBLIC_SECRET = /\b(NEXT_PUBLIC_|VITE_|PUBLIC_|NUXT_PUBLIC_|EXPO_PUBLIC_|REACT_APP_)\w*(SECRET|PRIVATE|PASSWORD|SERVICE_ROLE|TOKEN|DATABASE_URL)\w*/;
const DATA_LOSS = /\b(DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)|TRUNCATE|DELETE\s+FROM|RENAME\s+(COLUMN|TO)|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE)\b/i;
const UNSAFE_HTML = /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\s*\(|new\s+Function\s*\(|v-html=|set:html=|\{@html\s/;
const ONLY = /\b(it|test|describe)\.only\s*\(/;
const SKIP = /\b(it|test|describe)\.(skip|fixme|todo)\s*\(|\bx(it|describe)\s*\(/;
const INSTALL_SCRIPT = /^\s*"(preinstall|install|postinstall|prepare)"\s*:/;
const DEP_LINE = /^\s*"(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)"\s*:\s*"(?:[\^~<>=]*\d|\*|latest|workspace:|npm:|github:|git\+|https?:|file:)/i;
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
// A secret-named variable assigned a long quoted literal: `API_KEY = "a1b2c3..."`.
const HARDCODED = /\b\w*(secret|token|password|passwd|api_?key|private_?key|access_?key)\w*["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=.]{12,}["']/i;
const NOT_DEPS = new Set(["name", "version", "description", "main", "module", "types", "type", "license", "private", "node", "npm", "pnpm", "yarn", "bun", "packageManager"]);
const BIG = 600;

// Lines a patch adds (without the leading "+"), skipping the file headers.
export function addedLines(patch: string | null): string[] {
  if (!patch) return [];
  return patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
}

// Paths go into our own text: keep them on one line, without backticks.
export const safePath = (p: string) => p.replace(/[`\r\n\t]/g, "_").slice(0, 200);

export function reviewFlags(files: PullFile[]): Flag[] {
  const flags: Flag[] = [];
  const add = (level: Level, title: string, why: string, hits: string[], concepts: Concept[]) => {
    const unique = [...new Set(hits)].map(safePath);
    if (unique.length) flags.push({ level, title, why, files: unique.slice(0, 15), concepts });
  };
  const live = files.filter((f) => f.status !== "removed");
  const where = (test: (line: string) => boolean, pick: (f: PullFile) => boolean = () => true) =>
    live.filter((f) => pick(f) && addedLines(f.patch).some(test)).map((f) => f.path);

  // Secrets
  add("stop", "A secret file is in the change", "These files usually hold real passwords or keys. Take them out of the PR, add them to .gitignore, and rotate every key they held: pushing the branch already put them on GitHub.", live.filter((f) => isSecretFile(f.path)).map((f) => f.path), ["secrets"]);
  add("stop", "Something shaped like a key or password was added", "A value that looks like a secret is written in the code (it's hidden in the diff below). If it's real, move it to .env or the platform's secret storage and rotate it.", where((l) => looksLikeSecret(l) || HARDCODED.test(l), (f) => !ENV_TEMPLATE.test(f.path) && !isSecretFile(f.path)), ["secrets"]);
  add("stop", "A secret-sounding name in a public env var", "Variables starting with NEXT_PUBLIC_, VITE_, PUBLIC_ and similar are copied into the JavaScript every visitor downloads. If this value is secret, it's public now: read it only on the server instead. (Some keys are meant to be public, like a Supabase anon key; confirm which this is.)", where((l) => PUBLIC_SECRET.test(l) && !/ANON_KEY|PUBLISHABLE/.test(l)), ["secrets"]);

  // CI and dependencies
  const workflows = live.filter((f) => /^\.github\/workflows\//.test(f.path));
  add("stop", "CI runs untrusted code with secrets", "`pull_request_target` runs with the repo's secrets even for pull requests from strangers. Unless you're sure, use `pull_request` instead.", where((l) => /pull_request_target/.test(l), (f) => workflows.includes(f)), ["ci"]);
  add("look", "CI or deploy workflows changed", "A workflow change can switch checks off, change what gets deployed, or send secrets somewhere. Read every line: look at `permissions:`, new `secrets.` uses, and steps removed.", workflows.map((f) => f.path), ["ci"]);
  const pkgs = live.filter((f) => /(^|\/)package\.json$/.test(f.path));
  const deps = [...new Set(pkgs.flatMap((f) => addedLines(f.patch).map((l) => l.match(DEP_LINE)?.[1]).filter((n): n is string => !!n && NPM_NAME.test(n) && !NOT_DEPS.has(n))))];
  add("look", `New or updated dependencies${deps.length ? `: ${deps.slice(0, 12).join(", ")}` : ""}`, "Check each one is the package you meant (look-alike names are a real attack), that it's maintained, and that you need it at all. Every dependency is code you're trusting.", deps.length ? pkgs.map((f) => f.path) : [], []);
  add("stop", "An install script was added", "preinstall/postinstall/prepare scripts run automatically on every `npm install`, including in CI. Make sure you know exactly what it runs.", where((l) => INSTALL_SCRIPT.test(l), (f) => pkgs.includes(f)), []);
  if (!pkgs.length) add("look", "The lockfile changed without package.json", "Usually an update or a reinstall. Check it was meant to happen: a lockfile change alone can swap the versions you run.", live.filter((f) => LOCKFILE.test(f.path)).map((f) => f.path), []);

  // Tests
  add("stop", "A test is marked .only", "`.only` makes the test runner skip every other test, so CI goes green without testing most of the app. Remove it.", where((l) => ONLY.test(l), (f) => TEST_FILE.test(f.path)), ["e2e"]);
  add("look", "Tests were skipped", "A skipped test doesn't protect anything. Fix it, or write down why it's skipped and when it comes back.", where((l) => SKIP.test(l), (f) => TEST_FILE.test(f.path)), ["e2e"]);
  add("look", "Test files were deleted", "Make sure the behaviour they checked is gone too, or still tested somewhere else. AI tools sometimes delete a failing test instead of fixing the code.", files.filter((f) => f.status === "removed" && TEST_FILE.test(f.path)).map((f) => f.path), ["e2e"]);

  // Data and access
  const migrations = live.filter((f) => MIGRATIONS.test(f.path) || /(^|\/)schema\.prisma$/.test(f.path));
  add("stop", "A migration can delete or rewrite data", "DROP, TRUNCATE, DELETE, RENAME or a column type change can lose data, and a rollback won't bring it back. Back up first, try it on a development database, and check the old code still works with the new schema.", where((l) => DATA_LOSS.test(l), (f) => migrations.includes(f)), ["migrations", "rollback"]);
  add("look", "The database schema changes", "Check the migration matches the code that uses it, runs on an empty database and on one with data, and was tried on a development database first.", migrations.map((f) => f.path), ["migrations"]);
  const routes = live.filter((f) => !TEST_FILE.test(f.path) && (apiRoutes([f.path]).length > 0 || ROUTE_DIR.test(f.path)) && /\.[cm]?[jt]sx?$/.test(f.path));
  add("look", "API routes or server code changed", "For every route that reads or changes private data, check on the server: who is asking (authentication), and whether they may touch this exact record (authorization). Also check inputs are validated.", routes.map((f) => f.path), ["api_auth"]);
  add("look", "HTML or code built from strings", "Putting text into HTML (innerHTML, dangerouslySetInnerHTML, v-html, set:html) or running it as code (eval) lets an attacker run scripts if any of it comes from users. Make sure it never does, or sanitize it.", where((l) => UNSAFE_HTML.test(l)), []);

  // Size
  const lines = files.reduce((n, f) => n + f.additions + f.deletions, 0);
  if (lines > BIG || files.length > 40) flags.push({ level: "look", title: `A big change (${files.length} files, ${lines} lines)`, why: "Big PRs hide bugs because nobody reads all of it. Ask your AI tool to split it into smaller PRs that each do one thing.", files: [], concepts: [] });
  const hidden = files.filter((f) => f.patch === null && f.status !== "removed").map((f) => f.path);
  if (hidden.length) flags.push({ level: "look", title: "Some diffs aren't shown", why: "GitHub doesn't send diffs for binary or very large files. Open them on GitHub if they matter.", files: [...new Set(hidden)].slice(0, 15).map(safePath), concepts: [] });

  return flags.sort((a, b) => (a.level === b.level ? 0 : a.level === "stop" ? -1 : 1));
}

export interface CiSummary {
  state: "none" | "running" | "failed" | "passed";
  text: string;
}

// The workflow runs on the PR's latest commit: one line each, and the overall state.
export function ciSummary(runs: Run[]): CiSummary {
  if (!runs.length) return { state: "none", text: "No CI runs on this commit. Either CI isn't set up (setup_ci adds it), it hasn't started yet, or the PR comes from a fork and is waiting for approval to run." };
  const latest = new Map<string, Run>();
  for (const r of runs) if (!latest.has(r.name)) latest.set(r.name, r); // newest first: keep the latest run of each workflow
  const list = [...latest.values()];
  const failed = list.filter((r) => r.status === "completed" && r.conclusion !== "success" && r.conclusion !== "skipped" && r.conclusion !== "neutral");
  const running = list.filter((r) => r.status !== "completed");
  const lines = list.map((r) => `- ${r.name}: ${r.status === "completed" ? r.conclusion : r.status} · run ${r.id}`).join("\n");
  const state = failed.length ? "failed" : running.length ? "running" : "passed";
  return { state, text: lines };
}

export function reviewPull(files: PullFile[], runs: Run[]) {
  const flags = reviewFlags(files);
  const ci = ciSummary(runs);
  const concepts: Concept[] = ["code_review", "pull_requests", ...flags.flatMap((f) => f.concepts)];
  if (ci.state === "failed") concepts.push("logs");
  return { flags, ci, concepts: [...new Set(concepts)] };
}

// The diff for the AI tool: each file's patch, capped per file and in total. Raw text: the
// caller fences and redacts it with untrustedBlock.
export function diffText(files: PullFile[], perFile = 6000, total = 45000): { text: string; cut: number } {
  let used = 0;
  let cut = 0;
  const parts: string[] = [];
  for (const f of files) {
    const head = `### ${safePath(f.path)} (${f.status}, +${f.additions} -${f.deletions})`;
    if (used >= total) {
      cut++;
      continue;
    }
    let body = f.patch === null ? "(no diff: binary or too large)" : f.patch;
    if (body.length > perFile) body = body.slice(0, perFile) + `\n[... ${body.length - perFile} more characters in this file cut ...]`;
    const part = `${head}\n${body}`;
    used += part.length;
    parts.push(part);
  }
  return { text: parts.join("\n\n"), cut };
}
