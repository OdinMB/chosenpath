import {
  Outcome,
  PLAYER_SLOTS,
  PlayerOptionsGeneration,
  ReflectionQuestions,
  StoryTemplate,
  TemplateIterationSections,
  keptReflectionQuestions,
  reflectionQuestionsOf,
} from "core/types";

/*
 * Reflection questions are kept beside a World's outcomes, by outcome id. An
 * AI change that replaces outcomes (Improve Outcomes, Improve Players, AI
 * Draft) keeps the questions of every outcome whose id it keeps, and drops
 * the rest with their outcomes; the author is told which before accepting.
 */

/** One outcome's reflection questions that a change drops with the outcome. */
export interface LostReflectionQuestions {
  outcomeId: string;
  /** The outcome's question, which names it to the author. */
  question: string;
  count: number;
}

/** Every outcome a World holds: its shared ones, then each seat's own. */
export function templateOutcomes(template: Partial<StoryTemplate>): Outcome[] {
  const seats = PLAYER_SLOTS.map(
    (slot) => (template[slot as keyof StoryTemplate] as PlayerOptionsGeneration | undefined)?.outcomes ?? []
  );
  return [template.sharedOutcomes ?? [], ...seats].flat();
}

/**
 * The outcomes a World holds once an AI section is accepted: the section's
 * shared outcomes, or its seats' options, in place of the World's.
 */
export function outcomesAfterAccepting(
  template: StoryTemplate,
  section: TemplateIterationSections,
  update: Partial<StoryTemplate>
): Outcome[] {
  if (section === "sharedOutcomes" && update.sharedOutcomes) {
    return templateOutcomes({ ...template, sharedOutcomes: update.sharedOutcomes });
  }
  if (section === "players") {
    const seats = Object.fromEntries(
      PLAYER_SLOTS.filter((slot) => update[slot as keyof StoryTemplate]).map((slot) => [
        slot,
        update[slot as keyof StoryTemplate],
      ])
    );
    return templateOutcomes({ ...template, ...seats });
  }
  return templateOutcomes(template);
}

/** The questions of each outcome in `before` that `after` no longer holds (by id), with their outcome. */
export function lostReflectionQuestions(
  questions: ReflectionQuestions | null | undefined,
  before: Outcome[],
  after: Outcome[]
): LostReflectionQuestions[] {
  const kept = new Set(after.map(({ id }) => id));
  return before.flatMap((outcome) => {
    const own = kept.has(outcome.id) ? undefined : reflectionQuestionsOf(questions, outcome.id);
    return own ? [{ outcomeId: outcome.id, question: outcome.question, count: own.length }] : [];
  });
}

/**
 * A World's reflection questions once its outcomes changed: those of the
 * outcomes it still holds; {} when it had some and none is left, so saving
 * it removes them.
 */
export function reflectionQuestionsHeldBy(template: StoryTemplate): ReflectionQuestions | undefined {
  const held = keptReflectionQuestions(
    template.reflectionQuestions,
    templateOutcomes(template).map(({ id }) => id)
  );
  return held ?? (template.reflectionQuestions ? {} : undefined);
}

/** "3 reflection questions", "1 reflection question". */
export function reflectionQuestionCount(lost: LostReflectionQuestions[]): string {
  const total = lost.reduce((sum, { count }) => sum + count, 0);
  return `${total} ${total === 1 ? "reflection question" : "reflection questions"}`;
}
