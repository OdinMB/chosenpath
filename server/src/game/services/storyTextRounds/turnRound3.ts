import type { Story } from "core/models/Story.js";
import { productionCallLimits, type CallLimits } from "shared/llm/chatModel.js";
import type { SplitTextRequest } from "../storyTextRewrite/common.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";
import { TURN_ROUND2_TEXT, sacrificeRewardLine, turnRound2Request } from "./turnRound2.js";

/*
 * Turn round 3's B9 (turn doc section 4, round 3; Appendix A, B9), an
 * eval-only variant: the GPT-6 request form for single-player turns. It sends
 * the round-2 form (turnRound2.ts) with B9 item 2 and the paragraph arm's one
 * fix ("paragraphsLast": the paragraph count at the text field, the shouted
 * copies gone, the last paragraph at the others' length) as a split request:
 * - fixed: the round-2 form's rules, byte-identical for every turn of a class
 *   (the kind of turn, a chapter's kind, the story's image mode), so they
 *   cache. The executor sends them as a developer message with an explicit
 *   cache breakpoint (executor.ts, chatInput);
 * - perCall: THIS BEAT, the rules that differ between turns of one class,
 *   moved out word for word (a chapter step's position, its title number,
 *   the last-step or not-last-step rule, the results and tone lines after a
 *   chapter's first step, B6's computed lever line, a flavor first switch's
 *   opening, the portraits' source), then the story state as the one-message
 *   form sends it. Each moved rule leaves a pointer where it stood;
 * - limits: production's timeout and output cap for a single-player turn
 *   (90 s, 12,000 tokens; productionCallLimits), which the eval otherwise
 *   leaves off (it waits 300 s and caps nothing), so a runaway is cut and
 *   re-sent as production would.
 * The reply format and its assembly are the one-message form's. Single player
 * only: groups keep one message (B10).
 */

export type TurnRound3Request = SplitTextRequest & {
  assemble?: (parsed: unknown) => unknown;
  /** The timeout and output cap to send, instead of the eval's 300 s and no cap */
  limits: CallLimits;
};

const LABEL = "Turn round 3 request form";

export const THIS_BEAT_HEADING = "THIS BEAT";

export type Move = {
  /** The passage as the one-message form has it */
  passage: string;
  /** What stays in the fixed rules in its place */
  pointer: string;
};

// Today's per-call passages, which the round-2 form and production's turn form (B9 on it, requestFormB9.ts) keep word for word
export const LAST_STEP =
  "- This is the last beat of the thread. Remember that the resolution of the overall thread will only be determined AFTER this beat, based on players' choices in this beat. Don't define or narrate the resolution of the thread. (That will happen in the next round, based on players' choices.)\n";
export const NOT_LAST_STEP =
  "- This is not yet the last beat of the thread. While each beat should contribute toward the resolution of the thread, the question of how the thread overall will be resolved should only be answered after the players' decisions in the last step of the thread.\n" +
  "--- Example: In a 3-beat thread, if the question is 'Will [insert player name] acquire the artifact?', the player will not gain or permanently lose the chance to gain the artifact in steps 1 and 2.\n";
export const RESULTS =
  "\nResults of the player's actions depend on the resolution of the previous beat. The thread configuration lays out what it means specifically to succeed and fail. Follow those guidelines.";
export const TONE =
  "\n- If the previous beat for this player was favorable / mixed / unfavorable, adjust the tone of this beat accordingly. Beats following a favorable beat should feel like there is positive momentum. Beats following an unfavorable beat should feel difficult.\n";

export const STEP_POINTER = "- THIS BEAT says which beat of the thread this is, and whether it is the last.\n";
export const TITLE_POINTER = "Add the beat number of the current thread after the title, as THIS BEAT gives it.";
export const LEVER_POINTER = "--- THIS BEAT says whether a sacrifice or reward fits this turn.\n";
export const SOURCE_POINTER = "- For player characters, use ids player1, player2, etc., with the source THIS BEAT names.\n";

export const showsImages = (story: Story) => story.hasImages() || story.generatesImages();

