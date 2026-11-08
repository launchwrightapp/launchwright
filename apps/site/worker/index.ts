import { neon } from "@neondatabase/serverless";
import { sendAcknowledgement, sendAcceptance, type Applicant } from "./emails";

interface Env {
  ASSETS: Fetcher;
  DATABASE_URL?: string;
  EMAIL?: SendEmail; // Cloudflare Email Sending, from hello@launchwright.app
  ADMIN_TOKEN?: string; // secret; enables /api/admin/* (unset = those routes 404)
}

const PILOT_SEATS = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 4096;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function readBody(req: Request): Promise<{ data: Record<string, unknown>; isForm: boolean } | null> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return null;
  const type = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (text.length > MAX_BODY) return null;

  if (type.includes("application/json")) {
    try {
      return { data: JSON.parse(text), isForm: false };
    } catch {
      return null;
    }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return { data: Object.fromEntries(new URLSearchParams(text)), isForm: true };
  }
  return null;
}

async function waitlist(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const parsed = await readBody(req);
  if (!parsed) return json({ error: "Invalid request." }, 400);
  const { data, isForm } = parsed;

  const done = () =>
    isForm ? Response.redirect(`${url.origin}/?joined=1#pilot`, 303) : json({ ok: true });

  // Honeypot: bots fill hidden fields. Pretend it worked.
  if (clean(data.website, 200)) return done();

  const email = clean(data.email, 254).toLowerCase();
  const name = clean(data.name, 100);
  const building = clean(data.building, 280);
  const consent = data.consent === true || data.consent === "yes";

  if (!EMAIL_RE.test(email)) return json({ error: "Please check your email address." }, 400);
  if (!consent) return json({ error: "Please give consent to join." }, 400);

  if (!env.DATABASE_URL) {
    return json({ error: "Applications aren't being saved yet. Please check back soon." }, 503);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      insert into waitlist (email, name, building, consent_at)
      values (${email}, ${name || null}, ${building || null}, now())
      on conflict (email) do nothing
      returning id
    `;
    // New applicants get the acknowledgement once. Sending happens after the response,
    // and a failed send never fails the signup.
    if (rows.length && env.EMAIL) {
      const mail = env.EMAIL;
      ctx.waitUntil(
        sendAcknowledgement(mail, { email, name: name || null, building: building || null })
          .then(() => sql`update waitlist set acknowledged_at = now() where email = ${email}`)
          .catch((err) => console.error("acknowledgement email failed", err)),
      );
    }
  } catch (err) {
    console.error("waitlist insert failed", err);
    return json({ error: "Server error. Please try again later." }, 500);
  }

  return done();
}

// Admin: bearer token, compared in constant time.
async function isAdmin(req: Request, env: Env): Promise<boolean> {
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_TOKEN || !given) return false;
  const enc = new TextEncoder();
  // Hash both so they're the same length, then compare every byte.
  const [a, b] = await Promise.all([given, env.ADMIN_TOKEN].map((t) => crypto.subtle.digest("SHA-256", enc.encode(t))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function admin(req: Request, env: Env, url: URL): Promise<Response> {
  if (!env.ADMIN_TOKEN || !(await isAdmin(req, env))) return json({ error: "Not found." }, 404);
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL is not set." }, 503);
  const sql = neon(env.DATABASE_URL);

  // List applicants, newest first.
  if (url.pathname === "/api/admin/applicants" && req.method === "GET") {
    const rows = await sql`
      select email, name, building, created_at, acknowledged_at, accepted_at
      from waitlist order by created_at desc limit 500
    `;
    return json({ seats: PILOT_SEATS, accepted: rows.filter((r) => r.accepted_at).length, applicants: rows });
  }

  // Accept one applicant: sends the "You're in" email and records the seat.
  if (url.pathname === "/api/admin/accept" && req.method === "POST") {
    if (!env.EMAIL) return json({ error: "Email sending isn't set up yet." }, 503);
    const parsed = await readBody(req);
    const email = clean(parsed?.data.email, 254).toLowerCase();
    const resend = parsed?.data.resend === true;
    if (!EMAIL_RE.test(email)) return json({ error: "Give the applicant's email." }, 400);

    const [row] = await sql`select email, name, building, accepted_at from waitlist where email = ${email}`;
    if (!row) return json({ error: `No application from ${email}.` }, 404);
    if (row.accepted_at && !resend) return json({ error: `${email} was already accepted. Pass resend to send it again.` }, 409);
    if (!row.accepted_at) {
      const [{ n }] = await sql`select count(*)::int as n from waitlist where accepted_at is not null`;
      if (n >= PILOT_SEATS) return json({ error: `All ${PILOT_SEATS} seats are taken.` }, 409);
    }

    try {
      await sendAcceptance(env.EMAIL, row as Applicant);
    } catch (err) {
      console.error("acceptance email failed", err);
      return json({ error: `The email didn't send: ${(err as Error).message}` }, 502);
    }
    await sql`update waitlist set accepted_at = coalesce(accepted_at, now()) where email = ${email}`;
    const [{ n }] = await sql`select count(*)::int as n from waitlist where accepted_at is not null`;
    return json({ ok: true, email, seatsUsed: n, seats: PILOT_SEATS });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/waitlist") {
      if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "POST" });
      return waitlist(req, env, url, ctx);
    }

    if (url.pathname.startsWith("/api/admin/")) return admin(req, env, url);

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
