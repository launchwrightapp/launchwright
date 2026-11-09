// The lesson engine: every tool result comes with a short lesson.
// The first time a learner meets a concept they get the full explanation; after that, one line.

export type LessonConcept = "project_status" | "readiness" | "secrets" | "env_config" | "ci" | "e2e" | "migrations";

interface Lesson {
  title: string;
  full: string;
  short: string;
}

export const LESSONS: Record<LessonConcept, Lesson> = {
  project_status: {
    title: "Knowing your stack",
    full: "Before changing anything, a production engineer checks what the app is made of: the framework, the package manager, the database, where it's hosted. Each one decides how you install, build, test and deploy. Reading package.json and the config files at the root of the repo answers most of it.",
    short: "Stack first: framework, package manager, database and hosting decide every later step.",
  },
  readiness: {
    title: "Production readiness",
    full: "An app is ready for real users when it keeps working while you change it. That means no secrets in the code, settings written down, tests that run on every push, a browser test of the real app, and a database you can rebuild from files. Fix one item at a time, starting with failures.",
    short: "Readiness: fix failures first, then warnings, one at a time.",
  },
  secrets: {
    title: "Secrets stay out of git",
    full: "Passwords and API keys belong in environment variables, not in the code. Git keeps every version forever, so a key that was committed once is exposed even after you delete the file: remove it, then rotate it (make a new key and revoke the old one). .gitignore stops it happening again.",
    short: "Secrets: env vars only; a committed key must be rotated, not just deleted.",
  },
  env_config: {
    title: "Documenting env config",
    full: "Your app reads settings from the environment: a database URL, an API key, a site URL. A .env.example file lists every one with a fake value, so anyone (including your CI and your future self) can set the app up without guessing. The real .env stays on your machine.",
    short: "Env config: .env.example lists every setting, with fake values.",
  },
  ci: {
    title: "Continuous integration",
    full: "CI is a computer that runs your checks every time you push. With GitHub Actions it's a YAML file in .github/workflows. If the tests fail, the change is flagged before anyone merges it, so main stays deployable.",
    short: "CI: every push runs the tests, so main stays deployable.",
  },
  e2e: {
    title: "End-to-end smoke tests",
    full: "Unit tests check pieces; an end-to-end (E2E) test opens the real app in a browser and clicks through it like a user. Playwright does this. Running a small smoke test against a preview deploy catches the bugs that only show up when everything is wired together.",
    short: "E2E: Playwright opens the real app and checks the main flow works.",
  },
  migrations: {
    title: "Database migrations",
    full: "A migration is a file that changes the database schema: create a table, add a column. Keeping them in the repo, numbered and in order, means every database (yours, CI's, production's) can be built the same way, and every change is reviewed like code.",
    short: "Migrations: schema changes are numbered files in the repo.",
  },
};

export interface Delivered {
  concept: LessonConcept;
  depth: "full" | "short";
  text: string;
}

// seen: how many times this learner already got each concept (missing = never).
export function deliver(concepts: LessonConcept[], seen: Partial<Record<LessonConcept, number>>): Delivered[] {
  return [...new Set(concepts)].map((concept) => {
    const l = LESSONS[concept];
    const first = !seen[concept];
    return { concept, depth: first ? "full" : "short", text: first ? `${l.title}. ${l.full}` : l.short };
  });
}

export function isLessonConcept(s: string): s is LessonConcept {
  return s in LESSONS;
}
