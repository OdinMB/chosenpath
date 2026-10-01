import type { Story } from "core/models/Story.js";
import type { SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { LATE_CLUES_TEXT } from "../lateClues.js";
import {
  SPARE_THREAD_PROBLEM,
  allowedLengths,
  isLatePart,
  mostThreads,
  neededAfterChapter,
  offeredOutcomes,
  pacedLengths,
  pacedLengthsFor,
  switchPacingProblem,
  switchPacingReading,
  turnsLeft,
  type PacedLengths,
  type SwitchPacingReading,
} from "../pacing.js";
import { beatStep, switchStep, threadStep, type PlanRequest, type TextRequest } from "../storyTextSteps.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

/*
 * Pacing so the story's last chapter still has a milestone to settle, story
 * instructions ranked below pacing, and planted details paid off rather than
 * piled up (eval only; fix 8 of the second playthroughs' review, 2026-10-01).
 * Found in the stored stories of the second round:
 * - Three of the four 25-turn stories had every outcome complete before their
 *   last chapter, which then settled nothing (an aftermath). The setups budget
 *   six milestones a player; a 25-turn story holds five to eight chapters, and
 *   which it gets is the chapter planner's lengths. The switch planner read
 *   "2 milestones still needed for about 2 threads" at New Avalon's and the
 *   food trucks' turn 16, then the chapter planner, which is told the allowed
 *   lengths and nothing about the milestones left, chose 3 beats where only 4
 *   leave as few threads as milestones (two more came, for one milestone); the
 *   estate agents' turn 13 chose 2 where 3 or 4 would have.
 * - The space pirates' setup said "When Wayward Comet Integrity is 30% or lower,
 *   the next switch must offer a repair, salvage, or ship-rescue thread"; the
 *   switch planner's step b ranks "a situation step a found forced" first, so
 *   two switches (14 and 18) gave the complete ship a grouped flavor thread
 *   while the scout's own outcome, 0 of 2, waited; it got its first chapter at
 *   the last switch and ended 1 of 2.
 * - Every turn after the first is told to "Plan a hint about a detail in the
 *   world that makes the player curious without spelling out what's going on",
 *   and the interludes to "Imply interesting details instead of spelling them
 *   out"; nothing asks a later turn or the ending to pay one off, so each story
 *   carried six to ten small mysteries the ending never explained.
 *
 * The variant is production's requests with:
 * - the chapter planner (not the story's last chapter): where some allowed
 *   lengths leave a number of threads after the chapter that fits the
 *   milestones still needed (the most any player still has after this
 *   chapter's picks) better than others, PACING allows only those, saying why;
 *   the plan check reads the same lengths (pacedLengths), with production's one
 *   retry on a length it doesn't allow;
 * - the switch planner's step b: when more threads are left than milestones,
 *   the story's last thread keeps one, and a forced situation never takes a
 *   thread from a player with none to spare;
 * - the turn: early, the hint tied to something a later beat can explain; in
 *   the story's late part (past two thirds of its turns), no new mystery, an
 *   earlier one explained where it fits, the interludes too; the ending
 *   explains the details the story kept bringing back, never settling an
 *   outcome beyond its milestones.
 * Everywhere else production's request byte for byte; the schemas and the
 * planners' assembly are production's.
 */

const LABEL = "Late-pacing variant";

/**
 * Production's switch planner step b as the stage measured it beside the
 * variant (SwitchPromptService.ts until the pacing-clues adoption of
 * 2026-10-01; production prints STEP_B_VARIANT_B since, PRIORITY_STEP).
 */
const STEP_B =
  "b) Priority. Read PACING. When fewer threads are left than milestones still needed, every direction pushes an outcome that still needs milestones, those with no thread yet first; when only one outcome can still get its milestones, a flavor switch on it is right. A complete outcome is offered only when every outcome is complete. A situation step a found forced comes first.";

const STEP_B_VARIANT =
  "b) Priority. Read PACING. When fewer threads are left than milestones still needed, every direction pushes an outcome that still needs milestones, those with no thread yet first; when only one outcome can still get its milestones, a flavor switch on it is right. When more threads are left than milestones still needed, the story's last thread must still have a milestone to settle: keep one outcome's last milestone (the main outcome's where you can) for the thread the last switch opens, and give a thread before it to another outcome, a complete one if no other is open. Apart from such a spare thread, a complete outcome is offered only when every outcome is complete. A situation step a found forced comes first, but it never takes a thread from a player who has no thread to spare (as many milestones still needed as threads left, or more): let the situation shape that player's thread on an outcome that still needs milestones instead (the damage, the threat or the deadline becomes part of it).";

/**
 * The fix-and-retest (B, 2026-10-01): in the short playthroughs the variant's
 * lengths left the food trucks' two players one thread for one milestone each,
 * and its switch planner gave that last thread to the complete contract (the
 * setup's "the final thread must be a Grand Circuit trial"), leaving both
 * outcomes unfinished; it did not read the instruction as a forced situation.
 * B names the story's instructions in step b.
 */
const STEP_B_VARIANT_B = `${STEP_B_VARIANT} The story's SWITCH/THREAD INSTRUCTIONS rank below this too: an instruction for a stat threshold or for the final thread shapes a thread (its place, its trial, its stakes) but never puts a complete outcome in place of a milestone a player still needs.`;

/** Why the variant's PACING allows only the narrowed lengths (production prints the same since the adoption, PACED_LENGTHS_TEXT in pacing.ts). */
const LONGER =
  "A shorter thread would leave more threads after this one than milestones still needed, and the story's last thread would have none left to settle.";
const SHORTER = "A longer thread would leave fewer threads after this one than milestones still needed.";

/**
 * Production's hint line (BeatPromptService, a turn after the first), and the
 * late part's lines this variant measured, which production prints since the
 * pacing-clues adoption (2026-10-01, lateClues.ts): one text for both. On a late
 * turn production's request already carries them, so this variant's late turn
 * is production's byte for byte, as it was measured.
 */
const { hint: HINT, hintLate: HINT_LATE, interludeAnchor: INTERLUDE_ANCHOR, interludeLate: INTERLUDE_LATE } = LATE_CLUES_TEXT;
const HINT_EARLY = `${HINT} Tie it to a story element, a thread or an outcome, so a later beat can explain it; a hint an earlier beat left open can come back, closer to its explanation, instead of a new one.`;

/** The ending's last instruction (BeatPromptService). */
const ENDING_ANCHOR = "- Use references to important story elements and things that happened to the player.";
const ENDING_LINE =
  "\n- Where the story kept bringing back a detail it never explained (a mark, a sound, a missing or odd object), explain it briefly, in the story's own terms, without settling any outcome beyond its milestones. Bring up no new mystery.";

/** The passages the tests pin. */
export const LATE_PACING_TEXT = {
  /** The fix-and-retest's problem where a thread is to spare and the last milestone goes before the last thread: production's plan check's since the adoption */
  spareProblem: SPARE_THREAD_PROBLEM,
  stepB: STEP_B,
  stepBVariant: STEP_B_VARIANT,
  stepBVariantB: STEP_B_VARIANT_B,
  longer: LONGER,
  shorter: SHORTER,
  hint: HINT,
  hintEarly: HINT_EARLY,
  hintLate: HINT_LATE,
  interludeAnchor: INTERLUDE_ANCHOR,
  interludeLate: INTERLUDE_LATE,
  endingAnchor: ENDING_ANCHOR,
  endingLine: ENDING_LINE,
};

// --- The lengths ---

/*
 * The paced lengths' arithmetic (mostThreads, pacedLengthsFor,
 * neededAfterChapter, pacedLengths) and the switch plan's reading against
 * PACING (offeredOutcomes, switchPacingReading, switchPacingProblem) are
 * production's since the pacing-clues adoption (pacing.ts), the same code the
 * variants ran.
 */
export {
  mostThreads,
  neededAfterChapter,
  offeredOutcomes,
  pacedLengths,
  pacedLengthsFor,
  switchPacingProblem,
  switchPacingReading,
  type PacedLengths,
  type SwitchPacingReading,
};

/** Production's way of naming lengths in PACING (pacing.ts, lengthsText). */
function lengthsText(lengths: number[]): string {
  if (lengths.length === 0) return "any of 2, 3 or 4 beats (too few turns are left for the story to end on its turn count)";
  if (lengths.length === 1) return `${lengths[0]} beats`;
  return `${lengths.slice(0, -1).join(", ")} or ${lengths[lengths.length - 1]} beats`;
}

/**
 * The variant's edit on the chapter planner's PACING line where the paced
 * lengths narrow the allowed ones: production's line as the stage measured it
 * (`from`) and the variant's (`to`, the narrowed lengths and why); undefined
 * where nothing narrows.
 */
export function pacedLengthsEdit(story: Story): { from: string; to: string } | undefined {
  const paced = pacedLengths(story);
  if (!paced.narrowed) return undefined;
  return {
    from: `Allowed lengths for this thread: ${lengthsText(allowedLengths(turnsLeft(story)))}.`,
    to: `Allowed lengths for this thread: ${lengthsText(paced.lengths)}. ${paced.narrowed === "longer" ? LONGER : SHORTER}`,
  };
}

/**
 * Production's planner as it stood when the pacing-clues stage measured it
 * beside the variants (before that stage's adoption of 2026-10-01): the switch
 * planner's step b as it was, and the chapter planner's PACING line with the
 * allowed lengths. The variants build on it; since the adoption production
 * prints pacingCluesB's own planners (adoptedPlanners.test.ts).
 */
export function pacingCluesBase(story: Story, role: "switch"): PlanRequest<SwitchAnalysis>;
export function pacingCluesBase(story: Story, role: "thread"): PlanRequest<ThreadAnalysis>;
export function pacingCluesBase(story: Story, role: "switch" | "thread"): PlanRequest<SwitchAnalysis> | PlanRequest<ThreadAnalysis> {
  if (role === "switch") {
    const production = switchStep.request(story);
    const { instructions, state } = splitAtState(LABEL, production.prompt);
    if (!instructions.includes(STEP_B_VARIANT_B)) return production;
    return { ...production, prompt: replaceOnce(LABEL, instructions, STEP_B_VARIANT_B, STEP_B) + state };
  }
  const production = threadStep.request(story);
  const edit = pacedLengthsEdit(story);
  if (!edit) return production;
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  return { ...production, prompt: instructions + replaceOnce(LABEL, state, edit.to, edit.from) };
}

function threadRequest(story: Story): PlanRequest<ThreadAnalysis> {
  const base = pacingCluesBase(story, "thread");
  const edit = pacedLengthsEdit(story);
  if (!edit) return base;
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  return { ...base, prompt: instructions + replaceOnce(LABEL, state, edit.from, edit.to) };
}

// --- The switch planner ---

function switchRequest(story: Story, b: boolean): PlanRequest<SwitchAnalysis> {
  const base = pacingCluesBase(story, "switch");
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  if (!instructions.includes(STEP_B)) return base;
  return { ...base, prompt: replaceOnce(LABEL, instructions, STEP_B, b ? STEP_B_VARIANT_B : STEP_B_VARIANT) + state };
}

// --- The turn ---

/** Whether the turn being written is in the story's late part: past two thirds of its turns (production's, pacing.ts). */
export { isLatePart };

/** The late part's lines on a turn's instructions: no new mystery in place of the hint, the interludes' line after their examples. */
const withLateLines = (instructions: string) =>
  replaceOnce(LABEL, replaceOnce(LABEL, instructions, HINT, HINT_LATE), INTERLUDE_ANCHOR, `${INTERLUDE_ANCHOR}${INTERLUDE_LATE}`);

function turnRequest(story: Story): TextRequest {
  const production = beatStep.request(story);
  let { instructions } = splitAtState(LABEL, production.prompt);
  const { state } = splitAtState(LABEL, production.prompt);
  if (story.getCurrentBeatType() === "ending") {
    if (!instructions.includes(ENDING_ANCHOR)) return production;
    instructions = replaceOnce(LABEL, instructions, ENDING_ANCHOR, `${ENDING_ANCHOR}${ENDING_LINE}`);
    return { ...production, prompt: instructions + state };
  }
  if (!instructions.includes(HINT)) return production;
  if (!isLatePart(story)) return { ...production, prompt: replaceOnce(LABEL, instructions, HINT, HINT_EARLY) + state };
  return { ...production, prompt: withLateLines(instructions) + state };
}

/** The turn with the late part's lines only: production's on an early turn, the first turn and the ending. */
function lateOnlyTurnRequest(story: Story): TextRequest {
  const production = beatStep.request(story);
  if (story.getCurrentBeatType() === "ending" || !isLatePart(story)) return production;
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  if (!instructions.includes(HINT)) return production;
  return { ...production, prompt: withLateLines(instructions) + state };
}

/**
 * The variant's request for a story role: production's switch planner, chapter
 * planner or turn, each with its lines where they apply; `b`, the
 * fix-and-retest's switch planner (the others as the variant's).
 */
export function latePacingRequest(story: Story, role: "switch", options?: { b?: boolean }): PlanRequest<SwitchAnalysis>;
export function latePacingRequest(story: Story, role: "thread", options?: { b?: boolean }): PlanRequest<ThreadAnalysis>;
export function latePacingRequest(story: Story, role: "beat" | "switch" | "thread", options?: { b?: boolean }): TextRequest & { assemble?: (reply: unknown) => unknown };
export function latePacingRequest(story: Story, role: "beat" | "switch" | "thread", options: { b?: boolean } = {}): TextRequest & { assemble?: (reply: unknown) => unknown } {
  if (role === "switch") return switchRequest(story, options.b === true);
  if (role === "thread") return threadRequest(story);
  return turnRequest(story);
}

/**
 * The pacing-clues stage's variant (2026-10-01, fix 8's retest in whole short
 * playthroughs): the fix-and-retest's planners (the chapter planner's paced
 * lengths, step b with the story's SWITCH/THREAD INSTRUCTIONS ranked below a
 * player's needed milestones) and, of the turn's lines, only the late part's
 * (no new mystery, an earlier one explained where it fits, the interludes
 * too). An early turn's hint and the ending are production's: the early line
 * had no reading of its own, and the ending line moved nothing in the
 * late-pacing stage (0 of 18 player endings explained a detail, 1 of 18 with
 * it), so what runs is what would be adopted.
 */
export function pacingCluesRequest(story: Story, role: "switch"): PlanRequest<SwitchAnalysis>;
export function pacingCluesRequest(story: Story, role: "thread"): PlanRequest<ThreadAnalysis>;
export function pacingCluesRequest(story: Story, role: "beat" | "switch" | "thread"): TextRequest & { assemble?: (reply: unknown) => unknown };
export function pacingCluesRequest(story: Story, role: "beat" | "switch" | "thread"): TextRequest & { assemble?: (reply: unknown) => unknown } {
  if (role === "switch") return switchRequest(story, true);
  if (role === "thread") return threadRequest(story);
  return lateOnlyTurnRequest(story);
}
