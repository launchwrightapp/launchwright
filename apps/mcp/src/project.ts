// project_status: what the app is built with, read from the repo's files.
import { dependencies, runChecks, score, type RepoSnapshot } from "./readiness";

export interface Stack {
  framework: string; // "Next.js", "Astro", "Hono", "Vite (React)", ... or "Not detected"
  supported: boolean; // one of the MVP frameworks
  packageManager: string | null;
  database: string | null;
  hosting: string | null; // from config files in the repo
  monorepo: boolean;
}

export function detectStack(s: RepoSnapshot): Stack {
  const deps = dependencies(s.files);
  const has = (n: string) => deps.has(n);
  const framework = has("next")
    ? "Next.js"
    : has("astro")
      ? "Astro"
      : has("vite") && has("vue")
        ? "Vite (Vue)"
        : has("vite") && has("react")
          ? "Vite (React)"
          : has("hono")
            ? "Hono"
            : has("vite")
              ? "Vite"
              : "Not detected";

  const at = (name: string) => s.paths.some((p) => p === name || p.endsWith(`/${name}`));
  const packageManager = at("pnpm-lock.yaml") ? "pnpm" : at("yarn.lock") ? "yarn" : at("bun.lockb") || at("bun.lock") ? "bun" : at("package-lock.json") ? "npm" : null;
  const database = has("@neondatabase/serverless")
    ? "Neon"
    : has("@supabase/supabase-js")
      ? "Supabase"
      : has("prisma") || has("@prisma/client")
        ? "Prisma (database not detected)"
        : has("drizzle-orm")
          ? "Drizzle (database not detected)"
          : has("pg") || has("postgres")
            ? "Postgres"
            : null;
  const hosting = at("wrangler.jsonc") || at("wrangler.json") || at("wrangler.toml")
    ? "Cloudflare Workers"
    : at("vercel.json")
      ? "Vercel"
      : at("netlify.toml")
        ? "Netlify"
        : null;
  let monorepo = false;
  try {
    monorepo = !!JSON.parse(s.files["package.json"] ?? "{}").workspaces || at("pnpm-workspace.yaml");
  } catch {
    /* ignore */
  }
  return { framework, supported: framework !== "Not detected" && framework !== "Vite", packageManager, database, hosting, monorepo };
}

export function projectStatus(s: RepoSnapshot) {
  const stack = detectStack(s);
  const checks = runChecks(s);
  const next = checks.find((c) => c.status === "fail") ?? checks.find((c) => c.status === "warn") ?? null;
  return { stack, readiness: score(checks), nextStep: next ? { check: next.id, title: next.title, detail: next.detail } : null };
}
