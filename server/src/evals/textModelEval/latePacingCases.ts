import type { EvalCase } from "./cases.js";
import { choiceResultCases, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs2Sent } from "./parallelThreadsCases.js";
import type { PlayRun } from "./playthroughs.js";
import { requestFor, requestText } from "./variants.js";

/*
 * The late-pacing stage's cases (2026-10-01, fix 8 of the second playthroughs'
 * review), from the second round's stored runs (playthroughs-2.json), each
 * rebuilt by replaying its run (playthroughReplay.ts) and built only where its
 * request is the one the run sent (playthroughs2Sent: production's switch
 * planner today but for the contest's last-stage line, which none of these
 * switches takes).
 *
 * The switch plans:
 * - the space pirates' switches at turns 14 and 18, after the Wayward Comet's
 *   integrity fell to the setup's 30% threshold ("the next switch must offer a
 *   repair, salvage, or ship-rescue thread"): production gave the complete ship
 *   a grouped flavor thread both times while the scout's own outcome, 0 of 2,
 *   waited (three threads left for her two milestones at 14, two at 18);
 * - the switches where a thread was to spare, one milestone for two threads
 *   (New Avalon's and the food trucks' at turn 20, the estate agents' at 19):
 *   production put the last milestone in the next chapter, and the story's last
 *   chapter settled nothing.
 *
 * The short playthroughs start at the chapter plans where the lengths decided
 * whether the last chapter would keep a milestone (LATE_PACING_STARTS): New
 * Avalon's and the food trucks' at turn 17 (one milestone after the chapter,
 * nine turns left: only four beats leave one thread after it), the estate
 * agents' at turn 13 (two after it, thirteen left: three or four beats).
 */

const TRIGGER = "A switch after a stat threshold's instruction fired, where production gave the complete ship a grouped thread while the scout's own outcome waited:";
const SPARE = "A switch with a thread to spare (one milestone for two threads), where production put the last milestone in the next chapter and the last chapter settled nothing:";

export const LATE_PACING_SWITCH_SPECS: ChoiceCaseSpec[] = [
  { id: "round-late-switch-space-pirates-t14", story: "play-space-pirates", turn: 14, role: "switch", purpose: `${TRIGGER} integrity 30%, the scout 0 of 2 with three threads left.` },
  { id: "round-late-switch-space-pirates-t18", story: "play-space-pirates", turn: 18, role: "switch", purpose: `${TRIGGER} integrity 20%, the scout 0 of 2 with two threads left.` },
  { id: "round-late-switch-avalon-t20", story: "play-avalon", turn: 20, role: "switch", purpose: `${SPARE} the Heart's last stage.` },
  { id: "round-late-switch-food-trucks-t20", story: "play-food-trucks", turn: 20, role: "switch", purpose: `${SPARE} Suri's principle and Jo's crew, each at its last stage.` },
  { id: "round-late-switch-estate-agents-t19", story: "play-estate-agents", turn: 19, role: "switch", purpose: `${SPARE} Nia's protégé at its last stage, Rory complete.` },
];

/** Where each short playthrough starts: the stored story replayed to the chapter plan at this turn, then played on. */
export type LatePacingStart = { story: string; turn: number; why: string };

export const LATE_PACING_STARTS: LatePacingStart[] = [
  { story: "play-avalon", turn: 17, why: "the Heart at 1 of 3 after the chapter's stage, nine turns left: only 4 beats leave one thread after it; production chose 3" },
  { story: "play-food-trucks", turn: 17, why: "one milestone each after the contract's last stage, nine turns left: only 4 beats; production chose 3" },
  { story: "play-estate-agents", turn: 13, why: "Nia two milestones after the chapter, thirteen turns left: 3 or 4 beats; production chose 2" },
];

/**
 * The pacing-clues stage's starts (2026-10-01, fix 8's retest in whole short
 * playthroughs): the late-pacing stage's three, and the space pirates' switch at
 * turn 14, where the setup's "When Wayward Comet Integrity is 30% or lower, the
 * next switch must offer a repair, salvage, or ship-rescue thread" met pacing:
 * production gave the complete ship a grouped flavor thread there and at 18
 * while the scout's own outcome, 0 of 2, waited, and it ended unfinished. Its
 * request is the stored run's byte for byte (a test).
 */
export const PACING_CLUES_STARTS: LatePacingStart[] = [
  ...LATE_PACING_STARTS,
  { story: "play-space-pirates", turn: 14, why: "the switch after the ship fell to the setup's 30% threshold, the ship complete, the scout 0 of 2 with three threads left; production gave all three the ship" },
];

const CATEGORY = "late-pacing";

/**
 * The fix-and-retest's case (2026-10-01): the switch at turn 21 of the
 * variant's own food-trucks short playthrough (sample 1), where its lengths
 * left each player one thread for one milestone and its switch planner gave
 * that last thread to the complete contract, as the setup's "the final thread
 * must be a Grand Circuit trial" asks; built only where its request is the one
 * the variant sent.
 */
export const LATE_PACING_RETEST_SPEC: ChoiceCaseSpec = {
  id: "round-late-switch-food-trucks-variant-t21",
  story: "play-food-trucks",
  turn: 21,
  role: "switch",
  purpose:
    "The variant's last switch (one thread fits, each player one milestone short, the contract complete), where its switch planner gave the last thread to the complete contract for the setup's final-thread rule:",
};

/** The retest's case from the short playthroughs (late-pacing.json): the variant's food-trucks run, sample 1, and what could not be built. */
export function latePacingRetestCases(playRuns: PlayRun[], promptHashOf: PromptHashOf): { cases: EvalCase[]; problems: string[] } {
  const run = playRuns.filter((r) => r.spec.id === LATE_PACING_RETEST_SPEC.story && r.sample === 1 && r.from?.variant === "latePacing");
  if (run.length === 0) return { cases: [], problems: [`${LATE_PACING_RETEST_SPEC.id}: no short playthrough of the variant on ${LATE_PACING_RETEST_SPEC.story}, sample 1`] };
  const sent: SentRequestText = (input) => requestText(requestFor("latePacing", input));
  const { cases, problems } = choiceResultCases(run, promptHashOf, [LATE_PACING_RETEST_SPEC], sent, CATEGORY);
  const note = `${LATE_PACING_RETEST_SPEC.purpose} Built from the variant's own short playthrough of ${LATE_PACING_RETEST_SPEC.story} (sample 1, from turn 17) at turn ${LATE_PACING_RETEST_SPEC.turn}, replayed with its own plans, turns and dice; its request is the one the variant sent there, byte for byte.`;
  return { cases: cases.map((c) => ({ ...c, note })), problems };
}

/** The stage's switch cases from the second round's stored runs, each only where its request is the one the run sent; and what could not be built. */
export function latePacingCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = LATE_PACING_SWITCH_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-late-pacing-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function latePacingCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = LATE_PACING_SWITCH_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = latePacingCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
