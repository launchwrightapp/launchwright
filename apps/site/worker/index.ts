import { neon } from "@neondatabase/serverless";
import { sendAcknowledgement, sendAcceptance, type Applicant } from "./emails";
import { cleanAnswers } from "./options";
import { crossSite, underLimit } from "./guard";
import { clean, EMAIL_RE, json, readBody, seeOther } from "./http";
import { checkCode, clearSession, endSession, hasSessionCookie, requestCode, sessionEmail, type VerifyEnv } from "./verify";

interface Env extends VerifyEnv {
  ASSETS: Fetcher;
  ADMIN_TOKEN?: string; // secret; enables /api/admin/* (unset = those routes 404)
}

const PILOT_SEATS = 10;
// At most this many acknowledgement emails per hour. Applicants have verified their
// email by now, so this is a backstop. Applications are still saved past the cap.
const ACKS_PER_HOUR = 30;

// The questionnaire. Needs a verified email (worker/verify.ts); the email comes from
// the session, not the form.
async function waitlist(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const parsed = await readBody(req);
  if (!parsed) return json({ error: "Invalid request." }, 400);
  const { data, isForm } = parsed;

  const done = () =>
    isForm
      ? seeOther("/pilot/thanks", { "set-cookie": clearSession(url) })
      : json({ ok: true }, 200, { "set-cookie": clearSession(url) });
  const unverified = (error: string) =>
    isForm ? seeOther("/pilot?expired=1") : json({ error, verify: true }, 401);

  // Honeypot: bots fill hidden fields. Pretend it worked.
  if (clean(data.website, 200)) return done();

  const name = clean(data.name, 100);
  const building = clean(data.building, 280);
  const consent = data.consent === true || data.consent === "yes";
  // Everything else from the questionnaire: known choices and short text only.
  const answers = cleanAnswers(data);

  if (!consent) return json({ error: "Please give consent to join." }, 400);
  if (!hasSessionCookie(req)) return unverified("Please verify your email first.");

  if (!(await underLimit(req, env))) {
    return json({ error: "Too many tries. Please wait a minute and try again." }, 429, { "retry-after": "60" });
  }
  if (!env.DATABASE_URL) {
    return json({ error: "Applications aren't being saved yet. Please check back soon." }, 503);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const email = await sessionEmail(req, sql);
    if (!email) return unverified("Your email check has expired. Please verify your email again.");

    const rows = await sql`
      insert into waitlist (email, name, building, answers, consent_at)
      values (${email}, ${name || null}, ${building || null}, ${answers ? JSON.stringify(answers) : null}::jsonb, now())
      on conflict (email) do nothing
      returning id
    `;
    await endSession(sql, email);
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

const SITEKEY_PAGES = new Set(["/", "/index.html", "/pilot", "/pilot/", "/pilot/verify"]);

type Route = (req: Request, env: Env, url: URL, ctx: ExecutionContext) => Promise<Response>;
const POST_ROUTES: Record<string, Route> = {
  "/api/pilot/code": requestCode,
  "/api/pilot/verify": checkCode,
  "/api/waitlist": waitlist,
};

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);

    const post = POST_ROUTES[url.pathname];
    if (post) {
      if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "POST" });
      if (crossSite(req, url)) return json({ error: "Forbidden." }, 403);
      return post(req, env, url, ctx);
    }

    if (url.pathname.startsWith("/api/admin/")) return admin(req, env, url);

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);

    // Pages with a "Send code" form get the Turnstile sitekey for this deployment (test key locally).
    if (SITEKEY_PAGES.has(url.pathname)) {
      const page = await env.ASSETS.fetch(req);
      const key = env.TURNSTILE_SITEKEY ?? "";
      return new HTMLRewriter()
        .on("[data-turnstile]", { element: (el) => { el.setAttribute("data-sitekey", key); } })
        .transform(page);
    }

    // The questionnaire needs a verified email. Locally there's no database, so the page
    // shows without one; sending still needs a session (see waitlist()).
    if (url.pathname === "/pilot/apply" || url.pathname === "/pilot/apply/") {
      if (!env.DATABASE_URL) return env.ASSETS.fetch(req);
      let email: string | null = null;
      try {
        email = hasSessionCookie(req) ? await sessionEmail(req, neon(env.DATABASE_URL)) : null;
      } catch (err) {
        console.error("pilot session check failed", err);
      }
      if (!email) return seeOther(hasSessionCookie(req) ? "/pilot?expired=1" : "/pilot");
      const verified = email;
      const page = await new HTMLRewriter()
        .on("[data-verified]", { element: (el) => { el.removeAttribute("hidden"); } })
        .on("[data-verified-email]", { element: (el) => { el.setInnerContent(verified); } })
        .transform(await env.ASSETS.fetch(req));
      const res = new Response(page.body, page);
      res.headers.set("cache-control", "private, no-store");
      return res;
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
