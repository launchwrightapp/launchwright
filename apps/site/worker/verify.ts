// Email verification for the pilot: a 6-digit code by email, then a short session.
//
//   POST /api/pilot/code    { email, cf-turnstile-response }  → emails a code
//   POST /api/pilot/verify  { email, code }                   → sets the session cookie
//
// The questionnaire (/pilot/apply) and POST /api/waitlist need that session, and the
// application is saved under the session's email, never one sent in the form.
// Codes and session tokens are stored only as SHA-256 hashes (sql/004_pilot_codes.sql).
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { clean, cleanEmail, EMAIL_RE, json, readBody, seeOther } from "./http";
import { underLimit, verifyTurnstile, type GuardEnv } from "./guard";
import { sendCode } from "./emails";

export interface VerifyEnv extends GuardEnv {
  DATABASE_URL?: string;
  EMAIL?: SendEmail;
}

type Sql = NeonQueryFunction<false, false>;

export const CODE_MINUTES = 10; // a code works for this long
export const MAX_TRIES = 5; // wrong guesses allowed per code
export const RESEND_SECONDS = 30; // wait before asking for another code
const SENDS_PER_15_MIN = 3; // codes per email address per 15 minutes
const CODES_PER_HOUR = 100; // all code emails together, so we can't be used to spam strangers
const SESSION_HOURS = 2; // time to finish the questionnaire after verifying
export const COOKIE = "lw_pilot";

const NO_DATABASE = "Applications aren't being saved yet. Please check back soon.";

const enc = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const codeHash = (email: string, code: string) => sha256(`${email}:${code}`);

// Compare two hex hashes without stopping at the first difference.
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Uniform 000000–999999. 4,294,000,000 is the largest multiple of 1,000,000 under 2^32.
function newCode(): string {
  const n = new Uint32Array(1);
  do crypto.getRandomValues(n);
  while (n[0] >= 4_294_000_000);
  return String(n[0] % 1_000_000).padStart(6, "0");
}

function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export const hasSessionCookie = (req: Request) => !!readCookie(req, COOKIE);

function cookie(url: URL, value: string, maxAge: number) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
export const clearSession = (url: URL) => cookie(url, "", 0);

// The verified email for this request, or null when there's no valid session.
export async function sessionEmail(req: Request, sql: Sql): Promise<string | null> {
  const token = readCookie(req, COOKIE);
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  const rows = await sql`
    select email from pilot_codes
    where session_hash = ${await sha256(token)} and session_expires_at > now()
  `;
  return (rows[0]?.email as string | undefined) ?? null;
}

// Done with verification (application saved): forget the code and the session.
export const endSession = (sql: Sql, email: string) => sql`delete from pilot_codes where email = ${email}`;

