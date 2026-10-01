import type { EvalCase } from "./cases.js";
import { choiceResultCases, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs2Sent } from "./parallelThreadsCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The group-levers stage's cases (2026-10-01, the coordinator's brief after
 * the second playthroughs' review; no calls): group chapter steps of the
 * second round's stored runs (playthroughs-2.json) where a player is in a
 * challenge or contest thread, frozen beside the other cases with
 * --build-group-lever-cases. Each is rebuilt by replaying its stored run from
 * its start (playthroughReplay.ts) and built only where its request is the
 * one production sent there, byte for byte (playthroughs2Sent: production's
 * group turn on a chapter step is unchanged since that run). A chapter
 * opening is the story before its plan with the plan as its fixed analysis;
 * a later step is its input.
 *
 * In those runs 105 player option sets sat on a challenge or contest step, and
 * 1 carried a sacrifice or reward (the pirates' turn 11). The cases: the three
 * group stories, two and three players, chapter openings and later steps, a
 * shared contest (food trucks, estate agents), a shared challenge (the
 * pirates' ship), players' own challenges side by side (food trucks 13 and
 * 15, estate agents 16), one player in a challenge on another's own outcome
 * (estate agents 20), a player exploring beside the others (food trucks 21,
 * pirates 10 and 12), the pirates' pilot whose computed line gives none after
 * the one stored lever (turn 12), and the same pilot told to prefer a reward
 * (turn 16). The estate agents' replay is production's story only up to turn
 * 21 (the owner's roll since 2026-10-01).
 */

const ROLLED = "A group chapter step with players in a challenge or contest thread:";

export const GROUP_LEVERS_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-levers-food-trucks-t2", story: "play-food-trucks", turn: 2, role: "beat", purpose: `${ROLLED} the food trucks' first chapter, both owners in the shared contest for the Grand Circuit contract, its opening.` },
  { id: "round-levers-food-trucks-t10", story: "play-food-trucks", turn: 10, role: "beat", purpose: `${ROLLED} the food trucks' Slowglass trial, the shared contest's step 2 of 3.` },
  { id: "round-levers-food-trucks-t13", story: "play-food-trucks", turn: 13, role: "beat", purpose: `${ROLLED} two own challenges side by side (Suri with the market workers, Jo with his crew), their opening.` },
  { id: "round-levers-food-trucks-t15", story: "play-food-trucks", turn: 15, role: "beat", purpose: `${ROLLED} the same two own challenges at their last step.` },
  { id: "round-levers-food-trucks-t21", story: "play-food-trucks", turn: 21, role: "beat", purpose: `${ROLLED} Jo's own challenge (his crew's rota) beside Suri exploring her culinary principle, the chapter's opening.` },
  { id: "round-levers-estate-agents-t10", story: "play-estate-agents", turn: 10, role: "beat", purpose: `${ROLLED} the estate agents' shared contest for the sale, step 2 of 3.` },
  { id: "round-levers-estate-agents-t16", story: "play-estate-agents", turn: 16, role: "beat", purpose: `${ROLLED} two own challenges side by side (Rory's reputation, Nia's protégé), their opening.` },
  { id: "round-levers-estate-agents-t20", story: "play-estate-agents", turn: 20, role: "beat", purpose: `${ROLLED} both agents in a challenge on Nia's own protégé outcome, its opening.` },
  { id: "round-levers-space-pirates-t2", story: "play-space-pirates", turn: 2, role: "beat", purpose: `${ROLLED} three players in the shared challenge to ready the Wayward Comet, the story's first chapter, its opening.` },
  { id: "round-levers-space-pirates-t10", story: "play-space-pirates", turn: 10, role: "beat", purpose: `${ROLLED} three threads: Bex exploring his own outcome, Jori flying the ship (shared challenge), Pip on the treasure claim (a contest turned into her challenge), their opening.` },
  { id: "round-levers-space-pirates-t12", story: "play-space-pirates", turn: 12, role: "beat", purpose: `${ROLLED} the same threads at step 3 of 4: Jori's computed line gives none (the round's one group lever, Ship Integrity, at turn 11), Pip's one fits, Bex exploring.` },
  { id: "round-levers-space-pirates-t16", story: "play-space-pirates", turn: 16, role: "beat", purpose: `${ROLLED} three players in the shared challenge to repair the ship, step 2, Jori's computed line preferring a reward.` },
];

const CATEGORY = "group-levers";

/** The stage's cases from the second round's stored runs, each only where its request is the one the run sent; and what could not be built. */
export function groupLeversCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = GROUP_LEVERS_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-group-lever-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function groupLeversCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = GROUP_LEVERS_CASE_SPECS
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = groupLeversCases(runs, promptHashOf, specs);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
