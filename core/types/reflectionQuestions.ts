import { z } from "zod";

/*
 * Reflection questions: what people write for the players to think about once
 * a story is over, by outcome id. A World's author writes them with its
 * outcomes (StoryTemplate.reflectionQuestions); whoever starts several stories
 * at once can set others for those stories; a story keeps the ones for the
 * outcomes it plays (StoryState.reflectionQuestions), and its end screen shows
 * each outcome's under that outcome. They are never sent to a model.
 */

/** Questions by outcome id. */
export type ReflectionQuestions = Record<string, string[]>;

export const REFLECTION_QUESTIONS_PER_OUTCOME = 5;
export const REFLECTION_QUESTION_MAX_LENGTH = 300;
/** More outcomes than any World holds (its shared ones and three seats' own). */
const MAX_OUTCOMES = 50;
const MAX_OUTCOME_ID_LENGTH = 200;
/** Ids that would reach an object's prototype once used as keys. */
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const REFLECTION_QUESTIONS_PROBLEM = `Reflection questions: at most ${REFLECTION_QUESTIONS_PER_OUTCOME} for each outcome, each one with text and at most ${REFLECTION_QUESTION_MAX_LENGTH} characters.`;

/** One question, trimmed: text, and at most REFLECTION_QUESTION_MAX_LENGTH characters. */
export const reflectionQuestionSchema = z.string().trim().min(1).max(REFLECTION_QUESTION_MAX_LENGTH);

/** Questions by outcome id, each outcome's at most REFLECTION_QUESTIONS_PER_OUTCOME. */
export const reflectionQuestionsSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(MAX_OUTCOME_ID_LENGTH)
      .refine((id) => !PROTOTYPE_KEYS.has(id)),
    z.array(reflectionQuestionSchema).max(REFLECTION_QUESTIONS_PER_OUTCOME)
  )
  .refine((questions) => Object.keys(questions).length <= MAX_OUTCOMES);

/**
 * Reads questions as a client sends them or a file holds them: none from a
 * value that names none (undefined, null), the questions, trimmed, from one
 * within the limits, and the problem, in words its writer can act on, from
 * anything else.
 */
export function readReflectionQuestions(
  value: unknown
): { questions: ReflectionQuestions | null } | { problem: string } {
  if (value === undefined || value === null) return { questions: null };
  const read = reflectionQuestionsSchema.safeParse(value);
  return read.success ? { questions: read.data } : { problem: REFLECTION_QUESTIONS_PROBLEM };
}

/** An outcome's questions, if any are kept for it (never a prototype's property). */
export function reflectionQuestionsOf(
  questions: ReflectionQuestions | null | undefined,
  outcomeId: string
): string[] | undefined {
  if (!questions || !Object.prototype.hasOwnProperty.call(questions, outcomeId)) return undefined;
  const own = questions[outcomeId];
  return Array.isArray(own) && own.length > 0 ? own : undefined;
}

/**
 * The questions of the outcomes named, in their order, as copies, leaving out
 * those with none; undefined where none is left.
 */
export function keptReflectionQuestions(
  questions: ReflectionQuestions | null | undefined,
  outcomeIds: readonly string[]
): ReflectionQuestions | undefined {
  const kept: ReflectionQuestions = {};
  for (const id of outcomeIds) {
    const own = reflectionQuestionsOf(questions, id);
    if (own) kept[id] = [...own];
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** The questions with text, trimmed, in order: what a form's fields hold once saved. */
export function filledReflectionQuestions(questions: readonly string[]): string[] {
  return questions.map((question) => question.trim()).filter((question) => question.length > 0);
}

/**
 * The questions with an outcome's set to these, filled, and the others as
 * they were; an outcome left with none is dropped.
 */
export function withOutcomeReflectionQuestions(
  questions: ReflectionQuestions | null | undefined,
  outcomeId: string,
  outcomeQuestions: readonly string[]
): ReflectionQuestions {
  const next: ReflectionQuestions = { ...(questions ?? {}) };
  const filled = filledReflectionQuestions(outcomeQuestions);
  if (filled.length > 0) next[outcomeId] = filled;
  else delete next[outcomeId];
  return next;
}
