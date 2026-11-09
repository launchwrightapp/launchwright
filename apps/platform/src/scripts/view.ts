// Turns the /api/me response into what the pages show. Pure, so it's easy to reason about.
import { GITHUB_APP_INSTALL_URL } from "../../../../packages/core/github-app";
import { EXERCISES, LESSONS, MODULES, progress, type Concept } from "../../../../packages/core/curriculum";

export interface Me {
  user: { id: number; login: string; name: string };
  configured: { database: boolean; encryption: boolean; supabase: boolean };
  projects: {
    repo: string; framework: string | null; packageManager: string | null; database: string | null; hosting: string | null; worker: string | null;
    productionUrl: string | null; readiness: { passed: number; total: number } | null;
    checks: { id: string; title: string; status: string; detail: string; files?: string[] }[] | null; checkedAt: string | null; updatedAt: string | null;
  }[];
  conceptsSeen: string[];
  exercisesDone?: string[];
  connections: { provider: string; method: string; label: string | null; scopes: string; connectedAt: string | null }[];
  approvals: { id: string; repo: string; client: string | null; tool: string; action: string; title: string; summary: string; detail: Record<string, unknown>; createdAt: string | null; expiresAt: string | null }[];
  audit: { actor: string; client: string | null; tool: string; repo: string | null; summary: string; outcome: string; at: string | null }[];
  secrets: { repo: string; name: string; target: string; updatedAt: string | null }[];
  mcp: { connected: boolean; client: string | null; lastSeen: string | null };
}

// The 8 readiness checks, in the order the MCP server returns them.
export const CHECKS: { id: Concept; short: string; title: string; prompt: string }[] = [
  { id: "secrets", short: "Secrets", title: "No secrets in the repo", prompt: "Use launchwright to fix the secret scanning check on REPO" },
  { id: "env_config", short: "Env", title: "Env config is documented", prompt: "Use launchwright check_env on REPO and help me fix what's missing" },
  { id: "ci", short: "CI", title: "CI runs your tests", prompt: "Use launchwright setup_ci on REPO and walk me through the pull request" },
  { id: "e2e", short: "E2E", title: "E2E smoke test", prompt: "Use launchwright to add a Playwright smoke test that runs on preview deploys for REPO" },
  { id: "api_auth", short: "Auth", title: "Auth on API routes", prompt: "Use launchwright to fix the auth on API routes check on REPO" },
  { id: "migrations", short: "DB", title: "Database migrations", prompt: "Help me move REPO's database schema into migration files, then run launchwright check_readiness" },
  { id: "security_headers", short: "HTTPS", title: "HTTPS and security headers", prompt: "Use launchwright to fix the HTTPS and security headers check on REPO" },
  { id: "uptime", short: "Uptime", title: "Uptime check", prompt: "Use launchwright setup_ci with my production URL to add an uptime check to REPO" },
];

const STATUS: Record<string, string> = { pass: "Passed", warn: "Needs work", fail: "Failed", skip: "Not needed", not_checked: "Not checked", pending: "Not checked" };
const PROVIDERS = [
  { id: "cloudflare", name: "Cloudflare", why: "Runs your app, keeps its secrets and logs." },
  { id: "neon", name: "Neon", why: "Postgres database (pick Neon or Supabase)." },
  { id: "supabase", name: "Supabase", why: "Postgres database with auth and storage." },
];

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const hostOf = (u: string | null) => {
  try {
    return u ? new URL(u).host : null;
  } catch {
    return null;
  }
};
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const greeting = (h = new Date().getHours()) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

