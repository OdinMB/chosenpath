import { CONTEST_LAST_STAGE_LINE } from "../../game/services/prompts/SwitchPromptService.js";
import type { EvalCase } from "./cases.js";
import { choiceResultCases, productionSends, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import type { PlayRun } from "./playthroughs.js";
import { requestFor, requestText } from "./variants.js";
import { choiceResultRequest } from "../../game/services/storyTextRounds/choiceResult.js";

/*
 * The parallel-threads stage's cases (2026-10-01, fix 4 of the second
 * playthroughs' review; no calls): switch plans and chapter plans of the
 * second round's stored runs (playthroughs-2.json), frozen beside the other
 * cases with --build-parallel-cases. Each is rebuilt by replaying its stored
 * run from its start (playthroughReplay.ts) and built only where its request
 * is the one production sent there, byte for byte: production's planners are
 * unchanged since that run but for the switch planner's last-stage line that
 * this stage led production to adopt (playthroughs2Sent). A switch case is the switch
 * planner's input, a chapter case the chapter planner's; the chapter cases run
 * as chains, each side's planner into its own group turn.
 *
 * The switches before a contest's last stage, where production offered the
 * contested outcome as one direction among others:
 * - the space pirates' switch at turn 9 (the treasure claim at 1 of 2): the
 *   scout took it alone, and the claim was settled for the captain's camp in
 *   her thread while the captain stood on the docks;
 * - the estate agents' switch at turn 12 (the sale at 2 of 3): Nia took it
 *   alone ("Join Rory at a neighborhood open house"), Rory the archive;
 * - the food trucks' switch at turn 16 (the contract at 2 of 3): offered the
 *   same way, and both owners happened to take it.
 * The chapter openings with parallel threads:
 * - the space pirates' turn 10: three threads in three places (the captain at
 *   Needlepoint's docks, the pilot flying the ship through the pylons, the
 *   scout at the galley table before the ship leaves Needlepoint), and the
 *   treasure claim's contest turned into the scout's challenge with "Pip and
 *   the captain's camp" in its steps;
 * - the estate agents' turn 13: the sale's last stage for Nia alone at the
 *   open house, its unfavorable result "Mara signs an offer through Rory", and
 *   Rory in the archive; at turn 14 the buyer was in both places;
 * - the food trucks' turn 13, an ordinary one: Suri at the Tilt Market's
 *   shared table, Jo with his crew beside the truck.
 */

const LAST_STAGE = "A switch before a contested outcome's last stage, which production offered as one direction among others:";
const SPLIT = "A chapter opening with parallel threads where the players' places came apart:";
const ORDINARY = "A chapter opening with parallel threads, each player in a place of their own, told consistently:";

export const PARALLEL_THREADS_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-parallel-switch-space-pirates-t9", story: "play-space-pirates", turn: 9, role: "switch", purpose: `${LAST_STAGE} the treasure claim at 1 of 2, which the scout then took alone.` },
  { id: "round-parallel-switch-estate-agents-t12", story: "play-estate-agents", turn: 12, role: "switch", purpose: `${LAST_STAGE} the sale at 2 of 3, which Nia then took alone.` },
  { id: "round-parallel-switch-food-trucks-t16", story: "play-food-trucks", turn: 16, role: "switch", purpose: `${LAST_STAGE} the contract at 2 of 3, which both owners happened to take.` },
  {
    id: "round-parallel-space-pirates-t10",
    story: "play-space-pirates",
    turn: 10,
    role: "thread",
    purpose: `${SPLIT} three threads, the captain at Needlepoint's docks, the pilot flying the ship through the pylons, the scout at the galley table; the treasure claim's contest, the scout's alone, turned into her challenge with the captain's camp in its steps and results.`,
  },
  {
    id: "round-parallel-estate-agents-t13",
    story: "play-estate-agents",
    turn: 13,
    role: "thread",
    purpose: `${SPLIT} the sale's last stage for Nia alone at the open house (its unfavorable result Rory's), Rory in the archive; at turn 14 the buyer was in both places.`,
  },
  { id: "round-parallel-food-trucks-t13", story: "play-food-trucks", turn: 13, role: "thread", purpose: `${ORDINARY} Suri at the Tilt Market's shared table, Jo with his crew beside the truck.` },
];

const CATEGORY = "parallel-threads";

/**
 * What production sent in the second round of playthroughs: today's request,
 * but for the switch planner's last-stage line, which the stage's run led
 * production to adopt (2026-10-01) and which no switch of that round carried;
 * for the chapter planner, planner v2f as measured (production byte for
 * byte until the challenge-results stage's adoption of 2026-10-01, whose edits
 * no chapter plan of that round carried); and for a turn, production's turn
 * as measured before the kids-turns stage's adoption of 2026-10-01
 * (choiceResultRequest, which production equalled byte for byte on every
 * story; the round's mouse story recorded its read-with-kids category, so its
 * turns now take the kids rules, which none of that round carried).
 */
export const playthroughs2Sent: SentRequestText = (input) => {
  if (input.role === "thread") return requestText(requestFor("planV2f", input));
  if (input.role === "beat") return choiceResultRequest(input.story).prompt;
  const sent = productionSends(input);
  return input.role === "switch" ? sent.split(CONTEST_LAST_STAGE_LINE).join("") : sent;
};

/**
 * The stage's cases from the second round's stored runs, each only where its request is the one the run sent; and what
 * could not be built. A run played through today's code (the tests' fake runs) sent productionSends.
 */
export function parallelThreadsCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = PARALLEL_THREADS_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-parallel-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function parallelThreadsCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = PARALLEL_THREADS_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = parallelThreadsCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
