import { describe, expect, it } from "vitest";
import { runChecks, score, workspaceGlobs, workspacePackageFiles, type RepoSnapshot } from "../src/readiness";
import { detectStack, projectStatus } from "../src/project";
import { deliver } from "../src/lessons";

const statusOf = (s: RepoSnapshot, id: string) => runChecks(s).find((c) => c.id === id)!.status;

const ready: RepoSnapshot = {
  paths: [
    "package.json", "package-lock.json", ".gitignore", ".env.example", "wrangler.jsonc",
    ".github/workflows/ci.yml", "playwright.config.ts", "migrations/001_init.sql", "src/index.ts",
  ],
  files: {
    "package.json": JSON.stringify({ dependencies: { astro: "^5", "@neondatabase/serverless": "^1" } }),
    ".gitignore": "node_modules\n.env*\n!.env.example\n",
    ".github/workflows/ci.yml": "steps:\n  - run: docker run ghcr.io/gitleaks/gitleaks:v8 detect\n  - run: npm test\n  - run: npx playwright test\n    env:\n      BASE_URL: ${{ steps.preview.outputs.url }}\n",
  },
};

describe("readiness checks", () => {
  it("passes a repo that has everything", () => {
    expect(runChecks(ready).map((c) => c.status)).toEqual(["pass", "pass", "pass", "pass", "not_checked", "pass", "not_checked", "not_checked"]);
    expect(score(runChecks(ready))).toEqual({ passed: 5, total: 5 });
  });

  it("fails on committed env and key files, but not on templates", () => {
    const s = { ...ready, paths: [...ready.paths, "apps/web/.env.local", ".dev.vars", "certs/server.pem"] };
    const c = runChecks(s).find((x) => x.id === "secrets")!;
    expect(c.status).toBe("fail");
    expect(c.files).toEqual(["apps/web/.env.local", ".dev.vars", "certs/server.pem"]);
    expect(statusOf({ ...ready, paths: [...ready.paths, ".dev.vars.example", ".env.sample"] }, "secrets")).toBe("pass");
  });

  it("warns when .gitignore doesn't cover .env", () => {
    expect(statusOf({ ...ready, files: { ...ready.files, ".gitignore": "node_modules\n" } }, "secrets")).toBe("warn");
  });

  it("tells a workflow without tests apart from no workflow", () => {
    const noTests = { ...ready, files: { ...ready.files, ".github/workflows/ci.yml": "steps:\n  - run: npm run build\n" } };
    expect(statusOf(noTests, "ci")).toBe("warn");
    expect(statusOf(noTests, "e2e")).toBe("warn"); // config exists, CI doesn't run it
    expect(statusOf({ ...ready, paths: ready.paths.filter((p) => !p.startsWith(".github/")) }, "ci")).toBe("fail");
  });

  it("skips migrations when there is no database", () => {
    const noDb = { paths: ["package.json"], files: { "package.json": JSON.stringify({ dependencies: { next: "15" } }) } };
    expect(statusOf(noDb, "migrations")).toBe("skip");
    const dbNoMigrations = { paths: ["package.json"], files: { "package.json": JSON.stringify({ dependencies: { pg: "8" } }) } };
    expect(statusOf(dbNoMigrations, "migrations")).toBe("warn");
  });

  it("copes with an empty repo and a broken package.json", () => {
    expect(() => runChecks({ paths: [], files: {} })).not.toThrow();
    expect(() => runChecks({ paths: ["package.json"], files: { "package.json": "{oops" } })).not.toThrow();
  });
});

describe("project status", () => {
  it("detects the stack", () => {
    expect(detectStack(ready)).toEqual({ framework: "Astro", supported: true, packageManager: "npm", database: "Neon", hosting: "Cloudflare Workers", monorepo: false });
    const vite = { paths: ["pnpm-lock.yaml", "vercel.json"], files: { "package.json": JSON.stringify({ devDependencies: { vite: "6", vue: "3" } }) } };
    expect(detectStack(vite)).toMatchObject({ framework: "Vite (Vue)", packageManager: "pnpm", hosting: "Vercel" });
  });

  it("finds workspace packages in a monorepo", () => {
    const paths = [
      "package.json", "package-lock.json", "apps/web/package.json", "apps/web/node_modules/x/package.json",
      "packages/ui/package.json", "tools/deep/x/package.json", "examples/demo/package.json",
    ];
    const npmRoot = JSON.stringify({ workspaces: ["apps/*", "packages/*", "tools/**"] });
    expect(workspaceGlobs(npmRoot, undefined)).toEqual(["apps/*", "packages/*", "tools/**"]);
    expect(workspaceGlobs(JSON.stringify({ workspaces: { packages: ["apps/*"] } }), undefined)).toEqual(["apps/*"]);
    expect(workspaceGlobs(undefined, "packages:\n  - 'apps/*'\n  - \"packages/*\"\n  - '!**/test/**'\ncatalog:\n  - nope\n")).toEqual(["apps/*", "packages/*"]);
    expect(workspacePackageFiles(paths, workspaceGlobs(npmRoot, undefined))).toEqual([
      "apps/web/package.json", "packages/ui/package.json", "tools/deep/x/package.json",
    ]);
    expect(workspacePackageFiles(paths, [])).toEqual([]);

    const mono: RepoSnapshot = {
      paths: [...paths, "apps/web/wrangler.jsonc"],
      files: {
        "package.json": npmRoot,
        "apps/web/package.json": JSON.stringify({ dependencies: { astro: "5", "@neondatabase/serverless": "1" } }),
      },
    };
    expect(detectStack(mono)).toMatchObject({ framework: "Astro", supported: true, database: "Neon", hosting: "Cloudflare Workers", monorepo: true });
  });

  it("points at the first failure as the next step", () => {
    const s = { ...ready, paths: ready.paths.filter((p) => p !== "playwright.config.ts") };
    expect(projectStatus(s).nextStep?.check).toBe("e2e");
    expect(projectStatus(ready).nextStep).toBeNull();
  });
});

describe("lessons", () => {
  it("gives the full lesson first, then one line", () => {
    const first = deliver(["ci", "secrets"], {});
    expect(first.map((l) => l.depth)).toEqual(["full", "full"]);
    const later = deliver(["ci", "secrets"], { ci: 2 });
    expect(later.map((l) => l.depth)).toEqual(["short", "full"]);
    expect(later[0].text.length).toBeLessThan(first[0].text.length);
  });

  it("doesn't repeat a concept in one answer", () => {
    expect(deliver(["ci", "ci"], {})).toHaveLength(1);
  });
});
