// check_env: compare the settings the code reads, the ones .env.example documents, and the ones
// production actually has (Worker vars and secrets, GitHub Actions secrets). Pure functions.

// Set by the framework or the platform, not by the learner.
const BUILTIN = new Set(["NODE_ENV", "MODE", "DEV", "PROD", "SSR", "BASE_URL", "SITE", "ASSETS_PREFIX", "CI", "PORT", "HOSTNAME", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "CF_PAGES", "CF_PAGES_URL", "CF_PAGES_BRANCH", "NEXT_RUNTIME", "TZ", "HOME", "PWD", "PATH", "ASSETS"]);
// Prefixes that make a variable part of the JavaScript sent to the browser.
const PUBLIC_PREFIX = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|NUXT_PUBLIC_|EXPO_PUBLIC_|REACT_APP_)/;
const SECRETISH = /SECRET|PRIVATE|PASSWORD|PASSWD|TOKEN|SERVICE_ROLE|API_KEY|DATABASE_URL|DB_URL|CONNECTION_STRING/;
// Public keys that are meant for the browser even though they say KEY.
const PUBLIC_OK = /ANON_KEY|PUBLISHABLE|SITE_KEY|PUBLIC_KEY|MEASUREMENT_ID|DSN$/;

export const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|astro|vue|svelte)$/;
const SKIP_DIR = /(^|\/)(node_modules|dist|build|\.next|\.astro|\.output|\.wrangler|coverage|out|vendor|public)\//;
const TEST_FILE = /(\.test\.|\.spec\.|(^|\/)(tests?|__tests__|e2e)\/)/;

// Which source files to read: app code first, smallest set that's likely to hold env reads.
export function sourceFiles(paths: string[], sizes: Record<string, number> = {}, max = 60): string[] {
  const score = (p: string) =>
    (/(^|\/)(env|config|settings)\.[a-z]+$/i.test(p) ? 0 : 1) + (/(^|\/)(lib|server|api|db|worker|middleware)(\/|\.)/.test(p) ? 0 : 1) + p.split("/").length / 10;
  return paths
    .filter((p) => SOURCE_FILE.test(p) && !SKIP_DIR.test(p) && !TEST_FILE.test(p) && !p.endsWith(".d.ts") && (sizes[p] ?? 0) <= 64 * 1024)
    .sort((a, b) => score(a) - score(b))
    .slice(0, max);
}

// Variable names read in source code.
export function envReads(files: Record<string, string>): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (name: string, file: string) => {
    if (BUILTIN.has(name)) return;
    const list = found.get(name) ?? [];
    if (!list.includes(file)) list.push(file);
    found.set(name, list);
  };
  const res = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
    /\benv\.([A-Z][A-Z0-9_]{2,})\b/g, // Workers: env.DATABASE_URL, c.env.X
    /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    /\bgetEnv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  ];
  // const { DATABASE_URL, API_KEY } = process.env
  const destructure = /\{([^}]{1,400})\}\s*=\s*(?:process\.env|import\.meta\.env|(?:c\.)?env)\b/g;
  for (const [file, text] of Object.entries(files)) {
    if (!SOURCE_FILE.test(file)) continue;
    for (const re of res) for (const m of text.matchAll(re)) add(m[1], file);
    for (const m of text.matchAll(destructure)) {
      for (const part of m[1].split(",")) {
        const name = part.split(":")[0].split("=")[0].trim();
        if (/^[A-Z][A-Z0-9_]*$/.test(name)) add(name, file);
      }
    }
  }
  return found;
}

// KEY=value lines from .env.example and friends.
export function documented(text: string): string[] {
  return [...new Set(text.split("\n").map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]).filter((x): x is string => !!x))];
}

export const stripJsonComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");

// The Worker's name and plain vars from wrangler.jsonc / .json / .toml.
export function wranglerConfig(path: string, text: string): { name: string | null; vars: string[]; pages: boolean } {
  if (path.endsWith(".toml")) {
    const name = text.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1] ?? null;
    const vars: string[] = [];
    let inVars = false;
    for (const line of text.split("\n")) {
      if (/^\s*\[/.test(line)) inVars = /^\s*\[vars\]\s*$/.test(line);
      else if (inVars) {
        const k = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
        if (k) vars.push(k);
      }
    }
    return { name, vars, pages: /pages_build_output_dir/.test(text) };
  }
  try {
    const cfg = JSON.parse(stripJsonComments(text)) as { name?: string; vars?: Record<string, unknown>; pages_build_output_dir?: string };
    return { name: cfg.name ?? null, vars: Object.keys(cfg.vars ?? {}), pages: !!cfg.pages_build_output_dir };
  } catch {
    return { name: text.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ?? null, vars: [], pages: /pages_build_output_dir/.test(text) };
  }
}

export interface EnvReport {
  used: string[];
  documented: string[];
  undocumented: string[]; // read by code, not in .env.example
  unused: string[]; // in .env.example, not read by code
  missingInProduction: string[] | null; // read by code, not set in production (null = production unknown)
  missingInCi: string[] | null; // secrets the workflows reference that GitHub doesn't have
  exposed: string[]; // secret-looking names with a browser prefix
  where: Record<string, string[]>;
}

export function analyzeEnv(input: {
  reads: Map<string, string[]>;
  documented: string[];
  production?: string[] | null; // Worker vars + secrets
  ciSecrets?: string[] | null; // GitHub Actions secret names
  workflows?: Record<string, string>;
}): EnvReport {
  const used = [...input.reads.keys()].sort();
  const doc = new Set(input.documented);
  const usedSet = new Set(used);
  const prod = input.production ? new Set(input.production) : null;
  let missingInCi: string[] | null = null;
  if (input.ciSecrets) {
    const have = new Set([...input.ciSecrets, "GITHUB_TOKEN"]);
    const referenced = new Set<string>();
    for (const text of Object.values(input.workflows ?? {})) for (const m of text.matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)) referenced.add(m[1]);
    missingInCi = [...referenced].filter((n) => !have.has(n)).sort();
  }
  return {
    used,
    documented: [...doc].sort(),
    undocumented: used.filter((n) => !doc.has(n)),
    unused: [...doc].filter((n) => !usedSet.has(n)).sort(),
    // Browser-prefixed vars are baked in at build time, not read from Worker secrets at runtime.
    missingInProduction: prod ? used.filter((n) => !prod.has(n) && !PUBLIC_PREFIX.test(n)) : null,
    missingInCi,
    exposed: used.filter((n) => PUBLIC_PREFIX.test(n) && SECRETISH.test(n.replace(PUBLIC_PREFIX, "")) && !PUBLIC_OK.test(n)),
    where: Object.fromEntries(input.reads),
  };
}
