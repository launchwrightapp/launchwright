// GitHub, with the learner's own token (a GitHub App user token: it can only touch repos the
// learner installed the app on). Reads: repo files, Actions runs and logs. Writes: a branch and a
// pull request (never a push to the default branch), Actions secrets, workflow dispatch.
//
// Needs these GitHub App permissions: Contents (read & write), Pull requests (read & write),
// Workflows (read & write), Actions (read & write), Secrets (read & write), Metadata (read).
import { workflowFiles, workspaceGlobs, workspacePackageFiles, type RepoSnapshot } from "./readiness";
import { sealedBox, fromB64, toB64 } from "./sealedbox";

export const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const MAX_FILE = 64 * 1024; // skip anything bigger: we only read small config and source files
const MAX_WORKFLOWS = 10;
const MAX_WORKSPACE_PACKAGES = 20;
const WRANGLER = /(^|\/)wrangler\.(jsonc?|toml)$/;

export class RepoError extends Error {}

export type Snapshot = RepoSnapshot & { repo: string; branch: string; private: boolean };

export function api(token: string) {
  return (path: string, init: { method?: string; body?: unknown; accept?: string } = {}) =>
    fetch(`https://api.github.com${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: init.accept ?? "application/vnd.github+json",
        "user-agent": "launchwright-mcp",
        "x-github-api-version": "2022-11-28",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
}

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

function explain(status: number, repo: string, what: string): RepoError {
  if (status === 401) return new RepoError("Your GitHub sign-in expired. Reconnect Launchwright in your AI tool.");
  if (status === 403) return new RepoError(`GitHub didn't allow ${what} on ${repo}. Install the Launchwright GitHub App on this repo (or accept its updated permissions) at https://github.com/apps/launchwright/installations/new`);
  if (status === 404) return new RepoError(`Launchwright can't see ${repo}. Check the name. If the repo is private, install the Launchwright GitHub App on it.`);
  return new RepoError(`GitHub answered ${status} while ${what}. Please try again in a minute.`);
}

export async function readRepo(repo: string, token: string): Promise<Snapshot> {
  if (!REPO_RE.test(repo)) throw new RepoError("Use the form owner/name, for example octocat/hello-world.");
  const gh = api(token);

  const info = await gh(`/repos/${repo}`);
  if (!info.ok) throw explain(info.status, repo, "reading the repo");
  const meta = (await info.json()) as { default_branch: string; private: boolean; full_name: string };

  const treeRes = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`);
  if (treeRes.status === 409) return { repo: meta.full_name, branch: meta.default_branch, private: meta.private, paths: [], files: {} }; // empty repo
  if (!treeRes.ok) throw new RepoError(`Couldn't list the files in ${repo} (GitHub answered ${treeRes.status}).`);
  const tree = (await treeRes.json()) as { tree: { path: string; type: string; size?: number }[]; truncated: boolean };
  const blobs = tree.tree.filter((t) => t.type === "blob");
  const paths = blobs.map((t) => t.path);
  const size = new Map(blobs.map((t) => [t.path, t.size ?? 0]));

  const snap: Snapshot = { repo: meta.full_name, branch: meta.default_branch, private: meta.private, paths, files: {}, sizes: Object.fromEntries(size), truncated: tree.truncated };
  const fetchFiles = (list: string[]) => readFiles(token, snap, list.filter((p) => size.has(p) && size.get(p)! <= MAX_FILE));
  const wrangler = paths.filter((p) => WRANGLER.test(p) && !p.includes("node_modules/")).slice(0, 8);
  await fetchFiles(["package.json", "pnpm-workspace.yaml", ".gitignore", ...wrangler, ...workflowFiles(paths).slice(0, MAX_WORKFLOWS)]);
  // Monorepo: the framework and database usually live in the workspace packages, not the root.
  const globs = workspaceGlobs(snap.files["package.json"], snap.files["pnpm-workspace.yaml"]);
  if (globs.length) await fetchFiles(workspacePackageFiles(paths, globs).slice(0, MAX_WORKSPACE_PACKAGES));
  return snap;
}

// Fetch more files into a snapshot (raw contents, default branch). Missing files are skipped.
export async function readFiles(token: string, snap: Snapshot, list: string[]) {
  const gh = api(token);
  await Promise.all(
    list
      .filter((p) => !(p in snap.files))
      .map(async (p) => {
        const r = await gh(`/repos/${snap.repo}/contents/${enc(p)}?ref=${encodeURIComponent(snap.branch)}`, { accept: "application/vnd.github.raw+json" });
        if (r.ok) snap.files[p] = (await r.text()).slice(0, MAX_FILE);
      }),
  );
}

const utf8b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export interface PullRequest {
  url: string;
  number: number;
  branch: string;
}

// Commit files to a new branch off the default branch and open a pull request.
// `executable` files (git hooks) get a follow-up commit setting mode 100755: the contents API
// always writes 100644, and git ignores a hook that isn't executable.
export async function openPullRequest(
  token: string,
  snap: Snapshot,
  pr: { branch: string; title: string; body: string; message: string; files: { path: string; content: string; executable?: boolean }[] },
): Promise<PullRequest> {
  const gh = api(token);
  const ref = await gh(`/repos/${snap.repo}/git/ref/heads/${enc(snap.branch)}`);
  if (!ref.ok) throw explain(ref.status, snap.repo, "reading the default branch");
  const sha = ((await ref.json()) as { object: { sha: string } }).object.sha;

  let branch = pr.branch;
  let made = await gh(`/repos/${snap.repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha } });
  if (made.status === 422) {
    branch = `${pr.branch}-${Date.now().toString(36)}`;
    made = await gh(`/repos/${snap.repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha } });
  }
  if (!made.ok) throw explain(made.status, snap.repo, "creating a branch");

  let last: { commit: string; tree: string } | null = null;
  const exec: { path: string; blob: string }[] = [];
  for (const f of pr.files) {
    const existing = await gh(`/repos/${snap.repo}/contents/${enc(f.path)}?ref=${encodeURIComponent(branch)}`);
    const fileSha = existing.ok ? ((await existing.json()) as { sha?: string }).sha : undefined;
    const put = await gh(`/repos/${snap.repo}/contents/${enc(f.path)}`, {
      method: "PUT",
      body: { message: pr.message, content: utf8b64(f.content), branch, ...(fileSha ? { sha: fileSha } : {}) },
    });
    if (!put.ok) throw explain(put.status, snap.repo, `writing ${f.path} (workflow files need the Workflows permission)`);
    const out = (await put.json().catch(() => ({}))) as { content?: { sha?: string }; commit?: { sha?: string; tree?: { sha?: string } } };
    if (out.commit?.sha && out.commit.tree?.sha) last = { commit: out.commit.sha, tree: out.commit.tree.sha };
    if (f.executable && out.content?.sha) exec.push({ path: f.path, blob: out.content.sha });
  }
  if (exec.length && last) {
    const tree = await gh(`/repos/${snap.repo}/git/trees`, { method: "POST", body: { base_tree: last.tree, tree: exec.map((e) => ({ path: e.path, mode: "100755", type: "blob", sha: e.blob })) } });
    if (!tree.ok) throw explain(tree.status, snap.repo, "marking the git hook executable");
    const commit = await gh(`/repos/${snap.repo}/git/commits`, { method: "POST", body: { message: `Make ${exec.map((e) => e.path).join(", ")} executable`, tree: ((await tree.json()) as { sha: string }).sha, parents: [last.commit] } });
    if (!commit.ok) throw explain(commit.status, snap.repo, "marking the git hook executable");
    const moved = await gh(`/repos/${snap.repo}/git/refs/heads/${enc(branch)}`, { method: "PATCH", body: { sha: ((await commit.json()) as { sha: string }).sha } });
    if (!moved.ok) throw explain(moved.status, snap.repo, "marking the git hook executable");
  }

  const opened = await gh(`/repos/${snap.repo}/pulls`, { method: "POST", body: { title: pr.title, head: branch, base: snap.branch, body: pr.body } });
  if (!opened.ok) throw explain(opened.status, snap.repo, "opening the pull request");
  const p = (await opened.json()) as { html_url: string; number: number };
  return { url: p.html_url, number: p.number, branch };
}

