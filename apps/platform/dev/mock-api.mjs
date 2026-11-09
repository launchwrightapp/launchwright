// Dummy /api/* for `npm run dev:ui` (astro dev), so the admin and messages pages have
// something to show without the worker or a database. Never part of the build:
// the plugin only applies to the dev server. State lives in memory and resets on restart.
// Same response shapes as worker/applicants.ts and worker/messages.ts.

const SEATS = 10;
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const DAY = 24 * 60;

const applicants = [
  { email: "juan.delacruz@gmail.com", name: "Juan Dela Cruz", building: "Booking app for my tito's barbershop", answers: { role: "working", city: "Marikina", experience: "ai", tools: ["cursor", "claude-code"], stage: "local", github: "juandc", learn: ["deploy", "database", "security"], hours: "5-10", heard: "Facebook group" }, appliedAt: ago(9 * DAY), acknowledgedAt: ago(9 * DAY), acceptedAt: ago(7 * DAY) },
  { email: "maria.santos@up.edu.ph", name: "Maria Santos", building: "Org event ticketing for our college", answers: { role: "student", city: "Quezon City", experience: "courses", tools: ["codex", "copilot"], stage: "building", github: "mariasantos", learn: ["cicd", "testing", "deploy"], hours: "2-5", heard: "A friend" }, appliedAt: ago(8 * DAY), acknowledgedAt: ago(8 * DAY), acceptedAt: ago(6 * DAY) },
  { email: "paolo.reyes@outlook.com", name: "Paolo Reyes", building: "Inventory tracker for our sari-sari store", answers: { role: "shifter", city: "Cebu City", experience: "ai", tools: ["cursor"], stage: "live", github: "preyes", learn: ["secrets", "monitoring"], hours: "10plus", heard: "DEVCON Cebu" }, appliedAt: ago(6 * DAY), acknowledgedAt: null, acceptedAt: ago(5 * DAY) },
  { email: "bea.villanueva@gmail.com", name: "Bea Villanueva", building: "Portfolio site with a blog", answers: { role: "developer", city: "Pasig", experience: "work", tools: ["claude-code"], stage: "live", github: "beavillanueva", learn: ["cicd", "monitoring"], hours: "2-5" }, appliedAt: ago(4 * DAY), acknowledgedAt: null, acceptedAt: null },
  { email: "kevin.tan@yahoo.com", name: "Kevin Tan", building: "Tutoring scheduler for my mom's review center", answers: { role: "working", city: "Davao City", experience: "ai", tools: ["chatgpt", "other"], stage: "local", learn: ["security", "database", "deploy"], hours: "5-10", heard: "TikTok" }, appliedAt: ago(3 * DAY), acknowledgedAt: null, acceptedAt: null },
  { email: "andrea.garcia@dlsu.edu.ph", name: "Andrea Garcia", building: "Thesis: barangay health records app", answers: { role: "student", city: "Manila", experience: "courses", tools: ["copilot", "chatgpt"], stage: "building", github: "andreagarcia", learn: ["security", "database"], hours: "5-10", heard: "Our thesis adviser" }, appliedAt: ago(2 * DAY), acknowledgedAt: null, acceptedAt: null },
  { email: "migs.aquino@gmail.com", name: null, building: null, answers: null, appliedAt: ago(20 * 60), acknowledgedAt: null, acceptedAt: null },
  { email: "rica.bautista@gmail.com", name: "Rica Bautista", building: "Food delivery for our carinderia", answers: { role: "other", experience: "new", tools: ["none"], stage: "idea", learn: ["deploy"], hours: "lt2" }, appliedAt: ago(45), acknowledgedAt: null, acceptedAt: null },
];

