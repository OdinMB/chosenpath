import type { EvalCase } from "./cases.js";
import { choiceResultCases, playthroughsSent, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs3Sent } from "./groupOptionsCases.js";
import { playthroughs2Sent } from "./parallelThreadsCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The contest-settled stage's cases (decision A's seal fix, the evening of
 * 2026-10-01; no calls): the chapter planner's input wherever a stored
 * playthrough of rounds 1-3 planned a contested outcome's last stage (one
 * milestone still needed), frozen beside the other cases with
 * --build-contest-settled-cases. Each is rebuilt by replaying its stored run
 * from its start (playthroughReplay.ts) and built only where its request is
 * the one production sent there, byte for byte (each round's production as it
 * stood then: playthroughsSent, playthroughs2Sent, playthroughs3Sent).
 *
 * Every such plan of the three rounds (a temporary probe over the stored runs,
 * deleted; read by hand):
 * - put off: round 3's space pirates' seal (turn 11, every player, after a
 *   flavor switch whose question said "without assigning custody"; all three
 *   milestones about who may shape the next custody discussion) and round 3's
 *   food trucks' contract (turn 17, Omar's pick alone: a brace check whose
 *   stage "informs the final contract decision");
 * - settled: round 1's food trucks' license (turn 6) and space pirates'
 *   commission (turn 10), round 2's food trucks' contract (turn 17), space
 *   pirates' cache claim (turn 10, Pip's pick alone) and estate agents' sale
 *   (turn 13, Nia's pick alone), round 3's estate agents' commission (turn 22).
 * Two and three players, both sides together and one side alone.
 */

export type ContestCaseSpec = ChoiceCaseSpec & { round: 1 | 2 | 3; /** The contested outcome the plan decides */ outcomeId?: string };

const PUT_OFF = "A contest's last stage that the stored plan put off:";
const SETTLED = "A contest's last stage that the stored plan settled:";

export const CONTEST_SETTLED_CASE_SPECS: ContestCaseSpec[] = [
  {
    id: "round-contest-r3-space-pirates-t11",
    round: 3,
    story: "play-space-pirates",
    turn: 11,
    role: "thread",
    outcomeId: "shared_division_seal",
    purpose: `${PUT_OFF} the command seal, all three players after a grouped flavor switch whose question said "without assigning custody or binding the crew"; round 3 renamed the stage and wrote three milestones about who may shape the next custody discussion, and two endings told the seal as unassigned.`,
  },
  {
    id: "round-contest-r3-food-trucks-t17",
    round: 3,
    story: "play-food-trucks",
    turn: 17,
    role: "thread",
    outcomeId: "shared_festival_contract",
    purpose: `${PUT_OFF} the Festival Circuit contract, Omar's pick alone (Amara on her principle); round 3 wrote a brace check whose stage "informs the final contract decision", and the aftermath chapter named the winner.`,
  },
  {
    id: "round-contest-r3-estate-agents-t22",
    round: 3,
    story: "play-estate-agents",
    turn: 22,
    role: "thread",
    outcomeId: "shared_gloam_commission",
    purpose: `${SETTLED} the Gloam House commission, both agents after a grouped flavor switch.`,
  },
  {
    id: "round-contest-r2-food-trucks-t17",
    round: 2,
    story: "play-food-trucks",
    turn: 17,
    role: "thread",
    outcomeId: "shared_grand_circuit_contract",
    purpose: `${SETTLED} the Grand Circuit contract, its third stage, both owners at the Slipharbor tasting.`,
  },
  {
    id: "round-contest-r2-space-pirates-t10",
    round: 2,
    story: "play-space-pirates",
    turn: 10,
    role: "thread",
    outcomeId: "shared_cache_claim",
    purpose: `${SETTLED} the captain's claim to the Gloam Cache, Pip's pick alone, made her challenge.`,
  },
  {
    id: "round-contest-r2-estate-agents-t13",
    round: 2,
    story: "play-estate-agents",
    turn: 13,
    role: "thread",
    outcomeId: "shared_vesper_sale",
    purpose: `${SETTLED} Mara's signed offer for Vesper House, its third stage, Nia's pick alone, made her challenge.`,
  },
  {
    id: "round-contest-r1-food-trucks-t6",
    round: 1,
    story: "play-food-trucks",
    turn: 6,
    role: "thread",
    outcomeId: "shared_license_winner",
    purpose: `${SETTLED} the All-District Vending License, both contenders at the Hush Basin tasting.`,
  },
  {
    id: "round-contest-r1-space-pirates-t10",
    round: 1,
    story: "play-space-pirates",
    turn: 10,
    role: "thread",
    outcomeId: "shared_black_star_commission",
    purpose: `${SETTLED} the Black Star Commission, three players in two camps before Clerk Vey.`,
  },
];

const CATEGORY = "contest-settled";

/** What each round's production sent: the first playthroughs' (planner v2e), the second's (planner v2f), the third's. */
export const SENT_BY_ROUND: Record<1 | 2 | 3, SentRequestText> = { 1: playthroughsSent, 2: playthroughs2Sent, 3: playthroughs3Sent };

export type RunsByRound = Record<1 | 2 | 3, PlayRun[]>;

/** The stage's cases from the stored runs of each spec's round, each only where its request is the one the run sent; and what could not be built. */
export function contestSettledCases(
  runs: RunsByRound,
  promptHashOf: PromptHashOf,
  specs: ContestCaseSpec[] = CONTEST_SETTLED_CASE_SPECS,
  sent: Record<1 | 2 | 3, SentRequestText> = SENT_BY_ROUND
): { cases: EvalCase[]; problems: string[] } {
  const built = new Map<string, EvalCase>();
  const problems: string[] = [];
  for (const round of [1, 2, 3] as const) {
    const own = specs.filter((s) => s.round === round);
    if (own.length === 0) continue;
    const found = choiceResultCases(runs[round], promptHashOf, own, sent[round], CATEGORY);
    for (const c of found.cases) built.set(c.id, c);
    problems.push(...found.problems.map((p) => `round ${round}: ${p}`));
  }
  return { cases: specs.flatMap((s) => (built.has(s.id) ? [built.get(s.id) as EvalCase] : [])), problems };
}

/** What --build-contest-settled-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function contestSettledCasesToFreeze(
  frozen: EvalCase[],
  runs: RunsByRound,
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ContestCaseSpec[] = CONTEST_SETTLED_CASE_SPECS,
  sent: Record<1 | 2 | 3, SentRequestText> = SENT_BY_ROUND
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = contestSettledCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
