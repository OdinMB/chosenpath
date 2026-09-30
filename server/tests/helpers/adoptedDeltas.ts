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
 * carries the adopted "without a number" in the chapter title's field.
 */

import type { Story } from "core/models/Story.js";
import type { GameMode } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { StoryStatePromptService } from "../../src/game/services/prompts/StoryStatePromptService.js";
import { KIDS_STATS, KIDS_STATS_VARIED } from "../../src/game/services/storyTextRounds/setupRound3Text.js";

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