export async function listActionsSecrets(token: string, repo: string): Promise<string[]> {
  const r = await api(token)(`/repos/${repo}/actions/secrets?per_page=100`);
  if (!r.ok) throw explain(r.status, repo, "listing Actions secrets");
  return ((await r.json()) as { secrets: { name: string }[] }).secrets.map((s) => s.name);
}

export async function putActionsSecret(token: string, repo: string, name: string, value: string) {
  const gh = api(token);
  const k = await gh(`/repos/${repo}/actions/secrets/public-key`);
  if (!k.ok) throw explain(k.status, repo, "reading the repo's secret key");
  const { key_id, key } = (await k.json()) as { key_id: string; key: string };
  const encrypted = toB64(sealedBox(new TextEncoder().encode(value), fromB64(key)));
  const put = await gh(`/repos/${repo}/actions/secrets/${encodeURIComponent(name)}`, { method: "PUT", body: { encrypted_value: encrypted, key_id } });
  if (!put.ok) throw explain(put.status, repo, `saving the ${name} secret`);
}

export interface Run {
  id: number;
  name: string;
  status: string; // queued, in_progress, completed
  conclusion: string | null; // success, failure, cancelled...
  branch: string;
  sha: string;
  event: string;
  url: string;
  createdAt: string;
}

