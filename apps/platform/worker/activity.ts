// Pilot activity for the team: how far each accepted learner got, who is due a reminder, and
// Claude's recommendation (keep / nudge / consider removing). Claude only recommends: removing
// access is always a person on the team clicking Remove (worker/applicants.ts).
// Privacy (apps/site/src/pages/privacy.astro): Claude gets activity counts, days, the stage they
// reached and two of their own answers (hours a week, project stage), under an opaque id. Never
// names, emails, GitHub usernames, repo names, code, or what their AI tool did.
import Anthropic from "@anthropic-ai/sdk";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { OPTIONS } from "../../site/worker/options";
import { REVIEW_MODEL, ReviewError } from "./review";

type Sql = NeonQueryFunction<false, false>;

// Where an accepted learner is, in pilot order. Reminders go to the first three.
export const STAGES = ["not_signed_in", "signed_in", "ai_connected", "checked", "deployed", "live"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  not_signed_in: "Not signed in",
  signed_in: "Signed in",
  ai_connected: "AI tool connected",
  checked: "Ran a readiness check",
  deployed: "Deployed",
  live: "Live, all checks passing",
};

export const REMINDER = { maxPerPerson: 3, everyDays: 3, firstAfterDays: 2, quietDays: 3 } as const;
// Claude may only recommend removal for someone accepted at least this long ago.
export const REMOVAL_AFTER_DAYS = 14;

export interface Activity {
  email: string;
  name: string | null;
  acceptedAt: string;
  stage: Stage;
  lastActiveAt: string | null; // last thing their AI tool or they did in launchwright
  aiCalls: number;
  checks: number;
  connections: number;
  concepts: number;
  readiness: { passed: number; total: number } | null;
  remindersSent: number;
  lastRemindedAt: string | null;
  reminderDue: boolean;
  hours: string | null;
  projectStage: string | null;
}

interface Row {
  email: string; name: string | null; accepted_at: string; github_id: string | null; answers: Record<string, unknown> | null;
  reminders_sent: number | null; last_reminded_at: string | null;
  ai_calls: number; checks: number; deploys: number; last_active: string | null;
  connections: number; concepts: number; passed: number | null; total: number | null; live: boolean;
}

const DAY = 86_400_000;
const daysSince = (iso: string | null, now: number) => (iso ? Math.floor((now - Date.parse(iso)) / DAY) : null);

export function stageOf(r: Pick<Row, "github_id" | "ai_calls" | "checks" | "deploys" | "live">): Stage {
  if (r.live) return "live";
  if (r.deploys > 0) return "deployed";
  if (r.checks > 0) return "checked";
  if (r.ai_calls > 0) return "ai_connected";
  if (r.github_id != null) return "signed_in";
  return "not_signed_in";
}

// Due: stuck before their first readiness check, accepted a couple of days ago, quiet lately,
// and not reminded too often or too recently.
export function reminderDue(a: Pick<Activity, "stage" | "acceptedAt" | "lastActiveAt" | "remindersSent" | "lastRemindedAt">, now = Date.now()) {
  if (STAGES.indexOf(a.stage) >= STAGES.indexOf("checked")) return false;
  if (a.remindersSent >= REMINDER.maxPerPerson) return false;
  if ((daysSince(a.acceptedAt, now) ?? 0) < REMINDER.firstAfterDays) return false;
  const quiet = daysSince(a.lastActiveAt, now);
  if (quiet !== null && quiet < REMINDER.quietDays) return false;
  const reminded = daysSince(a.lastRemindedAt, now);
  return reminded === null || reminded >= REMINDER.everyDays;
}

export async function loadActivity(sql: Sql, now = Date.now()): Promise<Activity[]> {
  // The MCP tables live in the same database. Per learner: what their AI tool did, what they
  // connected, lessons seen, and their best project.
  const rows = (await sql`
    select w.email, w.name, w.accepted_at, w.github_id, w.answers,
      w.reminders_sent, w.last_reminded_at,
      coalesce(a.ai_calls, 0)::int as ai_calls, coalesce(a.checks, 0)::int as checks,
      coalesce(a.deploys, 0)::int as deploys, a.last_active,
      coalesce(c.n, 0)::int as connections, coalesce(l.n, 0)::int as concepts,
      p.passed, p.total, coalesce(p.live, false) as live
    from waitlist w
    left join lateral (
      select count(*) filter (where actor = 'ai') as ai_calls,
             count(*) filter (where tool = 'check_readiness' and outcome = 'ok') as checks,
             count(*) filter (where tool = 'deploy' and outcome = 'ok') as deploys,
             max(created_at) as last_active
      from audit_log where github_id = w.github_id
    ) a on true
    left join lateral (select count(*) as n from connections where github_id = w.github_id) c on true
    left join lateral (select count(*) as n from lesson_progress where github_id = w.github_id) l on true
    left join lateral (
      select readiness_passed as passed, readiness_total as total,
             (production_url is not null and readiness_total > 0 and readiness_passed = readiness_total) as live
      from projects where github_id = w.github_id
      order by readiness_passed desc nulls last, updated_at desc limit 1
    ) p on true
    where w.accepted_at is not null
    order by w.accepted_at desc
    limit 500
  `) as Row[];
  return rows.map((r) => {
    const a: Activity = {
      email: r.email,
      name: r.name,
      acceptedAt: new Date(r.accepted_at).toISOString(),
      stage: stageOf(r),
      lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null,
      aiCalls: r.ai_calls,
      checks: r.checks,
      connections: r.connections,
      concepts: r.concepts,
      readiness: r.total ? { passed: r.passed ?? 0, total: r.total } : null,
      remindersSent: r.reminders_sent ?? 0,
      lastRemindedAt: r.last_reminded_at ? new Date(r.last_reminded_at).toISOString() : null,
      reminderDue: false,
      hours: typeof r.answers?.hours === "string" ? r.answers.hours : null,
      projectStage: typeof r.answers?.stage === "string" ? r.answers.stage : null,
    };
    a.reminderDue = reminderDue(a, now);
    return a;
  });
}

