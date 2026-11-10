// Pilot applicants for the team: list them and accept one (sends the "You're in" email).
// Same data the site's /api/admin/* and `npm run pilot` use; this is the signed-in version.
import { neon } from "@neondatabase/serverless";
import { sendAcceptance, sendReminder, type Applicant, type ReminderStage } from "../../site/worker/emails";
import { isAdmin, type MessagesEnv } from "./messages";
import type { User } from "./session";
import { forgetAccess } from "../../../packages/core/pilot-access";
import { rankApplicants, ReviewError, REVIEW_MODEL, type ReviewRow } from "./review";
import { loadActivity, recommend } from "./activity";

export interface ApplicantsEnv extends MessagesEnv {
  ANTHROPIC_API_KEY?: string; // secret; enables "Rank with Claude" (unset = the button says how to turn it on)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

export async function handleApplicantsApi(req: Request, url: URL, env: ApplicantsEnv, user: User): Promise<Response | null> {
  const p = url.pathname;
  const PATHS = ["/api/admin/applicants", "/api/admin/applicants/accept", "/api/admin/applicants/remove", "/api/admin/applicants/review",
    "/api/admin/applicants/activity", "/api/admin/applicants/recommend", "/api/admin/applicants/remind"];
  if (!PATHS.includes(p)) return null;
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
    // Remove access, for one person ({ email }) or several at once ({ emails }): ends their
    // dashboard and MCP access (within about 30 seconds on other Worker instances). Always a
    // team member's click; Claude only recommends. No email goes out. They go back to Waiting
    // and can be accepted again.
    if (p === "/api/admin/applicants/remove" && req.method === "POST") {
      if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "Invalid request." }, 400);
      const data = (await req.json().catch(() => null)) as { email?: unknown; emails?: unknown } | null;
      const list = Array.isArray(data?.emails) ? data.emails : [data?.email];
      const emails = [...new Set(list.map((e) => (typeof e === "string" ? e.trim().toLowerCase() : "")))];
      if (!emails.length || emails.length > 200 || !emails.every((e) => EMAIL_RE.test(e))) return json({ error: "Invalid email." }, 400);
      const rows = (await sql`
        with old as (select id, email, github_id from waitlist where email = any(${emails}) and accepted_at is not null for update)
        update waitlist w set accepted_at = null, github_id = null from old where w.id = old.id
        returning old.email, old.github_id`) as { email: string; github_id: number | string | null }[];
      if (!rows.length) return json({ error: emails.length === 1 ? `${emails[0]} isn't accepted.` : "None of them are accepted." }, 404);
      for (const r of rows) if (r.github_id != null) forgetAccess(Number(r.github_id));
      const [{ n }] = (await sql`select count(*)::int as n from waitlist where accepted_at is not null`) as { n: number }[];
      return json({ ok: true, email: rows[0].email, removed: rows.map((r) => r.email), accepted: n });
    }
    // What each accepted learner has done so far, and who is due a reminder (worker/activity.ts).
    if (p === "/api/admin/applicants/activity" && req.method === "GET") {
      return json({ activity: await loadActivity(sql) });
    }
    // Claude's keep / nudge / consider removing, from anonymised activity. Nothing is stored,
    // and nothing happens to anyone: the team decides.
    if (p === "/api/admin/applicants/recommend" && req.method === "POST") {
      if (!env.ANTHROPIC_API_KEY) return json({ error: "Set ANTHROPIC_API_KEY on the platform Worker to get recommendations." }, 503);
      const activity = await loadActivity(sql);
      try {
        const recommendations = await recommend(env.ANTHROPIC_API_KEY, activity);
        return json({ model: REVIEW_MODEL, reviewed: activity.length, recommendations });
      } catch (e) {
        if (e instanceof ReviewError) return json({ error: e.message }, 502);
        throw e;
      }
    }
    // Send the stage reminder to everyone who is due right now (or only those in { emails } who
    // are due). Who is due is decided here, server-side, so a stale page can't over-send.
    if (p === "/api/admin/applicants/remind" && req.method === "POST") {
      if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "Invalid request." }, 400);
      if (!env.EMAIL) return json({ error: "Email sending isn't set up on the platform." }, 503);
      const data = (await req.json().catch(() => null)) as { emails?: unknown } | null;
      const only = Array.isArray(data?.emails) ? new Set(data.emails.filter((e): e is string => typeof e === "string").map((e) => e.trim().toLowerCase())) : null;
      const due = (await loadActivity(sql)).filter((a) => a.reminderDue && (!only || only.has(a.email)));
      const sent: string[] = [];
      const failed: string[] = [];
      for (const a of due) {
        // Claim the reminder first, so two clicks at once can't both send it.
        const claimed = await sql`update waitlist set reminders_sent = reminders_sent + 1, last_reminded_at = now()
          where email = ${a.email} and accepted_at is not null and reminders_sent = ${a.remindersSent} returning email`;
        if (!claimed.length) continue;
        try {
          await sendReminder(env.EMAIL, a, a.stage as ReminderStage);
          sent.push(a.email);
        } catch (err) {
          console.error("reminder email failed", err);
          await sql`update waitlist set reminders_sent = greatest(reminders_sent - 1, 0), last_reminded_at = ${a.lastRemindedAt} where email = ${a.email}`;
          failed.push(a.email);
        }
      }
      return json({ ok: true, sent, failed });
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
