// Which concepts each learner has already been taught (sql/001_lesson_progress.sql).
// Without DATABASE_URL nothing is remembered and every lesson is the full one.
import { neon } from "@neondatabase/serverless";
import type { LessonConcept } from "./lessons";

export interface ProgressStore {
  seen(githubId: number, concepts: LessonConcept[]): Promise<Partial<Record<LessonConcept, number>>>;
  record(githubId: number, concepts: LessonConcept[]): Promise<void>;
}

export const noProgress: ProgressStore = { seen: async () => ({}), record: async () => {} };

export function neonProgress(url: string): ProgressStore {
  const sql = neon(url);
  return {
    async seen(githubId, concepts) {
      const rows = await sql`select concept, times_seen from lesson_progress where github_id = ${githubId} and concept = any(${concepts})`;
      return Object.fromEntries(rows.map((r) => [r.concept as string, r.times_seen as number]));
    },
    async record(githubId, concepts) {
      if (!concepts.length) return;
      await sql`
        insert into lesson_progress (github_id, concept)
        select ${githubId}, unnest(${concepts}::text[])
        on conflict (github_id, concept) do update set
          times_seen = lesson_progress.times_seen + 1,
          last_seen_at = now()
      `;
    },
  };
}