let nextId = 100;
const msg = (direction, author, body, min, via = "platform") => ({ id: nextId++, direction, via, author, body, at: ago(min) });
const threads = [
  {
    id: 1, email: "juan.delacruz@gmail.com", login: "juandc", name: "Juan Dela Cruz", subject: "Deploy stuck waiting for approval", unread: true,
    messages: [
      msg("in", "Juan Dela Cruz", "Hi! Na-trigger ko yung deploy from Claude Code pero naka 'Waiting for your approval' lang siya. Saan ko po siya ia-approve?", 4 * 60),
      msg("out", "Ruther", "Hello Juan! Nasa Overview yan, sa \"Needs your approval\" card. It's waiting kasi may migration na nagda-drop ng column, so we ask first before anything destructive.", 3 * 60),
      msg("in", "Juan Dela Cruz", "Ahh okay, nakita ko na. Pero safe po ba i-drop yung `phone_old` column? Wala na naman gumagamit.", 12),
    ],
  },
  {
    id: 2, email: "maria.santos@up.edu.ph", login: "mariasantos", name: "Maria Santos", subject: "Playwright test fails only on preview", unread: true,
    messages: [
      msg("in", "Maria Santos", "Pumapasa yung E2E sa laptop ko pero fail sa preview deploy. Error: `page.goto: net::ERR_NAME_NOT_RESOLVED`.", 90, "email"),
    ],
  },
  {
    id: 3, email: "paolo.reyes@outlook.com", login: "preyes", name: "Paolo Reyes", subject: "Thank you!", unread: false,
    messages: [
      msg("in", "Paolo Reyes", "Na-deploy ko na yung inventory tracker! 8/8 checks na. Salamat sa lessons, ngayon ko lang naintindihan yung env vars.", 2 * DAY),
      msg("out", "Ruther", "Congrats Paolo! 🎉 Next up: uptime check, para malaman mo agad pag down yung app.", 2 * DAY - 30),
    ],
  },
  {
    id: 4, email: "kevin.tan@yahoo.com", login: null, name: "Kevin Tan", subject: "Question about the pilot", unread: false,
    messages: [
      msg("in", "Kevin Tan", "Hello, pwede po ba kahit Lovable app yung dalhin ko sa pilot?", 3 * DAY, "email"),
    ],
  },
];
// The learner's own thread on /messages (sample learner: Juan).
const mine = threads[0];

const summary = (t) => {
  const last = t.messages.at(-1);
  return { id: t.id, email: t.email, login: t.login, name: t.name, subject: t.subject, unread: t.unread, at: last?.at ?? ago(0), preview: last?.body ?? "", waiting: last?.direction === "in" };
};

