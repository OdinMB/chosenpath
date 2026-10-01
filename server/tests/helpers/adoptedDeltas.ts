/*
 * The deliberate differences between production and the eval variants it
 * adopted on 2026-09-28 (setupR3, planV2b for the switch, planV2c for the
 * chapter, turnB6; since 2026-09-30 planV2e for the chapter and endingStateB
 * for every ending), the one place the adoption tests read them from. Each is
 * a logged adoption item, a settled decision that no round measured, or (the
 * kids stat examples) a retested passage measured in another variant;
 * everything else production sends is the variant's request byte for byte
 * (.plans/2026-09-26_build-followup.md, "Adoption into production" and "The
 * owner's feedback of 2026-09-28"). The chapter planner has none: planV2c
 * carries the adopted "without a number" in the chapter title's field; since
 * 2026-10-01 it carries measured wording planner v2f never had (challenge and
 * contest results that never restate the approach: withResultsAsOutcomes and
 * withResultsAsOutcomesSchema, the challenge-results stage's variant, not a
 * delta). The switch planner has one since 2026-09-30: the threads that fit
 * near the end; since 2026-10-01 it also carries a measured line planner v2b
 * never had (a contest's last stage offered only as a grouped thread:
 * withContestLastStage, the parallel-threads stage's variant, not a delta).
 * A single player's read-with-kids turn is kidsTurn (2026-10-01) with one
 * delta where it shows images: the image places (withKidsImageSlots).
 */

import type { Story } from "core/models/Story.js";
import type { GameMode } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { chaptersThatFit, turnsLeft } from "../../src/game/services/pacing.js";
import { StoryStatePromptService } from "../../src/game/services/prompts/StoryStatePromptService.js";
import { chaptersThatFit as measuredChaptersThatFit } from "../../src/game/services/storyTextRounds/pacing.js";
import { KIDS_STATS, KIDS_STATS_VARIED } from "../../src/game/services/storyTextRounds/setupRound3Text.js";
import { PARALLEL_THREADS_TEXT, takesLastStageLine } from "../../src/game/services/storyTextRounds/parallelThreads.js";
import { RESULTS_AS_OUTCOMES_TEXT } from "../../src/game/services/storyTextRounds/resultsAsOutcomes.js";

/** Contests keep score (competitive and cooperative-competitive multiplayer). */
export const isContestSetup = (players: number, mode: GameMode): boolean =>
  players > 1 && (mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive);

/**
 * Setup (step 5): with the scoreboard ending rule, the three sentences that
 * were true only while no stat decided an outcome, in contest setups.
 */
export const SCOREBOARD_SENTENCES: [string, string][] = [
  [
    "At the end, one beat per player writes that player's ending from the outcomes' milestones.",
    "At the end, one beat per player writes that player's ending from the outcomes' milestones and, for a contested outcome, from its scoreboard: the side ahead wins unless the milestones clearly say otherwise.",
  ],
  [
    "they are the story's only progress bar.",
    "they are the story's progress bar, and a contested outcome's scoreboard decides it at the ending unless its milestones clearly say otherwise.",
  ],
  [
    "nothing in the game reads a stat to decide an outcome or to end the story.",
    "no stat decides an outcome or ends the story, apart from a contested outcome's scoreboard at the ending.",
  ],
];

/**
 * Setup (the setup retests of 2026-09-28, measured as setupR3b): the kids
 * stat examples from other kinds of story, in place of round 3's "Courage"
 * first, which named a stat in all four kids setups (4 of 4 copied an
 * example; 1 of 4 on the retest). The retest's other clause, the identity
 * clause's names in outcomes only, did not pass and stays as measured.
 */
export const KIDS_EXAMPLES: [string, string] = [KIDS_STATS, KIDS_STATS_VARIED];

/** The measured setup prompt as production sends it. */
export function adoptedSetupPrompt(measured: string, players: number, mode: GameMode): string {
  const kids = measured.split(KIDS_EXAMPLES[0]).join(KIDS_EXAMPLES[1]);
  return isContestSetup(players, mode) ? SCOREBOARD_SENTENCES.reduce((text, [from, to]) => text.split(from).join(to), kids) : kids;
}

