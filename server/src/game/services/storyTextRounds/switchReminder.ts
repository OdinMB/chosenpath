import type { Story } from "core/models/Story.js";
import type { TextRequest } from "../storyTextSteps.js";
import { endingStateRequest } from "./endingState.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";
import { productionTurnForm } from "./turnOptionsContinuity.js";

/*
 * The runaway turn (eval only, 2026-09-30). Production's single-player switch
 * turn on story 8988006e after its first chapter sometimes reasons until the
 * 12,000-token output cap and writes nothing (every GPT-6 reply the eval ever
 * cut at its cap fell on that story's turn 4: the switch turn after the
 * chapter, the ending, the synthetic pregeneration). The request's one plain
 * contradiction there is the switch configuration's closing reminder,
 * "players decided what is supposed to happen next. These things have not yet
 * happened. The current thread and beat must make sure …": it is the chapter
 * planner's (it follows the switch with the players' decisions there), and
 * production prints it on the switch turn too, before anyone has decided,
 * where there is no current thread. On the runaway case the switch is a
 * flavor switch whose question presupposes what the chapter's last choice
 * just did ("the immediate fallout of exposing the Clandestine Waste Ring",
 * after "releasing the exposé"), so the reminder tells the model that the
 * exposure hasn't happened while the first paragraph must narrate it. The turn
 * document names it (B3.13: "prints only in the version of the switch
 * configuration that carries the players' decisions"); turn round 2 carried it
 * with the rest of its form, and production adopted only B6.
 *
 * The variant is that fix alone: production's single-player turn with the
 * reminder cut on a switch turn, the first turn included, and production's
 * request byte for byte everywhere else (built from the frozen copy through
 * the measured forms, so no later production change moves it; a test holds it).
 */

const LABEL = "Switch reminder";

/** The switch configuration's closing reminder, as production prints it on every switch configuration. */
export const SWITCH_REMINDER =
  "\n\nRemember: In these switches, players decided what is supposed to happen next. These things have not yet happened. The current thread and beat must make sure that the story actually continues based on the players' choices.\n";

/** Production's single-player turn as measured: the turn form, and the ending since its adoption (endingStateB). */
function productionToday(story: Story): TextRequest {
  return story.getCurrentBeatType() === "ending" ? endingStateRequest(story) : productionTurnForm(story);
}

/** Production's single-player turn without the switch configuration's reminder on a switch turn (B3.13 alone). */
export function noSwitchReminderRequest(story: Story): TextRequest {
  if (story.isMultiplayer()) throw new Error(`${LABEL}: single-player (the runaway turn is one player's)`);
  const base = productionToday(story);
  if (story.getCurrentBeatType() !== "switch") return base;
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  return { ...base, prompt: instructions + replaceOnce(LABEL, state, SWITCH_REMINDER, "") };
}