export async function requestCode(req: Request, env: VerifyEnv, url: URL): Promise<Response> {
  const parsed = await readBody(req);
  if (!parsed) return json({ error: "Invalid request." }, 400);
  const { data, isForm } = parsed;
  const email = cleanEmail(data.email);
  const next = `/pilot/verify?email=${encodeURIComponent(email)}`;

  // Honeypot: bots fill hidden fields. Pretend it worked.
  if (clean(data.website, 200)) return isForm ? seeOther(next) : json({ ok: true, resendIn: RESEND_SECONDS });
  if (!EMAIL_RE.test(email)) return json({ error: "Please check your email address." }, 400);

  if (!(await underLimit(req, env))) {
    return json({ error: "Too many tries. Please wait a minute and try again." }, 429, { "retry-after": "60" });
  }
  const verdict = await verifyTurnstile(data["cf-turnstile-response"], req, env);
  if (verdict === "misconfigured") {
    console.error("TURNSTILE_SITEKEY and TURNSTILE_SECRET must both be set");
    return json({ error: "Applications are paused for a moment. Please try again later." }, 503);
  }
  if (verdict === "failed") {
    return json({ error: "We couldn't confirm you're not a bot. Please try again, or email hello@launchwright.app." }, 403);
  }
  if (!env.DATABASE_URL || !env.EMAIL) return json({ error: NO_DATABASE }, 503);

  const sql = neon(env.DATABASE_URL);
  try {
    // Unfinished verifications don't stay around: drop rows older than a day.
    await sql`delete from pilot_codes where sent_at < now() - interval '1 day' and coalesce(session_expires_at, '-infinity') < now()`;
    const [{ n }] = await sql`select count(*)::int as n from pilot_codes where sent_at > now() - interval '1 hour'`;
    if (n >= CODES_PER_HOUR) {
      console.error("pilot code cap reached", n);
      return json({ error: "We're getting a lot of applications right now. Please try again in an hour." }, 503, { "retry-after": "3600" });
    }

    const code = newCode();
    // One row per email. A new code replaces the old one and resets its tries.
    // The where clause enforces the resend wait and the per-email limit in one step.
    const rows = await sql`
      insert into pilot_codes (email, code_hash, expires_at, sent_at)
      values (${email}, ${await codeHash(email, code)}, now() + make_interval(mins => ${CODE_MINUTES}), now())
      on conflict (email) do update set
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        sent_at = now(),
        sends = case when pilot_codes.window_start > now() - interval '15 minutes' then pilot_codes.sends + 1 else 1 end,
        window_start = case when pilot_codes.window_start > now() - interval '15 minutes' then pilot_codes.window_start else now() end
      where pilot_codes.sent_at < now() - make_interval(secs => ${RESEND_SECONDS})
        and (pilot_codes.window_start <= now() - interval '15 minutes' or pilot_codes.sends < ${SENDS_PER_15_MIN})
      returning email
    `;
    if (!rows.length) {
      return json({ error: "We just sent a code to this email. Check your inbox and spam folder, or wait a few minutes before asking again." }, 429, { "retry-after": String(RESEND_SECONDS) });
    }
    await sendCode(env.EMAIL, email, code);
  } catch (err) {
    console.error("pilot code failed", err);
    return json({ error: "We couldn't send the code. Please check the address and try again." }, 502);
  }

  return isForm ? seeOther(next) : json({ ok: true, resendIn: RESEND_SECONDS });
}

export async function checkCode(req: Request, env: VerifyEnv, url: URL): Promise<Response> {
  const parsed = await readBody(req);
  if (!parsed) return json({ error: "Invalid request." }, 400);
  const { data, isForm } = parsed;
  const email = cleanEmail(data.email);
  const code = clean(data.code, 20).replace(/\D/g, "");

  if (!EMAIL_RE.test(email)) return json({ error: "Please check your email address." }, 400);
  if (code.length !== 6) return json({ error: "Enter the 6-digit code from the email." }, 400);
  if (!(await underLimit(req, env))) {
    return json({ error: "Too many tries. Please wait a minute and try again." }, 429, { "retry-after": "60" });
  }
  if (!env.DATABASE_URL) return json({ error: NO_DATABASE }, 503);

  const sql = neon(env.DATABASE_URL);
  try {
    // Count the try first, in the same statement, so parallel guesses can't skip the limit.
    const [row] = await sql`
      update pilot_codes set attempts = attempts + 1
      where email = ${email} and code_hash is not null
      returning code_hash, attempts, expires_at > now() as live
    `;
    if (!row) return json({ error: "There's no code waiting for this email. Send a new one." }, 400);
    if (!row.live) return json({ error: "That code has expired. Send a new one.", expired: true }, 400);
    if (row.attempts > MAX_TRIES) return json({ error: "Too many wrong codes. Send a new one.", expired: true }, 429);
    if (!sameHash(await codeHash(email, code), row.code_hash as string)) {
      const left = MAX_TRIES - (row.attempts as number);
      return json(left > 0
        ? { error: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` }
        : { error: "That code isn't right. Send a new one.", expired: true }, 400);
    }

    // Right code. Already applied? Say so instead of starting a second application.
    const applied = await sql`select 1 from waitlist where email = ${email}`;
    if (applied.length) {
      await endSession(sql, email);
      return json({ ok: true, applied: true });
    }

    const token = newToken();
    await sql`
      update pilot_codes set code_hash = null, session_hash = ${await sha256(token)},
        session_expires_at = now() + make_interval(hours => ${SESSION_HOURS})
      where email = ${email}
    `;
    const setCookie = { "set-cookie": cookie(url, token, SESSION_HOURS * 3600) };
    return isForm ? seeOther("/pilot/apply", setCookie) : json({ ok: true, next: "/pilot/apply" }, 200, setCookie);
  } catch (err) {
    console.error("pilot verify failed", err);
    return json({ error: "Server error. Please try again." }, 500);
  }
}
