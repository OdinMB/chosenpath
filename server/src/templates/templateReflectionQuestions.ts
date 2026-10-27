import { MAX_PLAYERS } from "core/config.js";
import {
  PLAYER_SLOTS,
  PlayerOptionsGeneration,
  StoryTemplate,
  keptReflectionQuestions,
  readReflectionQuestions,
  reflectionQuestionsOf,
} from "core/types/index.js";
import type { TemplateReflectionOutcome } from "core/types/api.js";
import { outcomesInPlay } from "core/utils/outcomeStates.js";

/*
 * A template's reflection questions (core/types/reflectionQuestions.ts): how
 * they are saved with it, and what a several-stories start reads of them.
 */

/** The ids of every outcome a template holds: its shared ones and each seat's own. */
function templateOutcomeIds(template: Partial<StoryTemplate>): string[] {
  const seats = PLAYER_SLOTS.slice(0, MAX_PLAYERS).map(
    (slot) => (template[slot as keyof StoryTemplate] as PlayerOptionsGeneration | undefined)?.outcomes ?? []
  );
  return [template.sharedOutcomes ?? [], ...seats].flat().map((outcome) => outcome.id);
}

/**
 * A template's reflection questions as they are saved: those of the outcomes
 * it holds, or none at all. Questions that can't be read (a file written by
 * hand) are left out; the routes refuse a request's beyond the limits first.
 */
export function withReflectionQuestions(
  template: StoryTemplate,
  questions: unknown
): StoryTemplate {
  const rest: StoryTemplate = { ...template };
  delete rest.reflectionQuestions;
  const read = readReflectionQuestions(questions);
  const kept =
    "questions" in read ? keptReflectionQuestions(read.questions, templateOutcomeIds(template)) : undefined;
  return kept ? { ...rest, reflectionQuestions: kept } : rest;
}

/**
 * The outcomes a template's stories can play, for whoever sets reflection
 * questions for several of them: the shared ones first, then each seat's own
 * up to its most players, each with its question and the author's reflection
 * questions. Never an outcome's possible resolutions or resonance.
 */
export function templateReflectionOutcomes(template: StoryTemplate): TemplateReflectionOutcome[] {
  const seats = PLAYER_SLOTS.slice(0, Math.min(template.playerCountMax ?? MAX_PLAYERS, MAX_PLAYERS));
  const players = Object.fromEntries(
    seats.map((slot) => [slot, { outcomes: (template[slot as keyof StoryTemplate] as PlayerOptionsGeneration | undefined)?.outcomes }])
  );
  const read = readReflectionQuestions(template.reflectionQuestions);
  const questions = "questions" in read ? read.questions : null;
  return outcomesInPlay({ sharedOutcomes: template.sharedOutcomes, players }).map(({ owner, outcome }) => ({
    id: outcome.id,
    owner,
    question: outcome.question,
    reflectionQuestions: [...(reflectionQuestionsOf(questions, outcome.id) ?? [])],
  }));
}