export function view(me: Me, now = Date.now()) {
  const project = me.projects[0] ?? null;
  const repo = project?.repo ?? "your repo";
  const fromServer = new Map((project?.checks ?? []).map((c) => [c.id, c]));
  const checks = CHECKS.map((def) => {
    const c = fromServer.get(def.id);
    const status = c?.status ?? "not_checked";
    const lesson = LESSONS[def.id];
    return {
      id: def.id,
      anchor: `check-${def.id}`,
      href: `/readiness#check-${def.id}`,
      short: def.short,
      title: c?.title ?? def.title,
      status,
      statusLabel: STATUS[status] ?? status,
      detail: c?.detail ?? (project ? "Not checked yet. Ask your AI tool to run check_readiness." : "Connect your AI tool and run check_readiness to see this."),
      files: (c?.files ?? []).join(", "),
      hasFiles: !!c?.files?.length,
      isPass: status === "pass" || status === "skip",
      isFail: status === "fail",
      isWarn: status === "warn",
      isOpen: status === "not_checked",
      needsWork: status === "fail" || status === "warn",
      lessonTitle: lesson.title,
      why: lesson.full,
      prompt: def.prompt.replace("REPO", repo),
      ariaLabel: `${c?.title ?? def.title}: ${STATUS[status] ?? status}`,
    };
  });
  const order: Record<string, number> = { fail: 0, warn: 1, not_checked: 2, pass: 3, skip: 4 };
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);
  const passing = checks.filter((c) => c.isPass).length;
  const next = checks.find((c) => c.isFail) ?? checks.find((c) => c.isWarn) ?? null;
  const nextLesson = next ? LESSONS[next.id] : null;
  const nextModule = nextLesson ? MODULES.find((m) => m.id === nextLesson.module) ?? null : null;

  const modules = progress([...me.conceptsSeen, ...(me.exercisesDone ?? []).map((id) => `exercise:${id}`)]).map((m) => ({
    ...m,
    isDone: m.status === "done",
    isCurrent: m.status === "current",
    isNext: m.status === "next",
    ariaCurrent: m.status === "current" ? "step" : null,
    label: `${m.n} ${m.name}`,
    count: `${m.done}/${m.total}`,
    ariaLabel: `${m.done} of ${m.total} done${m.status === "current" ? ", in progress" : ""}`,
    bars: [...m.concepts, ...m.exercises].map((c) => ({ done: c.done, doneCurrent: c.done && m.status === "current", doneOther: c.done && m.status !== "current" })),
    concepts: m.concepts.map((c) => ({ ...c, state: c.done ? "Covered" : "Not yet" })),
    promptCommand: m.prompt ? `/${m.prompt}` : null,
    hasExercises: m.exercises.length > 0,
    exercises: m.exercises.map((e) => ({
      title: e.title, why: e.why, done: e.done, state: e.done ? "Done" : "Not yet",
      doneWhen: `Counts as done when your default branch has ${e.doneWhen.map((n) => n.what).join(" and ")}, and you run check_readiness.`,
      command: `/lesson-practice exercise=${e.id}`,
    })),
  }));
  const current = modules.find((m) => m.isCurrent) ?? null;

  const connections = PROVIDERS.map((p) => {
    const c = me.connections.find((x) => x.provider === p.id);
    return { ...p, href: `/security#connect-${p.id}`, connected: !!c, notConnected: !c, label: c?.label ?? p.why, scopes: c?.scopes ?? "Not connected", connectedAgo: c ? `Connected ${ago(c.connectedAt, now)}` : "", stateLabel: c ? "Connected" : "Not connected" };
  });
  const account = Object.fromEntries(connections.map((c) => [c.id, c]));
  const hasDatabase = connections.some((c) => (c.id === "neon" || c.id === "supabase") && c.connected);
  const cloudflareConnected = connections[0].connected;

  const approvals = me.approvals.map((a) => ({
    ...a,
    asked: ago(a.createdAt, now),
    askedBy: a.client ?? "Your AI tool",
    detailText: JSON.stringify(a.detail, null, 2),
    approveId: `approve-${a.id}`,
  }));

  const kind = (r: Me["audit"][number]) => (r.outcome === "pending" ? "approval" : r.outcome === "error" || r.outcome === "blocked" ? "problem" : r.actor === "learner" ? "you" : "action");
  const audit = me.audit.map((r) => ({
    ...r,
    time: time(r.at),
    ago: ago(r.at, now),
    who: r.actor === "learner" ? "You" : r.client ?? "AI tool",
    kind: kind(r),
    isPending: r.outcome === "pending",
    isProblem: r.outcome === "error" || r.outcome === "blocked",
    isOk: r.outcome === "ok",
    isFlagged: r.outcome !== "ok",
    isAction: kind(r) === "action",
    isYou: kind(r) === "you",
  }));

  const onboarding = [
    { n: 1, title: "Connect your AI tool", detail: "One line in Claude Code, Cursor or Codex.", href: "/connect", done: me.mcp.connected, cta: "Connect" },
    { n: 2, title: "Give launchwright your repo", detail: "Install the launchwright GitHub App on the repo you'll work on. You pick the repos.", href: GITHUB_APP_INSTALL_URL, done: !!project, cta: "Install" },
    { n: 3, title: "Connect Cloudflare", detail: "Where your app runs. You create a limited token; the AI never sees it.", href: "/security#connect-cloudflare", done: cloudflareConnected, cta: "Connect" },
    { n: 4, title: "Connect a database", detail: "Neon or Supabase, both have free tiers.", href: "/security#connect-neon", done: hasDatabase, cta: "Connect" },
    { n: 5, title: "Check your project", detail: "Ask your AI tool: \"Use launchwright project_status on owner/repo\".", href: "/connect", done: !!project, cta: "How" },
  ].map((s) => ({ ...s, todo: !s.done, label: `Step ${s.n}: ${s.title}${s.done ? " (done)" : ""}` }));
  const setupDone = onboarding.filter((s) => s.done).length;

  return {
    user: me.user,
    greeting: greeting(),
    configured: me.configured,
    setupIncomplete: !me.configured.database || !me.configured.encryption,
    supabaseAvailable: me.configured.supabase,
    hasProject: !!project,
    noProject: !project,
    project: project
      ? {
          ...project,
          name: project.repo.split("/")[1] ?? project.repo,
          stack: [project.framework, project.hosting, project.database].filter(Boolean).join(" · ") || "Stack not detected yet",
          host: hostOf(project.productionUrl),
          checkedAgo: project.checkedAt ? `Checked ${ago(project.checkedAt, now)}` : "Not checked yet",
          readinessPrompt: `Use launchwright check_readiness on ${project.repo}`,
          githubUrl: `https://github.com/${project.repo}`,
        }
      : null,
    title: project ? project.repo.split("/")[1] : "Welcome to launchwright",
    crumb: project ? project.repo.split("/")[1] : "getting started",
    checks,
    sorted,
    attention: checks.filter((c) => !c.isPass),
    passed: checks.filter((c) => c.isPass),
    passing,
    total: checks.length,
    failing: checks.filter((c) => c.isFail).length,
    warning: checks.filter((c) => c.isWarn).length,
    notChecked: checks.filter((c) => c.isOpen).length,
    passedCount: checks.filter((c) => c.isPass).length,
    readinessHeading: project ? `${passing} of ${checks.length} checks passed` : "No checks yet",
    next: next
      ? { ...next, heading: `Fix ${next.title.replace(/^./, (ch) => ch.toLowerCase())}`, module: nextModule ? `Module ${nextModule.n} · ${nextModule.name}` : "", lesson: nextLesson!.title, lessonFull: nextLesson!.full }
      : null,
    allPassing: !!project && !next,
    modules,
    current,
    modulesDone: modules.filter((m) => m.isDone).length,
    modulesTotal: modules.length,
    conceptsCovered: me.conceptsSeen.length,
    exercisesDone: (me.exercisesDone ?? []).length,
    exercisesTotal: EXERCISES.length,
    lessonsHeading: `${modules.filter((m) => m.isDone).length} of ${modules.length} modules done`,
    connections,
    account,
    connectedCount: connections.filter((c) => c.connected).length,
    cloudflareConnected,
    approvals,
    approvalCount: approvals.length,
    hasApprovals: approvals.length > 0,
    noApprovals: approvals.length === 0,
    approvalBadge: approvals.length ? String(approvals.length) : null,
    approvalsLabel: approvals.length === 1 ? "1 approval waiting" : `${approvals.length} approvals waiting`,
    audit,
    recent: audit.slice(0, 8),
    hasAudit: audit.length > 0,
    toolCalls: audit.filter((a) => a.actor === "ai").slice(0, 12),
    secrets: me.secrets.map((s) => ({ ...s, where: s.target === "github_actions" ? "GitHub Actions" : "Cloudflare Worker", updated: ago(s.updatedAt, now) })),
    hasSecrets: me.secrets.length > 0,
    mcp: { ...me.mcp, notConnected: !me.mcp.connected, label: me.mcp.connected ? `${me.mcp.client ?? "AI tool"} connected` : "AI tool not connected", lastSeen: me.mcp.lastSeen ? `Last tool call ${ago(me.mcp.lastSeen, now)}` : "" },
    onboarding,
    setupDone,
    setupTotal: onboarding.length,
    showOnboarding: setupDone < onboarding.length,
    setupHeading: `${setupDone} of ${onboarding.length} setup steps done`,
  };
}