const toRun = (r: Record<string, unknown>): Run => ({
  id: r.id as number,
  name: (r.name as string) ?? "workflow",
  status: r.status as string,
  conclusion: (r.conclusion as string | null) ?? null,
  branch: r.head_branch as string,
  sha: String(r.head_sha).slice(0, 7),
  event: r.event as string,
  url: r.html_url as string,
  createdAt: r.created_at as string,
});

export async function listRuns(token: string, repo: string, opts: { workflow?: string; per?: number } = {}): Promise<Run[]> {
  const path = opts.workflow ? `/repos/${repo}/actions/workflows/${encodeURIComponent(opts.workflow)}/runs` : `/repos/${repo}/actions/runs`;
  const r = await api(token)(`${path}?per_page=${opts.per ?? 5}`);
  if (r.status === 404 && opts.workflow) return [];
  if (!r.ok) throw explain(r.status, repo, "listing workflow runs");
  return ((await r.json()) as { workflow_runs: Record<string, unknown>[] }).workflow_runs.map(toRun);
}

// The log of each job in a run, failed jobs first. Raw text: the caller must redact it.
export async function runLogs(token: string, repo: string, runId: number, maxJobs = 3): Promise<{ job: string; conclusion: string | null; log: string }[]> {
  const gh = api(token);
  const jr = await gh(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=30`);
  if (!jr.ok) throw explain(jr.status, repo, "reading the run's jobs");
  const jobs = ((await jr.json()) as { jobs: { id: number; name: string; conclusion: string | null }[] }).jobs;
  const order = (c: string | null) => (c === "failure" ? 0 : c === null ? 1 : 2);
  const picked = jobs.sort((a, b) => order(a.conclusion) - order(b.conclusion)).slice(0, maxJobs);
  return Promise.all(
    picked.map(async (j) => {
      // Redirects to a short-lived storage URL; fetch drops our Authorization header on the way.
      const lr = await gh(`/repos/${repo}/actions/jobs/${j.id}/logs`);
      return { job: j.name, conclusion: j.conclusion, log: lr.ok ? await lr.text() : `(log not available: GitHub answered ${lr.status})` };
    }),
  );
}

// The commit a branch points at right now (production approvals are tied to it).
export async function branchHead(token: string, repo: string, ref: string): Promise<{ sha: string; message: string }> {
  const r = await api(token)(`/repos/${repo}/commits/${enc(ref)}`);
  if (r.status === 404 || r.status === 422) throw new RepoError(`${repo} has no branch called ${ref}.`);
  if (!r.ok) throw explain(r.status, repo, `reading the latest commit on ${ref}`);
  const c = (await r.json()) as { sha: string; commit?: { message?: string } };
  return { sha: c.sha, message: (c.commit?.message ?? "").split("\n")[0].slice(0, 120) };
}

export async function dispatchWorkflow(token: string, repo: string, workflow: string, ref: string, inputs: Record<string, string>) {
  const r = await api(token)(`/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { method: "POST", body: { ref, inputs } });
  if (r.status === 404) throw new RepoError(`${repo} has no .github/workflows/${workflow} on ${ref} yet. Run setup_ci and merge its pull request first.`);
  if (!r.ok) throw explain(r.status, repo, "starting the deploy workflow");
}

// A repo Actions variable (not secret), e.g. PRODUCTION_URL for the smoke test.
export async function setVariable(token: string, repo: string, name: string, value: string) {
  const gh = api(token);
  let r = await gh(`/repos/${repo}/actions/variables`, { method: "POST", body: { name, value } });
  if (r.status === 409) r = await gh(`/repos/${repo}/actions/variables/${encodeURIComponent(name)}`, { method: "PATCH", body: { name, value } });
  if (!r.ok) throw explain(r.status, repo, `saving the ${name} variable`);
}

