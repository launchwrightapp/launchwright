// The Cloudflare apps in a repo: one per wrangler config. A monorepo can have several
// (e.g. apps/site, apps/api), and tools that touch one Worker take an `app` argument to pick it.
import { wranglerConfig } from "./env";

export interface App {
  path: string; // the wrangler config
  dir: string; // its folder ("." at the root)
  name: string | null; // Worker or Pages project name
  pages: boolean;
  vars: string[];
}

export const WRANGLER = /(^|\/)wrangler\.(jsonc?|toml)$/;
const SKIP = /(^|\/)(node_modules|dist|build|\.wrangler|examples?|fixtures?|templates?|__tests__|tests?)\//;

export function findApps(paths: string[], files: Record<string, string>): App[] {
  return paths
    .filter((p) => WRANGLER.test(p) && !SKIP.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .map((path) => {
      const cfg = wranglerConfig(path, files[path] ?? "");
      return { path, dir: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".", ...cfg };
    });
}

// How the AI and the learner refer to an app: the Worker name, else the folder.
export const appLabel = (a: App) => a.name ?? a.dir;
export const appList = (apps: App[]) => apps.map((a) => `- \`${appLabel(a)}\` (${a.dir === "." ? "repo root" : a.dir})`).join("\n");

// Match by Worker name, folder, or the folder's last part ("platform" for apps/platform).
export function matchApp(apps: App[], wanted: string): App | null {
  const w = wanted.trim().replace(/^\.\/|\/+$/g, "").toLowerCase();
  return (
    apps.find((a) => a.name?.toLowerCase() === w) ??
    apps.find((a) => a.dir.toLowerCase() === w) ??
    apps.find((a) => a.dir.split("/").pop()!.toLowerCase() === w) ??
    null
  );
}

// File name for an app's deploy workflow. One app keeps the original name.
export function deployWorkflowFor(apps: App[], app: App | null): string {
  if (!app || apps.length <= 1) return "launchwright-deploy.yml";
  const slug = appLabel(app).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `launchwright-deploy-${slug}.yml`;
}
