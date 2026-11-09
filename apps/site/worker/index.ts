import { neon } from "@neondatabase/serverless";
import { sendAcknowledgement, sendAcceptance, type Applicant } from "./emails";
import { cleanAnswers } from "./options";
import { crossSite, underLimit, verifyTurnstile, type GuardEnv } from "./guard";

interface Env extends GuardEnv {
  ASSETS: Fetcher;
  DATABASE_URL?: string;
  EMAIL?: SendEmail; // Cloudflare Email Sending, from hello@launchwright.app
  ADMIN_TOKEN?: string; // secret; enables /api/admin/* (unset = those routes 404)
}

const PILOT_SEATS = 10;
// At most this many acknowledgement emails per hour, so a flood of fake signups
// can't use us to email strangers. Applications are still saved past the cap.
const ACKS_PER_HOUR = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 8192; // the pilot questionnaire (src/pages/pilot.astro) fits well under this

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
    // Checkbox groups send the same name more than once; keep every value.
    const data: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(text)) {
      const prev = data[k];
      data[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
    }
    return { data, isForm: true };
  }
  return null;
}

async function waitlist(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const parsed = await readBody(req);
  if (!parsed) return json({ error: "Invalid request." }, 400);
  const { data, isForm } = parsed;

  const done = () =>
    isForm ? Response.redirect(`${url.origin}/pilot/thanks`, 303) : json({ ok: true });

  // Honeypot: bots fill hidden fields. Pretend it worked.
  if (clean(data.website, 200)) return done();

  const email = clean(data.email, 254).toLowerCase();
  const name = clean(data.name, 100);
  const building = clean(data.building, 280);
  const consent = data.consent === true || data.consent === "yes";
  // Everything else from the questionnaire: known choices and short text only.
  const answers = cleanAnswers(data);

  if (!EMAIL_RE.test(email)) return json({ error: "Please check your email address." }, 400);
  if (!consent) return json({ error: "Please give consent to join." }, 400);

  if (!(await underLimit(req, env))) {
    return json({ error: "Too many tries. Please wait a minute and try again." }, 429, { "retry-after": "60" });
  }
  const verdict = await verifyTurnstile(data["cf-turnstile-response"], req, env);
  if (verdict === "misconfigured") {
    console.error("TURNSTILE_SITEKEY and TURNSTILE_SECRET must both be set");
    return json({ error: "Applications are paused for a moment. Please try again later." }, 503);
  }
  if (verdict === "failed") {
    return json({
      error: "We couldn't confirm you're not a bot. Please try again, or email hello@launchwright.app.",
    }, 403);
  }

  if (!env.DATABASE_URL) {
    return json({ error: "Applications aren't being saved yet. Please check back soon." }, 503);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      insert into waitlist (email, name, building, answers, consent_at)
      values (${email}, ${name || null}, ${building || null}, ${answers ? JSON.stringify(answers) : null}::jsonb, now())
      on conflict (email) do nothing
      returning id
    `;
    // New applicants get the acknowledgement once. Sending happens after the response,
    // and a failed send never fails the signup.
    const [{ sent }] = rows.length && env.EMAIL
      ? await sql`select count(*)::int as sent from waitlist where acknowledged_at > now() - interval '1 hour'`
      : [{ sent: 0 }];
    if (rows.length && env.EMAIL && sent < ACKS_PER_HOUR) {
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
      select email, name, building, answers, created_at, acknowledged_at, accepted_at
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
      if (crossSite(req, url)) return json({ error: "Forbidden." }, 403);
      return waitlist(req, env, url, ctx);
    }

    if (url.pathname.startsWith("/api/admin/")) return admin(req, env, url);

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);

    // The pilot page gets the Turnstile sitekey for this deployment (test key locally).
    if (url.pathname === "/pilot" || url.pathname === "/pilot/") {
      const page = await env.ASSETS.fetch(req);
      const key = env.TURNSTILE_SITEKEY ?? "";
      return new HTMLRewriter()
        .on("[data-turnstile]", { element: (el) => { el.setAttribute("data-sitekey", key); } })
        .transform(page);
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
