import type { EvalCase } from "./cases.js";
import { choiceResultCases, productionSends, type ChoiceCaseSpec, type PromptHashOf } from "./choiceResultCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The outcome-settled stage's cases (2026-09-30, the second playthroughs'
 * review; no calls): turns of the second round's stored runs
 * (playthroughs-2.json) that settle outcomes, frozen beside the other cases
 * with --build-settled-cases. Each is rebuilt by replaying its stored run from
 * its start (playthroughReplay.ts) and built only where its request is the one
 * production sent there, byte for byte: production's turn is unchanged since
 * that run (the review's fix, leverChargedAgain, changed a repair, not a
 * request), so what it sends today is what it sent (productionSends). A switch
 * turn is its input with the switch plan as its fixed analysis, as the frozen
 * switch turns read; an ending is its input.
 *
 * Where the defect happened:
 * - the space pirates' switch turn 14, whose milestones complete the treasure
 *   claim and the ship: the texts told the claim as open and unsettled, and a
 *   fact the turn stored said the record "does not settle" it;
 * - New Avalon's switch turn 16, completing Jun and Orin's outcome with its
 *   parting milestone while setting their relationship to "Deeply Trusted";
 * - the space pirates' ending, where all three players' endings told the
 *   complete claim as unsettled, following the stored facts;
 * - the estate agents' ending, which told Rory's complete principle outcome as a
 *   later caution;
 * - New Avalon's ending, which read the stat as renewed trust.
 * Beside them ordinary ones, every player count: switch turns completing an
 * outcome whose texts told it as settled (the estate agents' turn 15, the sale
 * and Rory's principle; food trucks turn 20, the contract; lemonade turn 4;
 * the mouse story's turn 5, read with a child; New Avalon's turn 23, the
 * Heart), and the lemonade and food trucks endings.
 */

const TOLD_OPEN = "A switch turn whose milestones complete an outcome, whose text and a fact it stored told the outcome as still open:";
const STAT_AGAINST = "A switch turn whose milestone completes an outcome, which set a stat against that milestone:";
const SETTLED = "A switch turn whose milestones complete an outcome, told as settled:";
const ENDING_OPEN = "An ending that told a complete outcome as open or as another result:";
const ENDING = "An ending with complete outcomes, told as their milestones leave them:";

export const OUTCOME_SETTLED_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-settled-space-pirates-t14", story: "play-space-pirates", turn: 14, role: "beat", purpose: `${TOLD_OPEN} the space pirates' treasure claim (2 of 2: the captain's camp secures the claim), told "open and unsettled", with the fact "does not settle Pip's repair-reserve proposal"; the ship complete too.` },
  { id: "round-settled-avalon-t16", story: "play-avalon", turn: 16, role: "beat", purpose: `${STAT_AGAINST} New Avalon's Jun and Orin part on good terms (2 of 2, the third resolution), and their relationship was set to Deeply Trusted.` },
  { id: "round-settled-estate-agents-t15", story: "play-estate-agents", turn: 15, role: "beat", purpose: `${SETTLED} the estate agents' sale (3 of 3, Mara chooses neither agent) and Rory's principle (1 of 1).` },
  { id: "round-settled-food-trucks-t20", story: "play-food-trucks", turn: 20, role: "beat", purpose: `${SETTLED} the food trucks' contract (3 of 3, Jo wins), with its scoreboard move.` },
  { id: "round-settled-lemonade-t4", story: "play-lemonade", turn: 4, role: "beat", purpose: `${SETTLED} the lemonade stand's finances (1 of 1).` },
  { id: "round-settled-kids-mouse-t5", story: "play-kids-mouse", turn: 5, role: "beat", purpose: `${SETTLED} the mouse story's burrow safety (1 of 1), read with a five-year-old.` },
  { id: "round-settled-avalon-t23", story: "play-avalon", turn: 23, role: "beat", purpose: `${SETTLED} New Avalon's Heart (3 of 3), a limited, monitored bypass the districts approve.` },
  { id: "round-settled-space-pirates-t26", story: "play-space-pirates", turn: 26, role: "beat", purpose: `${ENDING_OPEN} the space pirates' ending, three players, the complete claim told as unsettled after the stored facts.` },
  { id: "round-settled-estate-agents-t26", story: "play-estate-agents", turn: 26, role: "beat", purpose: `${ENDING_OPEN} the estate agents' ending, Rory's complete principle told as a later caution.` },
  { id: "round-settled-avalon-t26", story: "play-avalon", turn: 26, role: "beat", purpose: `${ENDING_OPEN} New Avalon's ending, the parting read as renewed trust from the stat.` },
  { id: "round-settled-lemonade-t11", story: "play-lemonade", turn: 11, role: "beat", purpose: `${ENDING} the lemonade stand's ending, every outcome complete.` },
  { id: "round-settled-food-trucks-t26", story: "play-food-trucks", turn: 26, role: "beat", purpose: `${ENDING} the food trucks' ending, two players, every outcome complete.` },
];

const CATEGORY = "outcome-settled";

/** The stage's cases from the second round's stored runs, each only where its request is the one the run sent; and what could not be built. */
export function outcomeSettledCases(runs: PlayRun[], promptHashOf: PromptHashOf, specs: ChoiceCaseSpec[] = OUTCOME_SETTLED_CASE_SPECS): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, productionSends, CATEGORY);
}

/** What --build-settled-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function outcomeSettledCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = OUTCOME_SETTLED_CASE_SPECS
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = outcomeSettledCases(runs, promptHashOf, specs);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
