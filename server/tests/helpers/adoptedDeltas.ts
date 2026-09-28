/*
 * The deliberate differences between production and the eval variants it
 * adopted on 2026-09-28 (setupR3, planV2b, turnB6), the one place the
 * adoption tests read them from. Each is a logged adoption item or a settled
 * decision that no round measured; everything else production sends is the
 * measured request byte for byte (.plans/2026-09-26_build-followup.md,
 * "Adoption into production").
 */

import type { GameMode } from "core/types/index.js";
import { GameModes } from "core/types/index.js";

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

/** The measured setup prompt as production sends it. */
export function adoptedSetupPrompt(measured: string, players: number, mode: GameMode): string {
  return isContestSetup(players, mode) ? SCOREBOARD_SENTENCES.reduce((text, [from, to]) => text.split(from).join(to), measured) : measured;
}

/** Chapter planner (step 3, the logged "without a number"): the title field. */
export const MEASURED_TITLE = "The thread's title; its beats show it with their number.";
export const ADOPTED_TITLE = "The thread's title, without a number: its beats show it with their number.";

/** The measured chapter planner's JSON schema as production sends it. */
export function adoptedThreadSchema(measuredJson: string): string {
  return measuredJson.replace(MEASURED_TITLE, ADOPTED_TITLE);
}

/** Turns (step 5): the scoreboard ending rule, the one line on the ending of a story with a contested outcome. */
export const SHARED_OUTCOMES_LINE = "--- For shared outcomes, touch on how the outcome affects the other players.\n";
export const SCOREBOARD_ENDING_RULE =
  "- For a contested outcome, the side ahead on its scoreboard wins unless its milestones clearly say otherwise; a score between 45 and 55 is a draw (the mixed resolution). The scoreboard is the shared opposites stat its resonance names (\"Scored by …\"), and its first side is side A (with three players, player1's camp).\n";

/** The measured turn prompt as production sends it: the rule on a contest's ending. */
export function adoptedTurnPrompt(measured: string, contestEnding: boolean): string {
  return contestEnding ? measured.replace(SHARED_OUTCOMES_LINE, `${SHARED_OUTCOMES_LINE}${SCOREBOARD_ENDING_RULE}`) : measured;
}