// Is the branch protected, and does it require a pull request and passing checks? Rulesets are
// fully visible with read access; classic branch protection only says "protected" (its details
// need the Administration permission, which Launchwright doesn't ask for). null: couldn't tell.
export interface Protection {
  protected: boolean;
  requiresPr: boolean | null; // null: classic protection, details hidden
  requiredChecks: string[] | null;
}

export async function branchProtection(token: string, repo: string, branch: string): Promise<Protection | null> {
  const gh = api(token);
  try {
    const [b, r] = await Promise.all([gh(`/repos/${repo}/branches/${enc(branch)}`), gh(`/repos/${repo}/rules/branches/${enc(branch)}`)]);
    if (!b.ok) return null;
    const classic = !!((await b.json()) as { protected?: boolean }).protected;
    const rules = r.ok ? ((await r.json()) as { type: string; parameters?: { required_status_checks?: { context: string }[] } }[]) : [];
    const checks = rules.filter((x) => x.type === "required_status_checks").flatMap((x) => x.parameters?.required_status_checks?.map((c) => c.context) ?? []);
    const pr = rules.some((x) => x.type === "pull_request");
    if (pr || checks.length) return { protected: true, requiresPr: pr, requiredChecks: checks };
    if (classic) return { protected: true, requiresPr: null, requiredChecks: null };
    return { protected: rules.length > 0, requiresPr: false, requiredChecks: [] };
  } catch {
    return null;
  }
}

export interface PullInfo {
  number: number;
  title: string;
  body: string;
  state: string; // open, closed
  merged: boolean;
  draft: boolean;
  author: string;
  base: string;
  head: { ref: string; sha: string; repo: string | null };
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
}

export async function pullRequest(token: string, repo: string, n: number): Promise<PullInfo> {
  const r = await api(token)(`/repos/${repo}/pulls/${n}`);
  if (r.status === 404) throw new RepoError(`${repo} has no pull request #${n}.`);
  if (!r.ok) throw explain(r.status, repo, `reading pull request #${n}`);
  const p = (await r.json()) as Record<string, any>;
  return {
    number: p.number,
    title: String(p.title ?? ""),
    body: String(p.body ?? ""),
    state: p.state,
    merged: !!p.merged,
    draft: !!p.draft,
    author: String(p.user?.login ?? ""),
    base: String(p.base?.ref ?? ""),
    head: { ref: String(p.head?.ref ?? ""), sha: String(p.head?.sha ?? ""), repo: p.head?.repo?.full_name ?? null },
    additions: p.additions ?? 0,
    deletions: p.deletions ?? 0,
    changedFiles: p.changed_files ?? 0,
    url: p.html_url,
  };
}

export interface PullFile {
  path: string;
  status: string; // added, modified, removed, renamed...
  additions: number;
  deletions: number;
  patch: string | null; // null: binary or too big for GitHub to show
}

// The files a pull request changes, with their diffs. GitHub lists at most 3000; we read `max`.
export async function pullFiles(token: string, repo: string, n: number, max = 300): Promise<PullFile[]> {
  const gh = api(token);
  const out: PullFile[] = [];
  for (let page = 1; out.length < max; page++) {
    const r = await gh(`/repos/${repo}/pulls/${n}/files?per_page=100&page=${page}`);
    if (!r.ok) throw explain(r.status, repo, `reading the files of pull request #${n}`);
    const batch = (await r.json()) as { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
    out.push(...batch.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch ?? null })));
    if (batch.length < 100) break;
  }
  return out.slice(0, max);
}

export async function openPulls(token: string, repo: string): Promise<{ number: number; title: string; branch: string; author: string }[]> {
  const r = await api(token)(`/repos/${repo}/pulls?state=open&per_page=15`);
  if (!r.ok) throw explain(r.status, repo, "listing pull requests");
  return ((await r.json()) as Record<string, any>[]).map((p) => ({ number: p.number, title: String(p.title ?? ""), branch: String(p.head?.ref ?? ""), author: String(p.user?.login ?? "") }));
}

// Workflow runs for one commit (the PR's latest), newest first.
export async function runsForCommit(token: string, repo: string, sha: string): Promise<Run[]> {
  const r = await api(token)(`/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=20`);
  if (!r.ok) throw explain(r.status, repo, "listing workflow runs");
  return ((await r.json()) as { workflow_runs: Record<string, unknown>[] }).workflow_runs.map(toRun);
}
