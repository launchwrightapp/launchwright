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

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(data));
}

async function handle(req, res) {
  const p = new URL(req.url, "http://localhost").pathname;
  const m = req.method;

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
