// setup_ci: GitHub Actions workflows for the learner's repo, generated from what's in it.
//   ci.yml                    secret scan (gitleaks), install, typecheck/lint/test/build, Playwright
//   launchwright-deploy.yml   Cloudflare: preview per PR + E2E on the preview; production on
//                             manual dispatch (after dashboard approval) + smoke test + rollback
//   uptime.yml                scheduled check of the production URL
// Plus a minimal Playwright config and smoke test when the repo has none.
// Pure functions: the tool opens a pull request with the result.
import { dependencies, type RepoSnapshot } from "./readiness";
import { wranglerConfig } from "./env";

export const DEPLOY_WORKFLOW = "launchwright-deploy.yml";
const GITLEAKS = "ghcr.io/gitleaks/gitleaks:v8.21.2";

export interface CiPlan {
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  scripts: { typecheck?: string; lint?: string; test?: string; build?: string };
  playwright: { config: string | null; installed: boolean };
  cloudflare: { dir: string; worker: string | null; pages: boolean } | null;
}

export function plan(s: RepoSnapshot): CiPlan {
  const has = (n: string) => s.paths.includes(n);
  const packageManager = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("bun.lockb") || has("bun.lock") ? "bun" : "npm";
  let scripts: Record<string, string> = {};
  try {
    scripts = (JSON.parse(s.files["package.json"] ?? "{}") as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    /* ignore */
  }
  const pick = (...names: string[]) => names.find((n) => typeof scripts[n] === "string" && !/no test specified/.test(scripts[n]));
  const config = s.paths.find((p) => /(^|\/)playwright\.config\.(ts|js|mjs|cjs)$/.test(p) && !p.includes("node_modules/")) ?? null;
  const wranglerPath = s.paths.filter((p) => /(^|\/)wrangler\.(jsonc?|toml)$/.test(p) && !p.includes("node_modules/")).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  let cloudflare: CiPlan["cloudflare"] = null;
  if (wranglerPath) {
    const cfg = wranglerConfig(wranglerPath, s.files[wranglerPath] ?? "");
    cloudflare = { dir: wranglerPath.includes("/") ? wranglerPath.slice(0, wranglerPath.lastIndexOf("/")) : ".", worker: cfg.name, pages: cfg.pages };
  }
  return {
    packageManager,
    scripts: { typecheck: pick("typecheck", "type-check", "check-types", "tsc"), lint: pick("lint"), test: pick("test", "test:unit"), build: pick("build") },
    playwright: { config, installed: dependencies(s.files).has("@playwright/test") },
    cloudflare,
  };
}

const run = (pm: CiPlan["packageManager"], script: string) => (pm === "npm" ? `npm run ${script}` : `${pm} run ${script}`);
const install = (pm: CiPlan["packageManager"]) =>
  ({ npm: "npm ci", pnpm: "pnpm install --frozen-lockfile", yarn: "yarn install --frozen-lockfile", bun: "bun install --frozen-lockfile" })[pm];

function setupSteps(p: CiPlan, indent = "      "): string {
  const lines = ["- uses: actions/checkout@v4"];
  if (p.packageManager === "pnpm") lines.push("- uses: pnpm/action-setup@v4");
  if (p.packageManager === "bun") lines.push("- uses: oven-sh/setup-bun@v2");
  lines.push("- uses: actions/setup-node@v4", "  with:", "    node-version: 22", ...(p.packageManager === "bun" ? [] : [`    cache: ${p.packageManager}`]));
  lines.push(`- run: ${install(p.packageManager)}`);
  return lines.map((l) => indent + l).join("\n");
}

// Playwright itself, installed for the run when it isn't a dependency yet.
function playwrightSteps(p: CiPlan, indent = "      "): string {
  const lines = [];
  if (!p.playwright.installed) lines.push("- run: npm install --no-save @playwright/test@1");
  lines.push("- run: npx playwright install --with-deps chromium");
  return lines.map((l) => indent + l).join("\n");
}

export function ciWorkflow(p: CiPlan): string {
  const checks = (["typecheck", "lint", "test", "build"] as const)
    .filter((k) => p.scripts[k])
    .map((k) => `      - name: ${k[0].toUpperCase() + k.slice(1)}\n        run: ${run(p.packageManager, p.scripts[k]!)}`)
    .join("\n");
  return `# Made by launchwright (setup_ci). Runs on every pull request and every push to main.
# Each job is a check on the pull request; protect main so they must pass before merging.
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  secrets:
    name: Secret scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the whole history: a key deleted later is still leaked
      - name: gitleaks
        run: docker run --rm -v "$PWD:/repo" ${GITLEAKS} detect --source /repo --redact --verbose

  test:
    name: Checks
    runs-on: ubuntu-latest
    steps:
${setupSteps(p)}
${checks || "      - run: echo \"No typecheck, lint, test or build scripts in package.json yet. Add them and they run here.\""}

  e2e:
    name: E2E (local)
    runs-on: ubuntu-latest
    steps:
${setupSteps(p)}
${playwrightSteps(p)}
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
`;
}

export function deployWorkflow(p: CiPlan): string | null {
  const cf = p.cloudflare;
  if (!cf) return null;
  const wd = cf.dir === "." ? "" : `\n        working-directory: ${cf.dir}`;
  const build = p.scripts.build ? `\n      - name: Build\n        run: ${run(p.packageManager, p.scripts.build)}${wd}` : "";
  const previewCmd = cf.pages
    ? `npx wrangler pages deploy --branch "pr-\${{ github.event.number || github.run_number }}"`
    : `npx wrangler versions upload --preview-alias "pr-\${{ github.event.number || github.run_number }}"`;
  const prodCmd = cf.pages ? "npx wrangler pages deploy --branch main" : 'npx wrangler deploy --message "${GITHUB_SHA::7}"';
  const rollback = cf.pages
    ? 'echo "::warning::Pages: roll back from the Cloudflare dashboard (Deployments > previous > Rollback)."'
    : 'npx wrangler rollback --message "launchwright: smoke test failed on ${GITHUB_SHA::7}" -y';
  return `# Made by launchwright (setup_ci). Deploys to your Cloudflare account.
#   Pull request          -> preview deploy + Playwright smoke test on the preview URL
#   Manual (production)   -> started by launchwright's deploy tool after you approve it on the
#                            dashboard; smoke test on the live site; automatic rollback if it fails
# Needs two Actions secrets: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (deploy sets them).
name: Deploy

on:
  pull_request:
  workflow_dispatch:
    inputs:
      environment:
        description: preview or production
        type: choice
        options: [preview, production]
        default: preview
      rollback:
        description: Roll production back to the previous version instead of deploying
        type: boolean
        default: false

permissions:
  contents: read

concurrency:
  group: deploy-\${{ inputs.environment || 'preview' }}-\${{ github.ref }}
  cancel-in-progress: false

env:
  CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

jobs:
  preview:
    name: Preview deploy + E2E
    # Forks don't get your secrets, so previews run only for branches in this repo.
    if: (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository) || (github.event_name == 'workflow_dispatch' && inputs.environment == 'preview')
    runs-on: ubuntu-latest
    steps:
${setupSteps(p)}${build}
      - name: Upload preview
        id: up${wd}
        run: |
          out=$(${previewCmd} 2>&1 | tee /dev/stderr)
          url=$(echo "$out" | grep -oE 'https://[^ ]+\\.(workers|pages)\\.dev' | tail -1)
          [ -n "$url" ] || { echo "::error::No preview URL in the wrangler output"; exit 1; }
          echo "url=$url" >> "$GITHUB_OUTPUT"
          echo "Preview: $url" >> "$GITHUB_STEP_SUMMARY"
${playwrightSteps(p)}
      - name: E2E on the preview
        run: npx playwright test
        env:
          BASE_URL: \${{ steps.up.outputs.url }}

  production:
    name: Deploy production
    if: github.event_name == 'workflow_dispatch' && inputs.environment == 'production'
    runs-on: ubuntu-latest
    environment: production
    steps:
${setupSteps(p)}${build}
      - name: Roll back
        if: inputs.rollback${wd}
        run: ${rollback}
      - name: Deploy
        if: \${{ !inputs.rollback }}${wd}
        run: ${prodCmd}
${playwrightSteps(p)}
      - name: Smoke test on the live site
        id: smoke
        if: \${{ !inputs.rollback && vars.PRODUCTION_URL != '' }}
        run: npx playwright test
        env:
          BASE_URL: \${{ vars.PRODUCTION_URL }}
      - name: Roll back if the smoke test failed
        if: failure() && steps.smoke.outcome == 'failure'${wd}
        run: ${rollback}
`;
}

export function uptimeWorkflow(url: string): string {
  return `# Made by launchwright (setup_ci). Checks your live site every 15 minutes.
# When it fails, GitHub emails you (Settings > Notifications > Actions: "Send notifications for failed workflows").
name: Uptime

on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  check:
    name: Site is up
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: curl ${url}
        run: curl --fail --silent --show-error --max-time 20 --retry 2 --retry-delay 10 -o /dev/null -w "%{http_code} in %{time_total}s\\n" "${url}"
`;
}

export function playwrightConfig(hasPreviewScript: boolean, pm: CiPlan["packageManager"], port = 4173): string {
  const cmd = hasPreviewScript ? run(pm, "preview") : run(pm, "dev");
  return `import { defineConfig, devices } from "@playwright/test";

// Made by launchwright (setup_ci).
// With BASE_URL set (CI does this for preview and production) the tests run against that site.
// Without it, Playwright starts your app locally first.
const baseURL = process.env.BASE_URL ?? "http://localhost:${port}";

export default defineConfig({
  testDir: "./tests",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "${cmd} -- --port ${port}", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
`;
}

export const SMOKE_TEST = `import { test, expect } from "@playwright/test";

// Made by launchwright (setup_ci): the smallest test that proves the app works.
// Add one test per thing your users must be able to do (sign in, book, pay...).
test("home page loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto("/");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});
`;

export function ciFiles(s: RepoSnapshot, opts: { productionUrl?: string | null }): { files: { path: string; content: string }[]; plan: CiPlan; added: string[] } {
  const p = plan(s);
  const files: { path: string; content: string }[] = [{ path: ".github/workflows/ci.yml", content: ciWorkflow(p) }];
  const deploy = deployWorkflow(p);
  if (deploy) files.push({ path: `.github/workflows/${DEPLOY_WORKFLOW}`, content: deploy });
  if (opts.productionUrl) files.push({ path: ".github/workflows/uptime.yml", content: uptimeWorkflow(opts.productionUrl) });
  if (!p.playwright.config) {
    let scripts: Record<string, string> = {};
    try {
      scripts = (JSON.parse(s.files["package.json"] ?? "{}") as { scripts?: Record<string, string> }).scripts ?? {};
    } catch {
      /* ignore */
    }
    files.push({ path: "playwright.config.ts", content: playwrightConfig(!!scripts.preview, p.packageManager) });
    if (!s.paths.includes("tests/smoke.spec.ts")) files.push({ path: "tests/smoke.spec.ts", content: SMOKE_TEST });
  }
  return { files, plan: p, added: files.map((f) => f.path) };
}
