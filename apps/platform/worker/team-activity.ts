// Learner activity for the team: every AI tool call and dashboard action (audit_log) and the
// lessons and exercises each learner has covered (lesson_progress), per person and overall.
// Read-only. Same data the learner sees on their own dashboard; the privacy policy says the
// team can see it too (apps/site/src/pages/privacy.astro). Nothing here goes to Claude.
import { neon } from "@neondatabase/serverless";
import { EXERCISES, LESSONS, MODULES, type Concept } from "../../../packages/core/curriculum";
import { isAdmin, type MessagesEnv } from "./messages";
import type { User } from "./session";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
const moduleName = (id: string) => MODULES.find((m) => m.id === id)?.name ?? id;

// What a lesson_progress key means, in words.
export function describeConcept(key: string): { title: string; module: string; exercise: boolean } {
  if (key.startsWith("exercise:")) {
    const e = EXERCISES.find((x) => x.id === key.slice("exercise:".length));
    return { title: e?.title ?? key, module: e ? moduleName(e.module) : "", exercise: true };
  }
  const l = LESSONS[key as Concept];
  return { title: l?.title ?? key, module: l ? moduleName(l.module) : "", exercise: false };
}

const TIMELINE_LIMIT = 300;
const RECENT_LIMIT = 200;

export async function handleTeamActivityApi(req: Request, url: URL, env: MessagesEnv, user: User): Promise<Response | null> {
  const p = url.pathname;
  if (p !== "/api/admin/activity" && p !== "/api/admin/activity/learner") return null;
  if (!isAdmin(user, env)) return json({ error: "Not found." }, 404);
  if (req.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const id = url.searchParams.get("id") ?? "";
  if (p === "/api/admin/activity/learner" && !/^\d{1,20}$/.test(id)) return json({ error: "Give a GitHub ID." }, 400);
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL isn't set on the platform." }, 503);
  const sql = neon(env.DATABASE_URL);

  try {
    // One learner: their full timeline and every lesson and exercise.
    if (p === "/api/admin/activity/learner") {
      const [timeline, lessons] = await Promise.all([
        sql`select actor, client, tool, repo, summary, outcome, created_at from audit_log
            where github_id = ${id} order by created_at desc limit ${TIMELINE_LIMIT}`,
        sql`select concept, times_seen, first_seen_at, last_seen_at from lesson_progress
            where github_id = ${id} order by first_seen_at`,
      ]);
      return json({
        githubId: id,
        limit: TIMELINE_LIMIT,
        timeline: timeline.map((r) => ({ actor: r.actor, client: r.client, tool: r.tool, repo: r.repo, summary: r.summary, outcome: r.outcome, at: iso(r.created_at) })),
        lessons: lessons.map((r) => ({ key: r.concept, ...describeConcept(r.concept as string), timesSeen: Number(r.times_seen), firstSeen: iso(r.first_seen_at), lastSeen: iso(r.last_seen_at) })),
      });
    }

    // Everyone: per learner, per tool, and the latest entries across all learners.
    const [learners, tools, recent, [waiting]] = await Promise.all([
      sql`
        with people as (
          select github_id from audit_log
          union select github_id from lesson_progress
          union select github_id from waitlist where github_id is not null
        )
        select p.github_id::text as github_id, w.name, w.email, w.answers->>'github' as login, w.accepted_at,
               coalesce(a.ai_calls, 0) as ai_calls, coalesce(a.actions, 0) as actions,
               coalesce(a.errors, 0) as errors, coalesce(a.blocked, 0) as blocked,
               coalesce(a.clients, '{}') as clients, coalesce(a.repos, '{}') as repos,
               a.first_at, a.last_at, coalesce(l.concepts, 0) as concepts, coalesce(l.exercises, 0) as exercises, l.last_lesson
        from people p
        left join waitlist w on w.github_id = p.github_id
        left join lateral (
          select count(*) filter (where actor = 'ai')::int as ai_calls,
                 count(*) filter (where actor = 'learner')::int as actions,
                 count(*) filter (where outcome = 'error')::int as errors,
                 count(*) filter (where outcome = 'blocked')::int as blocked,
                 array_remove(array_agg(distinct client) filter (where actor = 'ai'), null) as clients,
                 array_remove(array_agg(distinct repo), null) as repos,
                 min(created_at) as first_at, max(created_at) as last_at
          from audit_log where github_id = p.github_id
        ) a on true
        left join lateral (
          select count(*) filter (where concept not like 'exercise:%')::int as concepts,
                 count(*) filter (where concept like 'exercise:%')::int as exercises,
                 max(last_seen_at) as last_lesson
          from lesson_progress where github_id = p.github_id
        ) l on true
        order by greatest(a.last_at, l.last_lesson) desc nulls last`,
      sql`
        select tool, count(*)::int as calls, count(distinct github_id)::int as people,
               count(*) filter (where outcome = 'error')::int as errors,
               count(*) filter (where outcome = 'blocked')::int as blocked,
               max(created_at) as last_at
        from audit_log where actor = 'ai' group by tool order by calls desc`,
      sql`
        select a.github_id::text as github_id, w.name, w.email, a.actor, a.client, a.tool, a.repo, a.summary, a.outcome, a.created_at
        from audit_log a left join waitlist w on w.github_id = a.github_id
        order by a.created_at desc limit ${RECENT_LIMIT}`,
      sql`select count(*)::int as n from waitlist where accepted_at is not null and github_id is null`,
    ]);

    return json({
      notSignedIn: Number(waiting?.n ?? 0),
      recentLimit: RECENT_LIMIT,
      learners: learners.map((r) => {
        const last = [iso(r.last_at), iso(r.last_lesson)].filter(Boolean).sort().pop() ?? null;
        return {
          githubId: r.github_id, name: r.name, email: r.email, login: r.login, accepted: !!r.accepted_at,
          aiCalls: r.ai_calls, actions: r.actions, errors: r.errors, blocked: r.blocked,
          clients: r.clients, repos: r.repos, firstAt: iso(r.first_at), lastAt: last,
          concepts: r.concepts, exercises: r.exercises,
        };
      }),
      tools: tools.map((r) => ({ tool: r.tool, calls: r.calls, people: r.people, errors: r.errors, blocked: r.blocked, lastAt: iso(r.last_at) })),
      recent: recent.map((r) => ({ githubId: r.github_id, name: r.name, email: r.email, actor: r.actor, client: r.client, tool: r.tool, repo: r.repo, summary: r.summary, outcome: r.outcome, at: iso(r.created_at) })),
    });
  } catch (err) {
    console.error("team activity failed", err);
    return json({ error: "Couldn't load activity. If this is a new database, run the apps/mcp/sql migrations." }, 500);
  }
}
