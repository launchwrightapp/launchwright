// Pilot applicants for the team: list them and accept one (sends the "You're in" email).
// Same data the site's /api/admin/* and `npm run pilot` use; this is the signed-in version.
import { neon } from "@neondatabase/serverless";
import { sendAcceptance, type Applicant } from "../../site/worker/emails";
import { isAdmin, type MessagesEnv } from "./messages";
import type { User } from "./session";
import { forgetAccess } from "../../../packages/core/pilot-access";
import { rankApplicants, ReviewError, REVIEW_MODEL, type ReviewRow } from "./review";

export interface ApplicantsEnv extends MessagesEnv {
  ANTHROPIC_API_KEY?: string; // secret; enables "Rank with Claude" (unset = the button says how to turn it on)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

export async function handleApplicantsApi(req: Request, url: URL, env: ApplicantsEnv, user: User): Promise<Response | null> {
  const p = url.pathname;
  if (p !== "/api/admin/applicants" && p !== "/api/admin/applicants/accept" && p !== "/api/admin/applicants/remove" && p !== "/api/admin/applicants/review") return null;
  if (!isAdmin(user, env)) return json({ error: "Not found." }, 404);
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin && origin !== (env.PUBLIC_ORIGIN ?? url.origin)) return json({ error: "Forbidden." }, 403);
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL isn't set on the platform." }, 503);
  const sql = neon(env.DATABASE_URL);

  try {
    if (p === "/api/admin/applicants" && req.method === "GET") {
      // select * so the questionnaire's answers column shows up once it exists.
      const rows = (await sql`select * from waitlist order by created_at desc limit 500`) as Record<string, unknown>[];
      return json({
        accepted: rows.filter((r) => r.accepted_at).length,
        applicants: rows.map((r) => ({
          email: r.email,
          name: r.name ?? null,
          building: r.building ?? null,
          answers: r.answers ?? null,
          appliedAt: r.created_at,
          acknowledgedAt: r.acknowledged_at ?? null,
          acceptedAt: r.accepted_at ?? null,
        })),
      });
    }

    if (p === "/api/admin/applicants/accept" && req.method === "POST") {
      if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "Invalid request." }, 400);
      const data = (await req.json().catch(() => null)) as { email?: unknown; resend?: unknown } | null;
      const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
      const resend = data?.resend === true;
      if (!EMAIL_RE.test(email)) return json({ error: "Invalid email." }, 400);
      if (!env.EMAIL) return json({ error: "Email sending isn't set up on the platform." }, 503);

      const [row] = (await sql`select email, name, building, accepted_at from waitlist where email = ${email}`) as Record<string, unknown>[];
      if (!row) return json({ error: `No application from ${email}.` }, 404);
      if (row.accepted_at && !resend) return json({ error: `${email} is already accepted.` }, 409);
      try {
        await sendAcceptance(env.EMAIL, row as unknown as Applicant);
      } catch (err) {
        console.error("acceptance email failed", err);
        return json({ error: "The email didn't send, so nothing changed. Try again." }, 502);
      }
      const [updated] = (await sql`update waitlist set accepted_at = coalesce(accepted_at, now()) where email = ${email} returning accepted_at`) as Record<string, unknown>[];
      const [{ n }] = (await sql`select count(*)::int as n from waitlist where accepted_at is not null`) as { n: number }[];
      return json({ ok: true, email, acceptedAt: updated.accepted_at, accepted: n });
    }
    // Remove access: ends their dashboard and MCP access (within about 30 seconds
    // on other Worker instances). No email goes out. They go back to Waiting and can be accepted again.
    if (p === "/api/admin/applicants/remove" && req.method === "POST") {
      if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "Invalid request." }, 400);
      const data = (await req.json().catch(() => null)) as { email?: unknown } | null;
      const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
      if (!EMAIL_RE.test(email)) return json({ error: "Invalid email." }, 400);
      const [row] = (await sql`
        with old as (select id, github_id from waitlist where email = ${email} and accepted_at is not null for update)
        update waitlist w set accepted_at = null, github_id = null from old where w.id = old.id
        returning old.github_id`) as { github_id: number | string | null }[];
      if (!row) return json({ error: `${email} isn't accepted.` }, 404);
      if (row.github_id != null) forgetAccess(Number(row.github_id));
      const [{ n }] = (await sql`select count(*)::int as n from waitlist where accepted_at is not null`) as { n: number }[];
      return json({ ok: true, email, accepted: n });
    }
    // Ask Claude to rank everyone still waiting (anonymised, see review.ts). Nothing is stored.
    if (p === "/api/admin/applicants/review" && req.method === "POST") {
      if (!env.ANTHROPIC_API_KEY) return json({ error: "Set ANTHROPIC_API_KEY on the platform Worker to rank with Claude." }, 503);
      const rows = (await sql`select email, building, answers from waitlist where accepted_at is null order by created_at limit 200`) as ReviewRow[];
      try {
        const reviews = await rankApplicants(env.ANTHROPIC_API_KEY, rows);
        return json({ model: REVIEW_MODEL, reviewed: rows.length, reviews });
      } catch (e) {
        if (e instanceof ReviewError) return json({ error: e.message }, 502);
        throw e;
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    console.error("applicants api error", e);
    return json({ error: "Something went wrong on our side. Please try again." }, 500);
  }
}