async function body(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

const sampleChecks = [
  { id: "secrets", title: "No secrets in the repo", status: "pass", detail: "No .env or key files are committed, .gitignore keeps .env out, and CI scans the whole history for keys on every push." },
  { id: "env_config", title: "Env config is documented", status: "pass", detail: "There is an example env file." },
  { id: "ci", title: "CI runs your tests", status: "pass", detail: "A workflow runs your tests on GitHub.", files: [".github/workflows/ci.yml"] },
  { id: "e2e", title: "E2E smoke test", status: "warn", detail: "CI runs Playwright, but only against a local server. Run it against the preview deploy too." },
  { id: "api_auth", title: "Auth on API routes", status: "fail", detail: "These routes answered with data to a request with no login: /api/bookings. Anyone can call them directly." },
  { id: "migrations", title: "Database migrations", status: "pass", detail: "Schema changes live in the repo as migration files." },
  { id: "security_headers", title: "HTTPS and security headers", status: "pass", detail: "barbershop.juan.dev redirects to HTTPS and sends HSTS, CSP, nosniff and a frame policy." },
  { id: "uptime", title: "Uptime check", status: "warn", detail: "barbershop.juan.dev is up (180 ms), but nothing checks it on a schedule." },
];
const me = {
  user: { id: 1, login: "juandc", name: "Juan Dela Cruz" },
  configured: { database: true, encryption: true, supabase: false },
  projects: [{ repo: "juan/barbershop-booking", framework: "Next.js", packageManager: "npm", database: "Neon", hosting: "Cloudflare Workers", worker: "barbershop", productionUrl: "https://barbershop.juan.dev", readiness: { passed: 5, total: 8 }, checks: sampleChecks, checkedAt: ago(20), updatedAt: ago(20) }],
  conceptsSeen: ["project_status", "pull_requests", "env_config", "secrets", "secret_storage", "env_drift", "database", "migrations", "ci", "secret_scanning", "e2e", "readiness", "api_auth"],
  connections: [
    { provider: "cloudflare", method: "api_key", label: "Juan's account", scopes: "Workers Scripts: Edit · Workers Observability: Read", connectedAt: ago(3 * DAY) },
    { provider: "neon", method: "api_key", label: "juan@example.com", scopes: "Neon API key", connectedAt: ago(3 * DAY) },
  ],
  approvals: [{ id: "a1", repo: "juan/barbershop-booking", client: "Claude Code", tool: "deploy", action: "deploy:production:main", title: "Deploy juan/barbershop-booking (main) to production", summary: "Builds main and replaces what your users see on barbershop.juan.dev. If the smoke test fails afterwards, it rolls back on its own.", detail: { workflow: "launchwright-deploy.yml", branch: "main" }, createdAt: ago(4), expiresAt: ago(-DAY) }],
  audit: [
    { actor: "ai", client: "Claude Code", tool: "deploy", repo: "juan/barbershop-booking", summary: "Asked for approval: Deploy to production", outcome: "pending", at: ago(4) },
    { actor: "ai", client: "Claude Code", tool: "check_readiness", repo: "juan/barbershop-booking", summary: "5 of 8 checks passed", outcome: "ok", at: ago(20) },
    { actor: "learner", client: "Dashboard", tool: "set_secret", repo: "juan/barbershop-booking", summary: "Typed the value of RESEND_API_KEY on the dashboard (hidden)", outcome: "ok", at: ago(40) },
    { actor: "ai", client: "Cursor", tool: "get_logs", repo: "juan/barbershop-booking", summary: "Read CI logs of run 812 (failure)", outcome: "ok", at: ago(90) },
    { actor: "ai", client: "Claude Code", tool: "setup_ci", repo: "juan/barbershop-booking", summary: "Opened PR #7 with 4 files", outcome: "ok", at: ago(120) },
  ],
  secrets: [{ repo: "juan/barbershop-booking", name: "DATABASE_URL", target: "cloudflare_worker", updatedAt: ago(3 * DAY) }, { repo: "juan/barbershop-booking", name: "RESEND_API_KEY", target: "github_actions", updatedAt: ago(40) }],
  mcp: { connected: true, client: "Claude Code", lastSeen: ago(4) },
};

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
}