/*
 * Turns (step 5, until 2026-09-30): the scoreboard ending rule, one line on
 * the ending of a story with a contested outcome, was a logged delta on
 * today's form. Since the ending told as its milestones leave it was adopted
 * (the owner's decision of 2026-09-30), production's every ending is the
 * measured variant endingStateB byte for byte, which carries the rule with its
 * unfinished half, so no ending delta is left.
 */

/*
 * The switch planner (2026-09-30, the playthroughs' review): PACING's threads
 * that fit are never fewer than the length rule makes come
 * (`chaptersThatFit` in production's pacing.ts), where planner v2b counted
 * turns left ÷ 4 alone. The two differ only near a story's end (3, 6, 7 and 11
 * turns left), where ÷ 4 had the planner read "about 0 more threads fit, the
 * one this switch opens included" beside "it has exactly 2 beats". A
 * correction of a contradiction in the measured request, unmeasured.
 */
const fitLine = (n: number) => `so about ${n} more ${n === 1 ? "thread fits" : "threads fit"}, the one this switch opens included.`;
const neededLine = (n: number) => `still needed for about ${n} ${n === 1 ? "thread" : "threads"}.`;

/** The measured switch planner's prompt with production's count of the threads that fit. */
export function withThreadsThatFit(measured: string, story: Story): string {
  const left = turnsLeft(story);
  const was = measuredChaptersThatFit(left);
  const now = chaptersThatFit(left);
  if (was === now) return measured;
  for (const line of [fitLine(was), neededLine(was)]) {
    if (!measured.includes(line)) throw new Error(`The measured switch planner no longer says "${line}"`);
  }
  return measured.split(fitLine(was)).join(fitLine(now)).split(neededLine(was)).join(neededLine(now));
}

/*
 * The switch planner (2026-10-01, the parallel-threads stage, fix 4 of the
 * second playthroughs' review): where a contested shared outcome's next thread
 * settles its last stage, in a contest game after the opening switch, the line
 * that offers it only as a grouped thread, after the coordination examples.
 * Not a delta: measured (the variant parallelThreads' switch planner, its
 * offer reading 1 of 6 → 5 of 6, moved) and adopted as measured; planner v2b,
 * the measured base the other switch tests read, never carried it.
 */
export function withContestLastStage(measured: string, story: Story): string {
  if (!takesLastStageLine(story)) return measured;
  const { lastStageAnchor, lastStageLine } = PARALLEL_THREADS_TEXT;
  if (measured.split(lastStageAnchor).length !== 2) throw new Error("The measured switch planner no longer carries the coordination examples' last line once");
  return measured.replace(lastStageAnchor, `${lastStageAnchor}${lastStageLine}`);
}

/*
 * The chapter planner (2026-10-01, the challenge-results stage, fix 5 of the
 * second playthroughs' review): after the results rule's challenge sentence,
 * the sentence that the approach chosen at the switch and the one a step's
 * question names are where a thread starts and no result restates them; the
 * flavor pick's line in PLAYER DECISIONS worded the same way; and the
 * challenge and contest milestone fields' "naming who did what" narrowed to
 * what was won or lost. Not a delta: measured (the variant resultsAsOutcomes,
 * resultsFitKind 8 of 30 -> 22 of 30, moved) and adopted as measured; planner
 * v2f, the measured base the other chapter tests read, never carried it.
 */
const countOf = (story: Story) => (story.isMultiplayer() ? "group" : "single");

/** The measured chapter planner's prompt with the results-as-outcomes edits. */
export function withResultsAsOutcomes(measured: string, story: Story): string {
  const { rule, approachLine, flavorAnchor, flavorLine } = RESULTS_AS_OUTCOMES_TEXT;
  const which = countOf(story);
  if (measured.split(rule[which]).length !== 2) throw new Error("The measured chapter planner no longer carries the results rule's challenge sentence once");
  return measured.replace(rule[which], `${rule[which]}${approachLine[which]}`).split(flavorAnchor).join(flavorLine);
}

