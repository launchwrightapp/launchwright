// The lesson engine: every tool result comes with a short lesson.
// The first time a learner meets a concept they get the full explanation; after that, one line.
// The curriculum itself (modules, concepts, texts) lives in packages/core/curriculum.ts.
import { LESSONS, isConcept, type Concept } from "../../../packages/core/curriculum";

export type LessonConcept = Concept;
export { LESSONS, isConcept as isLessonConcept };

export interface Delivered {
  concept: Concept;
  depth: "full" | "short";
  text: string;
}

// seen: how many times this learner already got each concept (missing = never).
export function deliver(concepts: Concept[], seen: Partial<Record<Concept, number>>): Delivered[] {
  return [...new Set(concepts)].map((concept) => {
    const l = LESSONS[concept];
    const first = !seen[concept];
    return { concept, depth: first ? "full" : "short", text: first ? `${l.title}. ${l.full}` : l.short };
  });
}
