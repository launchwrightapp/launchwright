import { neon } from "@neondatabase/serverless";

interface Env {
  ASSETS: Fetcher;
  DATABASE_URL?: string;
}

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

async function waitlist(req: Request, env: Env, url: URL): Promise<Response> {
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
    await sql`
      insert into waitlist (email, name, building, consent_at)
      values (${email}, ${name || null}, ${building || null}, now())
      on conflict (email) do nothing
    `;
  } catch (err) {
    console.error("waitlist insert failed", err);
    return json({ error: "Server error. Please try again later." }, 500);
  }

  return done();
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/waitlist") {
      if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "POST" });
      return waitlist(req, env, url);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