/** A chapter step's position line and its title line, as today's form writes them. */
export const stepLine = (step: number, of: number) => `- Remember that this is beat ${step}/${of} of the current thread (or set of threads).\n`;
export const titleLine = (step: number, of: number) => `Add '(${step}/${of})' after the title to indicate the beat number of the current thread.`;
export const sourceLine = (story: Story) => `- For player characters, use ids player1, player2, etc. and source ${story.isBasedOnTemplate() ? "template" : "story"}.\n`;

/** A chapter step's lines: which beat, last or not, the title number, and after the first step the results and tone lines. */
function chapterMoves(story: Story): Move[] {
  const step = story.getCurrentThreadBeatsCompleted() + 1;
  const of = story.getCurrentThreadDuration();
  const later = step > 1;
  const challenge = story.getCurrentThreadType() !== "exploration";
  return [
    { passage: stepLine(step, of), pointer: STEP_POINTER },
    { passage: step === of ? LAST_STEP : NOT_LAST_STEP, pointer: "" },
    { passage: titleLine(step, of), pointer: TITLE_POINTER },
    ...(later && challenge ? [{ passage: RESULTS, pointer: "" }] : []),
    // Without it the text reads as a chapter's first step does
    ...(later ? [{ passage: TONE, pointer: "" }] : []),
    ...(challenge ? [{ passage: `--- ${sacrificeRewardLine(story, "player1")}\n`, pointer: LEVER_POINTER }] : []),
  ];
}

function firstTurnMoves(story: Story): Move[] {
  const flavor = story.getCurrentSwitchAnalysis()?.switches.find((s) => s.players.includes("player1"))?.type === "flavor";
  return flavor ? [{ passage: `${TURN_ROUND2_TEXT.flavorOpening}\n`, pointer: "" }] : [];
}

function sourceMoves(story: Story): Move[] {
  if (!showsImages(story)) return [];
  return [{ passage: sourceLine(story), pointer: SOURCE_POINTER }];
}

function movesFor(story: Story): Move[] {
  const beatType = story.getCurrentBeatType();
  const kind = beatType === "thread" ? chapterMoves(story) : beatType === "switch" && story.isFirstBeat() ? firstTurnMoves(story) : [];
  return [...kind, ...sourceMoves(story)];
}

/** A moved passage as one THIS BEAT item: its own lines, the first with a list marker. */
function asItem(passage: string): string {
  const lines = passage.trim().split("\n");
  const [first, ...rest] = lines;
  const marked = first.startsWith("- ") ? first : `- ${first.replace(/^-+\s*/, "")}`;
  return [marked, ...rest].join("\n");
}

/** The fixed rules with each per-call passage replaced by its pointer, and THIS BEAT's items in prompt order. */
export function splitRules(instructions: string, moves: Move[], label = LABEL): { fixed: string; items: string[] } {
  const ordered = moves
    .map((move) => ({ move, at: instructions.indexOf(move.passage) }))
    .sort((a, b) => a.at - b.at)
    .map(({ move }) => move);
  let fixed = instructions;
  for (const move of ordered) fixed = replaceOnce(label, fixed, move.passage, move.pointer);
  return { fixed: fixed.trimEnd(), items: ordered.map((move) => asItem(move.passage)) };
}

/** The per-call message: THIS BEAT's items, when there are any, then the story state. */
export const perCallMessage = (items: string[], state: string) => `${items.length > 0 ? `${THIS_BEAT_HEADING}\n${items.join("\n")}\n\n` : ""}${state}`;

/** B9's request for a single-player turn of any kind: the round-2 form with B9's paragraph rule, fixed rules first. */
export function turnRound3FormRequest(story: Story): TurnRound3Request {
  if (story.isMultiplayer()) throw new Error(`${LABEL}: B9's form is single-player (groups keep one message)`);
  const oneMessage = turnRound2Request(story, "paragraphsLast");
  const { instructions, state } = splitAtState(LABEL, oneMessage.prompt);
  const { fixed, items } = splitRules(instructions, movesFor(story));
  return {
    fixed,
    perCall: perCallMessage(items, state),
    schema: oneMessage.schema,
    ...(oneMessage.assemble ? { assemble: oneMessage.assemble } : {}),
    limits: productionCallLimits("beat", 1),
  };
}