/** The measured chapter planner's JSON schema text with the milestone fields reworded. */
export function withResultsAsOutcomesSchema(measuredJson: string, story: Story): string {
  const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
  return RESULTS_AS_OUTCOMES_TEXT.milestones[countOf(story)].reduce((text, edit) => {
    if (!text.includes(inJson(edit.from))) throw new Error(`The measured chapter planner's schema no longer says "${edit.from}"`);
    return text.split(inJson(edit.from)).join(inJson(edit.to));
  }, measuredJson);
}

/** The chapter rules as the measured switch turn printed them: the story's thread types and switch/thread instructions. */
export const CHAPTER_RULES_HEADING = "SPECIAL SWITCH/THREAD INSTRUCTIONS:";

/**
 * Turns (the owner's feedback of 2026-09-28): the chapter rules are for the
 * planners only. The switch turn was the one turn that carried them, as its
 * prompt's last section; production's switch turn ends before it. The
 * after-chapter stat changes it applies are each stat's own "Adjustments
 * after threads", which the switch turn still reads. Unmeasured, as decided.
 */
export function withoutChapterRules(measured: string, story: Story): string {
  if (story.getCurrentBeatType() !== "switch") return measured;
  const tail = `\n${StoryStatePromptService.createStoryStatePrompt(story, { switchAndThreadInstructions: true })}`;
  if (!measured.endsWith(tail)) throw new Error("The measured switch turn no longer ends with its chapter rules");
  return measured.slice(0, -tail.length);
}

/** Every turn delta: no chapter rules on a switch turn (endings are measured whole, as endingStateB). */
export function adoptedTurn(measured: string, story: Story): string {
  return withoutChapterRules(measured, story);
}

/*
 * A single player's read-with-kids turn with images (2026-10-01, the review of
 * fix 6): kidsTurn, as measured, kept production's image lines, which put a
 * second image on "the third or fourth paragraph" and none on the last. In the
 * 3-4 paragraphs it asks for, a 3-paragraph turn had no allowed place for that
 * image (its third paragraph is its last). Production names the second
 * paragraph, or the third of four, instead. A correction of a contradiction in
 * the measured request, unmeasured: the stage's one case with images wrote 4
 * paragraphs both times. A turn without images is kidsTurn byte for byte.
 */
const KIDS_IMAGE_SLOTS = {
  prompt: [
    "--- A good distribution is an image tag for the first paragraph and one for the third or fourth paragraph.\n",
    "--- A good distribution is an image tag for the first paragraph and one for the second paragraph (or the third, if there are four).\n",
  ],
  field: [
    "--- A good distribution is to have one image tag right before the first paragraph and one on the third or fourth paragraph. Avoid using image tags in or right in front of the last paragraph.\n",
    "--- A good distribution is to have one image tag right before the first paragraph and one on the second paragraph (or the third, if there are four). Never put an image tag on the last paragraph.\n",
  ],
  late: [
    "Use it relatively late in the beat text (third or fourth paragraph).",
    "Use it relatively late in the beat text (the second paragraph, or the third if there are four).",
  ],
} as const;

const showsImages = (story: Story) => story.hasImages() || story.generatesImages();

function swapOnce(text: string, [from, to]: readonly [string, string], what: string): string {
  if (text.split(from).length !== 2) throw new Error(`The measured kids turn no longer carries ${what} once`);
  return text.replace(from, () => to);
}

/** The measured kids turn's prompt with production's image places (a turn that shows images). */
export function withKidsImageSlots(measured: string, story: Story): string {
  return showsImages(story) ? swapOnce(measured, KIDS_IMAGE_SLOTS.prompt, "the image distribution line") : measured;
}

/** The measured kids turn's JSON schema text with production's image places in the text field. */
export function withKidsImageSlotsSchema(measuredJson: string, story: Story): string {
  const inJson = (pair: readonly [string, string]) => [JSON.stringify(pair[0]).slice(1, -1), JSON.stringify(pair[1]).slice(1, -1)] as const;
  if (!showsImages(story)) return measuredJson;
  const placed = swapOnce(measuredJson, inJson(KIDS_IMAGE_SLOTS.field), "the text field's image distribution");
  return story.generatesImages() ? swapOnce(placed, inJson(KIDS_IMAGE_SLOTS.late), "the generated image's place") : placed;
}
