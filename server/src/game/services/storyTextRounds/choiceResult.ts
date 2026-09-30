import type { Story } from "core/models/Story.js";
import { getThreadType } from "core/types/index.js";
import type { TextRequest } from "../storyTextSteps.js";
import { StoryStatePromptService } from "../prompts/StoryStatePromptService.js";
import { round0BeatStep } from "../storyTextRound0/round0Steps.js";
import { endingStateRequest } from "./endingState.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";
import { productionTurnForm } from "./turnOptionsContinuity.js";

/*
 * The choice-result stage's turn (eval only; the playthroughs of 2026-09-30,
 * "choices that lead somewhere else"). On an exploration step the game
 * records the chosen option by its position as the step's result
 * (BeatResolutionService: option n is resolution n), and the next turn and
 * the chapter's milestone follow that result. Production's turn is shown the
 * step's three results ("Possible outcomes: Resolution 1: …") and nothing
 * says that its options are them: the playthroughs' turns wrote options that
 * carry out another result or none (New Avalon turns 6 and 14, lemonade turn
 * 6, food trucks turns 14 and 17), mostly on a chapter's first step, often
 * after the text had already carried out one of the results, and the next
 * turn told the recorded result instead of the choice. Turn round 2's form
 * carried an exploration-order line (B7) with the rest of its form; production
 * adopted only B6, and the stored cases hold two exploration steps, so nobody
 * measured it.
 *
 * The variant is production's turn (built from the frozen copy through the
 * measured forms, so no later production change moves it; a test holds it to
 * production byte for byte) with one line after the option types on a turn
 * where a player's thread is an exploration thread: each option is its own
 * result, the same action in the same direction, why, and the text carries out
 * none of them. Everywhere else production's request byte for byte. Every
 * player count: the line reads per player. Model-facing text says "thread"
 * and "beat".
 */

const LABEL = "Choice-result turn";

/** The option types' last line, after which the exploration line goes (every turn but a switch prints it). */
const OPTION_TYPES = "--- Use 'challenge' for options in Challenge threads and Contest threads.\n";

const EXPLORATION_ORDER =
  "--- In an Exploration thread, a player's three options are the current step's three possible outcomes, in their order: option 1 is Resolution 1, option 2 is Resolution 2 and option 3 is Resolution 3, each the same action in the same direction, without its consequences, in the scene's own words. The game records the chosen option's resolution as what the player did, so an option that says something else sends the story where the player didn't choose. The beat text leads up to the three and carries out none of them.\n";

/** The passages the tests pin. */
export const CHOICE_RESULT_TEXT = { optionTypes: OPTION_TYPES, explorationOrder: EXPLORATION_ORDER };

/** The chapter rules as the measured switch turn printed them last (the story's thread types and switch/thread instructions). */
const chapterRulesTail = (story: Story) => `\n${StoryStatePromptService.createStoryStatePrompt(story, { switchAndThreadInstructions: true })}`;

/**
 * Production's group turn as the eval measured it: today's form (the frozen
 * round0 copy; B6 is single-player) without the chapter rules on a switch
 * turn, the planners' only since the owner's feedback of 2026-09-28.
 */
function productionGroupTurn(story: Story): TextRequest {
  const measured = round0BeatStep.request(story);
  if (story.getCurrentBeatType() !== "switch") return measured;
  const tail = chapterRulesTail(story);
  if (!measured.prompt.endsWith(tail)) throw new Error(`${LABEL}: the measured group switch turn no longer ends with its chapter rules`);
  return { ...measured, prompt: measured.prompt.slice(0, -tail.length) };
}

/**
 * Production's turn today as the eval measured it, every player count: the
 * ending told as its milestones leave it (endingStateB), a single player's
 * turn form (turnB6 without the switch turn's chapter rules), a group's
 * today's form without them.
 */
export function productionTurnToday(story: Story): TextRequest {
  if (story.getCurrentBeatType() === "ending") return endingStateRequest(story);
  return story.isMultiplayer() ? productionGroupTurn(story) : productionTurnForm(story);
}

/** Whether the turn takes the exploration line: a chapter step where some player's thread is an exploration thread. */
export function takesExplorationOrder(story: Story): boolean {
  if (story.getCurrentBeatType() !== "thread") return false;
  return (story.getCurrentThreadAnalysis()?.threads ?? []).some((thread) => getThreadType(thread) === "exploration");
}

/** Production's turn with the exploration line where a player's thread explores, production's request byte for byte elsewhere. */
export function choiceResultRequest(story: Story): TextRequest {
  const base = productionTurnToday(story);
  if (!takesExplorationOrder(story)) return base;
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  return { ...base, prompt: replaceOnce(LABEL, instructions, OPTION_TYPES, `${OPTION_TYPES}${EXPLORATION_ORDER}`) + state };
}
