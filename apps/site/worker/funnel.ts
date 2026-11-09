// The pilot funnel: how far people get, as anonymous daily totals (sql/005_funnel.sql).
// Nothing here identifies a person: no email, no IP, no cookie. The browser sends each
// event at most once per tab (src/scripts/funnel.ts), and the server counts the rest.
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { clientIp, crossSite } from "./guard";
import { json, readBody } from "./http";

type Sql = NeonQueryFunction<false, false>;

// Sent by the browser: a landing page visit, and each application step reached (1-5).
export const BROWSER_EVENTS = ["visit", "apply_1", "apply_2", "apply_3", "apply_4", "apply_5"] as const;
// Counted by the server: a new email asked for a code, and an email was verified.
export type ServerEvent = "code_sent" | "verified";

export interface FunnelEnv {
  DATABASE_URL?: string;
  FUNNEL_LIMIT?: RateLimit;
  TURNSTILE_HOSTNAMES?: string; // the production hostnames; only those count
}

// Only the real site counts. PR previews share the database, and their tests would
// otherwise add to the totals.
const counting = (env: FunnelEnv, url: URL) =>
  !!env.DATABASE_URL && (env.TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim()).includes(url.hostname);

export async function count(sql: Sql, event: string): Promise<void> {
  await sql`
    insert into funnel_daily (day, event, n) values (current_date, ${event}, 1)
    on conflict (day, event) do update set n = funnel_daily.n + 1
  `;
}

// For the server's own events. A failed count never fails the request.
export function countLater(env: FunnelEnv, url: URL, ctx: ExecutionContext, event: ServerEvent) {
  if (!counting(env, url)) return;
  ctx.waitUntil(count(neon(env.DATABASE_URL!), event).catch((err) => console.error("funnel count failed", err)));
}

// POST /api/funnel { event }. Answers 204 right away; the count is written after.
export async function track(req: Request, env: FunnelEnv, url: URL, ctx: ExecutionContext): Promise<Response> {
  if (crossSite(req, url)) return json({ error: "Forbidden." }, 403);
  const parsed = await readBody(req);
  const event = parsed?.data.event;
  if (typeof event !== "string" || !(BROWSER_EVENTS as readonly string[]).includes(event)) return json({ error: "Unknown event." }, 400);
  if (env.FUNNEL_LIMIT && !(await env.FUNNEL_LIMIT.limit({ key: clientIp(req) })).success) return new Response(null, { status: 204 });
  if (counting(env, url)) {
    const sql = neon(env.DATABASE_URL!);
    ctx.waitUntil(count(sql, event).catch((err) => console.error("funnel count failed", err)));
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

// GET /api/admin/funnel?days=N (admin only; checked by the caller). Without days: all time.
// Site steps come from funnel_daily and the waitlist; learner steps from the MCP server's
// tables (same database), counting each GitHub account once, on the day it first got there.
// The application form's steps (src/pages/pilot/apply.astro): title and what it asks.
const FORM_STEPS = [
  ["About you", "First name, what describes them, city."],
  ["Your experience", "How much they've coded, which AI tools they use."],
  ["Your project", "What they want to ship, where it is now, GitHub username."],
  ["Your goals", "What they want to learn, hours a week."],
  ["Review and send", "Their answers and the consent box. Next is Send."],
] as const;

export async function report(sql: Sql, url: URL) {
  const raw = Number(url.searchParams.get("days"));
  const days = Number.isInteger(raw) && raw > 0 && raw <= 3650 ? raw : null;
  // Browser and email-code steps only exist from the day counting started, while applications
  // and learner activity go back further. Start every step on that day, or a later step can
  // read bigger than the one before it (e.g. 11 applications sent vs. 1 who reached step 5).
  const [first] = (await sql`select min(day)::text as day from funnel_daily`) as { day: string | null }[];
  const tracking = first?.day ? `${first.day}T00:00:00.000Z` : null;
  const wanted = days ? new Date(Date.now() - days * 86_400_000).toISOString() : "-infinity";
  const since = tracking && (wanted === "-infinity" || tracking > wanted) ? tracking : wanted;
  const sinceDay = since === "-infinity" ? "-infinity" : since.slice(0, 10);

  const counts = (await sql`
    select event, sum(n)::int as n from funnel_daily where day >= ${sinceDay}::date group by event
  `) as { event: string; n: number }[];
  const by = Object.fromEntries(counts.map((r) => [r.event, r.n]));

  const [apps] = (await sql`
    select count(*) filter (where created_at >= ${since}::timestamptz)::int as submitted,
           count(*) filter (where accepted_at >= ${since}::timestamptz)::int as accepted
    from waitlist
  `) as { submitted: number; accepted: number }[];

  // First time each account did something, then count those that fall in the window.
  // Tables may not exist yet on a fresh database; then these steps read 0.
  let learners = { ai_connected: 0, first_check: 0, production_deploy: 0, all_checks_live: 0 };
  try {
    const [row] = (await sql`
      with firsts as (
        select github_id,
          min(created_at) filter (where actor = 'ai') as ai_connected,
          min(created_at) filter (where tool = 'check_readiness' and outcome = 'ok') as first_check,
          min(created_at) filter (where tool = 'deploy' and outcome = 'ok' and summary like 'Production deploy%') as production_deploy
        from audit_log group by github_id
      )
      select
        count(*) filter (where ai_connected >= ${since}::timestamptz)::int as ai_connected,
        count(*) filter (where first_check >= ${since}::timestamptz)::int as first_check,
        count(*) filter (where production_deploy >= ${since}::timestamptz)::int as production_deploy,
        (select count(distinct github_id)::int from projects
          where production_url is not null and readiness_total > 0 and readiness_passed = readiness_total
            and checked_at >= ${since}::timestamptz) as all_checks_live
      from firsts
    `) as (typeof learners)[];
    if (row) learners = row;
  } catch (err) {
    console.error("funnel learner steps failed", err);
  }

  return {
    days,
    countingSince: first?.day ?? null,
    // detail: what the step means, so a drop tells you where people stopped.
    steps: [
      { key: "visit", label: "Landing page visits", detail: "Opened the home page. Once per browser tab.", n: by.visit ?? 0 },
      { key: "code_sent", label: "Asked for an email code", detail: "Typed a new email on the pilot page and got a code. Resends don't count.", n: by.code_sent ?? 0 },
      { key: "verified", label: "Verified their email", detail: "Entered the code from their email.", n: by.verified ?? 0 },
      ...FORM_STEPS.map(([title, detail], i) => ({ key: `apply_${i + 1}`, label: `Form step ${i + 1} of 5: ${title}`, detail, n: by[`apply_${i + 1}`] ?? 0 })),
      { key: "submitted", label: "Sent the application", detail: "Pressed Send. The application is in the waitlist.", n: apps.submitted },
      { key: "accepted", label: "Accepted", detail: "You accepted them and the email went out.", n: apps.accepted },
      { key: "ai_connected", label: "AI tool connected", detail: "Their AI tool made its first launchwright call.", n: learners.ai_connected },
      { key: "first_check", label: "First readiness check", detail: "Their first check_readiness that finished.", n: learners.first_check },
      { key: "production_deploy", label: "First production deploy started", detail: "Asked to deploy to production for the first time.", n: learners.production_deploy },
      { key: "all_checks_live", label: "All checks passing on a live URL", detail: "A live URL with all 8 readiness checks passing.", n: learners.all_checks_live },
    ],
  };
}