// ---- Claude's recommendation ----

export type Verdict = "keep" | "nudge" | "consider_removing";
export interface Recommendation { email: string; verdict: Verdict; reason: string }

type Opts = Record<string, readonly (readonly [string, string])[]>;
const label = (k: string, v: unknown) => (OPTIONS as Opts)[k]?.find(([val]) => val === v)?.[1] ?? null;

// What Claude sees per learner: numbers, days and fixed choices only.
export function anonymizeActivity(list: Activity[], now = Date.now()) {
  return list.map((a, i) => ({
    id: `L${i + 1}`,
    days_since_accepted: daysSince(a.acceptedAt, now),
    stage_reached: STAGE_LABEL[a.stage],
    days_since_last_activity: daysSince(a.lastActiveAt, now),
    ai_tool_calls: a.aiCalls,
    readiness_checks_run: a.checks,
    best_readiness: a.readiness ? `${a.readiness.passed}/${a.readiness.total}` : null,
    accounts_connected: a.connections,
    lessons_seen: a.concepts,
    reminders_sent: a.remindersSent,
    days_since_last_reminder: daysSince(a.lastRemindedAt, now),
    said_hours_per_week: label("hours", a.hours),
    said_project_stage: label("stage", a.projectStage),
  }));
}

const SYSTEM = `You help the launchwright team look after pilot learners. launchwright is a 6-week pilot where beginners in the Philippines ship their own app to production through their own AI coding tool. Seats are limited in practice by how many learners the team can support, so the team wants to know who is engaged, who needs a nudge, and who has likely lost interest.

For each learner, recommend one verdict:
- "keep": active or making progress, or accepted too recently to judge.
- "nudge": stalled but recoverable; a reminder or a personal message would likely help. Say what to nudge them on (sign in, connect their AI tool, run their first check, deploy).
- "consider_removing": no meaningful activity for a long time despite reminders. Only when days_since_accepted is ${REMOVAL_AFTER_DAYS} or more, they have had at least 2 reminders, and nothing suggests they are about to start. When in doubt, choose "nudge".

Weigh: days since accepted, stage reached, days since last activity, reminders already sent, and what they said about their time and project. Someone who said "under 2 hours a week" or "just an idea" is expected to move slower, not to be removed sooner. Early stages are normal in the first week.
Judge only the numbers given. Don't guess anyone's identity, gender, age or location.
reason: one plain sentence for the team, naming the evidence. Return every learner exactly once.
This is a recommendation for a person on the team, who decides.`;

const SCHEMA = {
  type: "object",
  properties: {
    learners: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["keep", "nudge", "consider_removing"] },
          reason: { type: "string" },
        },
        required: ["id", "verdict", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["learners"],
  additionalProperties: false,
};

export async function recommend(apiKey: string, list: Activity[], now = Date.now()): Promise<Recommendation[]> {
  if (!list.length) return [];
  const items = anonymizeActivity(list, now);
  const client = new Anthropic({ apiKey });
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model: REVIEW_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Learners (JSON):\n${JSON.stringify(items, null, 1)}` }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ReviewError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on the platform Worker.");
    if (e instanceof Anthropic.RateLimitError) throw new ReviewError("Anthropic is rate limiting us. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new ReviewError(`Anthropic answered ${e.status ?? "with an error"}. Try again.`);
    throw new ReviewError("Couldn't reach Anthropic. Try again.");
  }
  if (res.stop_reason === "refusal") throw new ReviewError("Claude declined to review this activity.");
  if (res.stop_reason === "max_tokens") throw new ReviewError("The review was cut off. Try again.");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: { learners?: { id: string; verdict: Verdict; reason: string }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ReviewError("Claude's answer wasn't valid JSON. Try again.");
  }
  const byId = new Map(items.map((it, i) => [it.id, list[i]]));
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const r of parsed.learners ?? []) {
    const a = byId.get(r.id);
    if (!a || seen.has(a.email)) continue;
    seen.add(a.email);
    // The rule holds even if the model ignores it: too early, or fewer than 2 reminders, is a nudge.
    const tooEarly = (daysSince(a.acceptedAt, now) ?? 0) < REMOVAL_AFTER_DAYS || a.remindersSent < 2;
    const verdict: Verdict = r.verdict === "consider_removing" && tooEarly ? "nudge" : r.verdict;
    out.push({ email: a.email, verdict, reason: r.reason.slice(0, 300) });
  }
  return out;
}
