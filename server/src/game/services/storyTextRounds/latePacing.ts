import type { Story } from "core/models/Story.js";
import type { SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { allowedLengths, fewestThreads, isLastChapter, outcomeNeeds, phaseOf, pickedOutcome, turnsLeft } from "../pacing.js";
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

/** Production's switch planner step b (SwitchPromptService.ts, STEP_B). */
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

const LONGER =
  "A shorter thread would leave more threads after this one than milestones still needed, and the story's last thread would have none left to settle.";
const SHORTER = "A longer thread would leave fewer threads after this one than milestones still needed.";

/** Production's hint line (BeatPromptService, a turn after the first). */
const HINT = "- Plan a hint about a detail in the world that makes the player curious without spelling out what's going on. (Similar to the interlude, see below.)";
const HINT_EARLY = `${HINT} Tie it to a story element, a thread or an outcome, so a later beat can explain it; a hint an earlier beat left open can come back, closer to its explanation, instead of a new one.`;
const HINT_LATE =
  "- The story is in its late part: plant no new mystery. Where it fits this beat, explain a detail an earlier beat left unexplained instead (a mark, a sound, a missing or odd object that the facts or earlier beats keep bringing back): say plainly what it is or was, in the story's own terms. The interludes (see below) bring no new mystery either.";

/** The interludes' last example (BeatPromptService). */
const INTERLUDE_ANCHOR = `- "The dream distillery is surrounded by scaffolding." (What's a dream distillery?)\n`;
const INTERLUDE_LATE = "In the story's late part, an interlude recalls or explains a detail the story already has instead of implying a new one.\n";

/** The ending's last instruction (BeatPromptService). */
const ENDING_ANCHOR = "- Use references to important story elements and things that happened to the player.";
const ENDING_LINE =
  "\n- Where the story kept bringing back a detail it never explained (a mark, a sound, a missing or odd object), explain it briefly, in the story's own terms, without settling any outcome beyond its milestones. Bring up no new mystery.";

/** The passages the tests pin. */
export const LATE_PACING_TEXT = {
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

/**
 * The most threads, each a switch turn and a chapter of a length
 * allowedLengths gives, that use up exactly this many turns; undefined when
 * none can (1 or 2 turns left). fewestThreads' other end.
 */
export function mostThreads(left: number): number | undefined {
  const most: (number | undefined)[] = [0];
  for (let n = 1; n <= left; n++) {
    const after = allowedLengths(n - 1)
      .map((length) => most[n - 1 - length])
      .filter((count): count is number => count !== undefined);
    most[n] = after.length ? 1 + Math.max(...after) : undefined;
  }
  return most[Math.max(0, left)];
}

export type PacedLengths = { lengths: number[]; narrowed?: "longer" | "shorter" };

/**
 * The lengths production's rule allows (allowedLengths) whose threads after
 * the chapter fit the milestones still needed best: as few as must come no
 * more than the milestones (else a later thread settles nothing), as many as
 * can come no fewer (else milestones go unsettled). Production's lengths
 * where every one fits alike; `narrowed` says which way the others were cut.
 */
export function pacedLengthsFor(left: number, need: number): PacedLengths {
  const allowed = allowedLengths(left);
  if (allowed.length < 2) return { lengths: allowed };
  const scored = allowed.map((length) => {
    const after = left - length;
    const spare = Math.max(0, (fewestThreads(after) ?? 0) - need);
    const short = Math.max(0, need - (mostThreads(after) ?? 0));
    return { length, spare, short, cost: spare + short };
  });
  const best = Math.min(...scored.map((s) => s.cost));
  const kept = scored.filter((s) => s.cost === best);
  if (kept.length === scored.length) return { lengths: allowed };
  const cut = scored.filter((s) => s.cost !== best);
  return { lengths: kept.map((s) => s.length), narrowed: cut.some((s) => s.spare > 0) ? "longer" : "shorter" };
}

/**
 * The milestones still needed once the chapter being planned has settled its
 * stage: per player, their outcomes' still needed less one on each outcome a
 * player's switch pick sets (a shared outcome one player picks counts for
 * every player); the most any player still needs.
 */
export function neededAfterChapter(story: Story): number {
  const picked = new Set(
    story
      .getPlayerSlots()
      .map((slot) => pickedOutcome(story, slot)?.outcomeId)
      .filter((id): id is string => id !== undefined)
  );
  const needs = story.getPlayerSlots().map((slot) => outcomeNeeds(story, slot, false).reduce((sum, need) => sum + Math.max(0, need.stillNeeded - (picked.has(need.id) ? 1 : 0)), 0));
  return needs.length ? Math.max(...needs) : 0;
}

/** The lengths the variant's chapter planner may write, and its plan check reads: production's at the story's last chapter. */
export function pacedLengths(story: Story): PacedLengths {
  const left = turnsLeft(story);
  if (isLastChapter(left)) return { lengths: allowedLengths(left) };
  return pacedLengthsFor(left, neededAfterChapter(story));
}

/** Production's way of naming lengths in PACING (pacing.ts, lengthsText). */
function lengthsText(lengths: number[]): string {
  if (lengths.length === 0) return "any of 2, 3 or 4 beats (too few turns are left for the story to end on its turn count)";
  if (lengths.length === 1) return `${lengths[0]} beats`;
  return `${lengths.slice(0, -1).join(", ")} or ${lengths[lengths.length - 1]} beats`;
}

function threadRequest(story: Story): PlanRequest<ThreadAnalysis> {
  const production = threadStep.request(story);
  const paced = pacedLengths(story);
  if (!paced.narrowed) return production;
  const left = turnsLeft(story);
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  const line = `Allowed lengths for this thread: ${lengthsText(allowedLengths(left))}.`;
  const replacement = `Allowed lengths for this thread: ${lengthsText(paced.lengths)}. ${paced.narrowed === "longer" ? LONGER : SHORTER}`;
  return { ...production, prompt: instructions + replaceOnce(LABEL, state, line, replacement) };
}

// --- The switch planner ---

function switchRequest(story: Story, b: boolean): PlanRequest<SwitchAnalysis> {
  const production = switchStep.request(story);
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  if (!instructions.includes(STEP_B)) return production;
  return { ...production, prompt: replaceOnce(LABEL, instructions, STEP_B, b ? STEP_B_VARIANT_B : STEP_B_VARIANT) + state };
}

// --- The turn ---

/** Whether the turn being written is in the story's late part: past two thirds of its turns. */
export function isLatePart(story: Story): boolean {
  return phaseOf(story.getCurrentTurn() + 1, story.getMaxTurns(), false) === "late";
}

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
  instructions = replaceOnce(LABEL, instructions, HINT, HINT_LATE);
  instructions = replaceOnce(LABEL, instructions, INTERLUDE_ANCHOR, `${INTERLUDE_ANCHOR}${INTERLUDE_LATE}`);
  return { ...production, prompt: instructions + state };
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
