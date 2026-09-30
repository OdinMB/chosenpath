import type { EvalCase } from "./cases.js";
import { choiceResultCases, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs2Sent } from "./parallelThreadsCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The challenge-results stage's cases (2026-10-01, fix 5 of the second
 * playthroughs' review; no calls): chapter plans of the second round's stored
 * runs (playthroughs-2.json), frozen beside the other cases with
 * --build-challenge-cases. Each is the chapter planner's input, rebuilt by
 * replaying its stored run from its start (playthroughReplay.ts) and built only
 * where its request is the one production sent there, byte for byte:
 * production's chapter planner is unchanged since that run (playthroughs2Sent).
 *
 * Where the calibrated resultsFitKind check failed the stored plan, a
 * challenge or contest result telling how the player acts; most after a flavor
 * switch, whose chosen approach the results restate:
 * - one player: lemonade turn 2 ("Theo buys a compact, pay-as-you-go opening
 *   order, records every expense", the switch's "pay-as-you-go amount"), the
 *   mouse story's turn 9 ("Bran steadies the loose board while Pip leads the
 *   listening", the switch's "watch the loose board"), and after a topic switch
 *   New Avalon turn 2 ("Jun maps the disturbed dust");
 * - two players: food trucks turn 2 (a contest: "Suri's color-anchor trick",
 *   "Jo's deliberate checks") and turn 9 ("Suri gathers Slowglass residents'
 *   advice and adapts her service", "Jo uses the baker's local knowledge"),
 *   and after a topic switch turn 6 ("Suri listens to the waiting workers and
 *   adapts"); the estate agents' turn 2 ("Rory's careful separation", "Nia's
 *   distinction"), turn 16 ("After Rory gives a candid account", "Nia
 *   acknowledges the resident's boundaries") and turn 23 ("Rory gives a clear,
 *   checkable explanation");
 * - three players: the space pirates' turn 2 ("Bex coordinates the work while
 *   Jori confirms the right fittings and Pip pinpoints the heat pattern") and
 *   turn 19 ("Bex gets each crew member to name a risk, Jori marks the
 *   drive-idle points, Pip lays out a grit-free tool lane").
 * Ordinary ones, where the stored plan passed: New Avalon turn 21 (after a
 * flavor switch; the plan whose step the player met at turn 22), the mouse
 * story's turn 2, food trucks turn 21 (Jo's challenge beside Suri's
 * exploration, after a flavor switch) and the space pirates' turn 6 (the
 * galley-table contest beside Jori's exploration; by hand partly, one result
 * naming "Pip's emphasis").
 */

const DEFECT = "A chapter plan whose challenge or contest results tell how the player acts:";
const ORDINARY = "A chapter plan whose challenge or contest results tell how the attempt turns out:";

const spec = (story: string, turn: number, purpose: string): ChoiceCaseSpec => ({ id: `round-results-${story}-t${turn}`, story: `play-${story}`, turn, role: "thread", purpose });

export const CHALLENGE_RESULTS_CASE_SPECS: ChoiceCaseSpec[] = [
  // One player
  spec("lemonade", 2, `${DEFECT} the lemonade stand's opening budget after a flavor switch ("Theo buys a compact, pay-as-you-go opening order, records every expense").`),
  spec("avalon", 2, `${DEFECT} New Avalon's empty cradle after a topic switch ("Jun maps the disturbed dust", "Jun and Mara carefully map").`),
  spec("kids-mouse", 9, `${DEFECT} the mouse story's paired tapping after a flavor switch ("Bran steadies the loose board while Pip leads the listening").`),
  spec("avalon", 21, `${ORDINARY} New Avalon's Compact hearing after a flavor switch ("the Compact agrees to hear them"), the plan whose step the player met at turn 22.`),
  spec("kids-mouse", 2, `${ORDINARY} the mouse story's pawprint after a topic switch ("Bran spots that Marmalade followed a kitchen scent").`),
  // Groups
  spec("food-trucks", 2, `${DEFECT} the Tilt Market contest after a flavor switch ("Suri's color-anchor trick", "Jo's deliberate checks", "Jo's carefully demonstrated station setup").`),
  spec("food-trucks", 6, `${DEFECT} Suri's shared meal after a topic switch ("Suri listens to the waiting workers and adapts her shared-meal service"), beside Jo's exploration.`),
  spec("food-trucks", 9, `${DEFECT} the Slowglass contest after a flavor switch ("Suri gathers Slowglass residents' advice and adapts her service", "Jo uses the baker's local knowledge").`),
  spec("food-trucks", 21, `${ORDINARY} Jo's delay rule after a flavor switch ("The crew identifies a clear, workable trigger"), beside Suri's exploration.`),
  spec("space-pirates", 2, `${DEFECT} the three players' manifold repair after a flavor switch ("Bex coordinates the work while Jori confirms the right fittings and Pip pinpoints the heat pattern").`),
  spec("space-pirates", 19, `${DEFECT} the stabilization at Blackglass after a flavor switch ("Bex gets each crew member to name a risk", "Pip lays out a grit-free tool lane").`),
  spec("space-pirates", 6, `${ORDINARY} the galley-table contest after a topic switch ("Neither proposal wins acceptance"; the judge passed it, by hand partly: "Pip's emphasis on guaranteed ordinary shares"), beside Jori's exploration.`),
  spec("estate-agents", 2, `${DEFECT} the empty-years contest after a flavor switch ("Rory's careful separation of documented defects", "Nia's distinction between records and rumor").`),
  spec("estate-agents", 16, `${DEFECT} the two agents' challenges after a flavor switch ("After Rory gives a candid account", "Nia acknowledges the resident's boundaries").`),
  spec("estate-agents", 23, `${DEFECT} the final consultation's contest after a flavor switch ("Rory gives a clear, checkable explanation", "Nia states a bounded, verifiable role").`),
];

const CATEGORY = "challenge-results";

/**
 * The stage's cases from the second round's stored runs, each only where its request is the one the run sent (planner v2f
 * as measured, production's chapter planner before this stage's adoption); and what could not be built. A run played
 * through today's code (the tests' fake runs) sent productionSends.
 */
export function challengeResultsCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = CHALLENGE_RESULTS_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-challenge-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function challengeResultsCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = CHALLENGE_RESULTS_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = challengeResultsCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