async function handle(req, res) {
  const p = new URL(req.url, "http://localhost").pathname;
  const m = req.method;

  // Same shape as apps/site/worker/funnel.ts report(). Sample numbers.
  if (p === "/api/admin/funnel" && m === "GET") {
    const days = Number(new URL(req.url, "http://localhost").searchParams.get("days")) || null;
    const k = days === 7 ? 0.25 : days === 30 ? 1 : 1.6;
    const sample = [["visit", "Landing page visits", 1240], ["code_sent", "Asked for an email code", 96], ["verified", "Verified their email", 81],
      ["apply_1", "Reached form step 1 of 5", 80], ["apply_2", "Reached form step 2 of 5", 74], ["apply_3", "Reached form step 3 of 5", 52],
      ["apply_4", "Reached form step 4 of 5", 49], ["apply_5", "Reached form step 5 of 5", 47], ["submitted", "Sent the application", 44],
      ["accepted", "Accepted", 10], ["ai_connected", "AI tool connected (first tool call)", 8], ["first_check", "First readiness check", 7],
      ["production_deploy", "First production deploy started", 4], ["all_checks_live", "All checks passing on a live URL", 2]];
    return send(res, 200, { days, sample: true, steps: sample.map(([key, label, n]) => ({ key, label, n: Math.round(n * k) })) });
  }
  if (p === "/api/admin/applicants" && m === "GET") {
    return send(res, 200, { seats: SEATS, accepted: applicants.filter((a) => a.acceptedAt).length, applicants });
  }
  if (p === "/api/admin/applicants/accept" && m === "POST") {
    const { email, resend } = await body(req);
    const a = applicants.find((x) => x.email === email);
    if (!a) return send(res, 404, { error: `No application from ${email}.` });
    if (a.acceptedAt && !resend) return send(res, 409, { error: `${email} is already accepted.` });
    const accepted = applicants.filter((x) => x.acceptedAt).length;
    if (!a.acceptedAt && accepted >= SEATS) return send(res, 409, { error: `All ${SEATS} seats are taken.` });
    a.acceptedAt ??= ago(0);
    return send(res, 200, { ok: true, email, acceptedAt: a.acceptedAt, accepted: applicants.filter((x) => x.acceptedAt).length, seats: SEATS });
  }

  if (p === "/api/admin/threads" && m === "GET") {
    return send(res, 200, { threads: [...threads].sort((a, b) => (summary(b).at > summary(a).at ? 1 : -1)).map(summary) });
  }
  const t = p.match(/^\/api\/admin\/threads\/(\d+)(\/reply)?$/);
  if (t) {
    const thread = threads.find((x) => x.id === Number(t[1]));
    if (!thread) return send(res, 404, { error: "Not found." });
    if (!t[2] && m === "GET") {
      thread.unread = false;
      const { messages, unread, ...info } = thread;
      return send(res, 200, { thread: info, messages });
    }
    if (t[2] && m === "POST") {
      const text = String((await body(req)).body ?? "").trim();
      if (!text) return send(res, 400, { error: "Write a reply first." });
      const message = msg("out", "Ruther", text, 0);
      thread.messages.push(message);
      return send(res, 200, { message, emailed: !!thread.email });
    }
  }

  if (p === "/api/messages") {
    if (m === "GET") return send(res, 200, { email: mine.email, messages: mine.messages });
    if (m === "POST") {
      const text = String((await body(req)).body ?? "").trim();
      if (!text) return send(res, 400, { error: "Write a message first." });
      const message = msg("in", mine.name, text, 0);
      mine.messages.push(message);
      mine.unread = true;
      return send(res, 200, { message });
    }
  }

  // Learner dashboard (same shape as worker/learner.ts). Made-up data for UI work only.
  if (p === "/api/me" && m === "GET") return send(res, 200, me);
  const ap = p.match(/^\/api\/approvals\/(.+)$/);
  if (ap && m === "POST") {
    const data = await body(req);
    me.approvals = me.approvals.filter((a) => a.id !== ap[1]);
    me.audit.unshift({ actor: "learner", client: "Dashboard", tool: data.decision, repo: "juan/barbershop-booking", summary: `${data.decision === "approve" ? "Approved" : "Rejected"} (sample)`, outcome: "ok", at: ago(0) });
    return send(res, 200, { ok: true });
  }
  if (p.startsWith("/api/secret-requests/")) {
    if (m === "GET") return send(res, 200, { id: "sample", repo: "juan/barbershop-booking", name: "RESEND_API_KEY", target: "both", status: "waiting", expiresAt: ago(-60) });
    return send(res, 200, { ok: true, status: "submitted" });
  }
  if (p.startsWith("/api/connections/")) return send(res, 200, { ok: true, label: "Sample account" });

  return send(res, 404, { error: "Not found (dev mock API)." });
}

/** @returns {import("vite").Plugin} */
export function mockApi() {
  return {
    name: "launchwright-mock-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        handle(req, res).catch((e) => send(res, 500, { error: String(e) }));
      });
    },
  };
}
