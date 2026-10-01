import type { Story } from "core/models/Story.js";
import { productionCallLimits } from "shared/llm/chatModel.js";
import { optionLeverLine, takesOptionRules } from "../optionRules.js";
import { beatStep } from "../storyTextSteps.js";
import { splitAtState } from "./roundEdits.js";
import {
  LAST_STEP,
  LEVER_POINTER,
  NOT_LAST_STEP,
  RESULTS,
  SOURCE_POINTER,
  STEP_POINTER,
  TITLE_POINTER,
  TONE,
  perCallMessage,
  showsImages,
  sourceLine,
  splitRules,
  stepLine,
  titleLine,
  type Move,
  type TurnRound3Request,
} from "./turnRound3.js";

/*
 * B9, the request form's gate (turn doc B9; the owner's feedback workflow of
 * 2026-09-28), an eval-only variant: production's own single-player turn
 * form (beatStep.request, today's form with the option rules on rolled
 * chapter steps and no chapter rules on a switch turn), unchanged in its
 * words, sent as GPT-6 caches best, as turn round 3's form (turnRound3.ts)
 * split the round-2 form:
 * - fixed: production's rules with the lines that differ between turns of one
 *   class (the kind of turn, a chapter's kind, the story's image mode) moved
 *   out, each leaving a pointer, so they are byte-identical per class and
 *   cache. The executor sends them as a developer message with an explicit
 *   cache breakpoint (executor.ts, chatInput);
 * - perCall: THIS BEAT (a chapter step's position, the last-step or
 *   not-last-step rule, its title number, the results and tone lines after a
 *   chapter's first step, the option rules' computed lever line, the
 *   portraits' source), then production's story state, word for word;
 * - limits: production's single-player turn limits (90 s, 12,000 tokens).
 * Production's form has no flavor opening, so a first turn has nothing per
 * call; a switch turn's results line is in every switch turn, so it stays in
 * the fixed rules. It reads against production's one message (the adopted
 * variant with the same limits), run beside it. Single player only.
 */

const LABEL = "B9 on production's turn form";

function movesFor(story: Story): Move[] {
  const moves: Move[] = [];
  if (story.getCurrentBeatType() === "thread") {
    const step = story.getCurrentThreadBeatsCompleted() + 1;
    const of = story.getCurrentThreadDuration();
    const later = step > 1;
    const challenge = story.getCurrentThreadType() !== "exploration";
    moves.push(
      { passage: stepLine(step, of), pointer: STEP_POINTER },
      { passage: step === of ? LAST_STEP : NOT_LAST_STEP, pointer: "" },
      { passage: titleLine(step, of), pointer: TITLE_POINTER }
    );
    if (later && challenge) moves.push({ passage: RESULTS, pointer: "" });
    // Without it the text reads as a chapter's first step does
    if (later) moves.push({ passage: TONE, pointer: "" });
    // Production's computed lever line: B6's rate line until the options-o2c adoption (2026-10-01), the O2c line since
    if (takesOptionRules(story)) moves.push({ passage: `--- ${optionLeverLine(story, "player1")}\n`, pointer: LEVER_POINTER });
  }
  if (showsImages(story)) moves.push({ passage: sourceLine(story), pointer: SOURCE_POINTER });
  return moves;
}

/** B9 on production's single-player turn of any kind: its fixed rules first, then THIS BEAT and the state. */
export function productionFormRequest(story: Story): TurnRound3Request {
  if (story.isMultiplayer()) throw new Error(`${LABEL}: the request form is single-player (groups keep one message)`);
  const oneMessage = beatStep.request(story);
  const { instructions, state } = splitAtState(LABEL, oneMessage.prompt);
  const { fixed, items } = splitRules(instructions, movesFor(story), LABEL);
  return { fixed, perCall: perCallMessage(items, state), schema: oneMessage.schema, limits: productionCallLimits("beat", 1) };
}
