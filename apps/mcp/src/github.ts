// Reads a learner's repo with their own GitHub token (read-only API calls).
import { workflowFiles, workspaceGlobs, workspacePackageFiles, type RepoSnapshot } from "./readiness";

export const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const MAX_FILE = 64 * 1024; // skip anything bigger: we only read small config files
const MAX_WORKFLOWS = 10;
const MAX_WORKSPACE_PACKAGES = 20;

export class RepoError extends Error {}

function api(token: string) {
  return (path: string, accept = "application/vnd.github+json") =>
    fetch(`https://api.github.com${path}`, {
      headers: { authorization: `Bearer ${token}`, accept, "user-agent": "launchwright-mcp", "x-github-api-version": "2022-11-28" },
    });
}

export async function readRepo(repo: string, token: string): Promise<RepoSnapshot & { repo: string; branch: string; private: boolean }> {
  if (!REPO_RE.test(repo)) throw new RepoError("Use the form owner/name, for example octocat/hello-world.");
  const gh = api(token);

  const info = await gh(`/repos/${repo}`);
  if (info.status === 404) throw new RepoError(`Launchwright can't see ${repo}. Check the name. If the repo is private, install the Launchwright GitHub App on it.`);
  if (info.status === 401) throw new RepoError("Your GitHub sign-in expired. Reconnect Launchwright in your AI tool.");
  if (!info.ok) throw new RepoError(`GitHub answered ${info.status}. Please try again in a minute.`);
  const meta = (await info.json()) as { default_branch: string; private: boolean; full_name: string };

  const treeRes = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`);
  if (treeRes.status === 409) return { repo: meta.full_name, branch: meta.default_branch, private: meta.private, paths: [], files: {} }; // empty repo
  if (!treeRes.ok) throw new RepoError(`Couldn't list the files in ${repo} (GitHub answered ${treeRes.status}).`);
  const tree = (await treeRes.json()) as { tree: { path: string; type: string; size?: number }[]; truncated: boolean };
  const blobs = tree.tree.filter((t) => t.type === "blob");
  const paths = blobs.map((t) => t.path);
  const size = new Map(blobs.map((t) => [t.path, t.size ?? 0]));

  const files: Record<string, string> = {};
  const fetchFiles = (list: string[]) =>
    Promise.all(
      list
        .filter((p) => size.has(p) && size.get(p)! <= MAX_FILE)
        .map(async (p) => {
          const r = await gh(`/repos/${repo}/contents/${p.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(meta.default_branch)}`, "application/vnd.github.raw+json");
          if (r.ok) files[p] = (await r.text()).slice(0, MAX_FILE);
        }),
    );
  await fetchFiles(["package.json", "pnpm-workspace.yaml", ".gitignore", ...workflowFiles(paths).slice(0, MAX_WORKFLOWS)]);
  // Monorepo: the framework and database usually live in the workspace packages, not the root.
  const globs = workspaceGlobs(files["package.json"], files["pnpm-workspace.yaml"]);
  if (globs.length) await fetchFiles(workspacePackageFiles(paths, globs).slice(0, MAX_WORKSPACE_PACKAGES));
  return { repo: meta.full_name, branch: meta.default_branch, private: meta.private, paths, files, truncated: tree.truncated };
}
