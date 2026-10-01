import type { EvalCase } from "./cases.js";
import { choiceResultCases, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs2Sent } from "./parallelThreadsCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The short-replies stage's cases (2026-10-01, the coordinator's brief after
 * the second playthroughs: 13 of 126 first replies one short paragraph, 2 of
 * them short again after production's retry; no calls): the round's short
 * turns no earlier stage had frozen, frozen beside the other cases with
 * --build-short-reply-cases. Each is rebuilt by replaying its stored run from
 * its start (playthroughReplay.ts) and built only where its request is the one
 * production sent there, byte for byte (playthroughs2Sent). A turn that follows
 * a planner (a first turn, a chapter opening, a switch turn) is the story
 * before its plan with the plan as its fixed analysis; a later step is its
 * input. The round's other short turns are frozen already (the mouse story's
 * turns 3 and 5, the food trucks' 21 and 26, the space pirates' 16, the estate
 * agents' 15); its estate agents' turn 22 follows the owner's roll at 21, so the
 * replay no longer reaches the state that run saw.
 */

const SHORT = "A turn whose first reply in the second playthroughs was one short paragraph";

export const SHORT_REPLIES_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-short-avalon-t2", story: "play-avalon", turn: 2, role: "beat", purpose: `${SHORT}: New Avalon's first chapter opening (the Heartwell's old controls); the reply told the descent and the arrival only.` },
  { id: "round-short-avalon-t8", story: "play-avalon", turn: 8, role: "beat", purpose: `${SHORT}: New Avalon's switch turn after the market chapter; the reply told the promise to the stewards only.` },
  { id: "round-short-avalon-t12", story: "play-avalon", turn: 12, role: "beat", purpose: `${SHORT}: New Avalon's switch turn after the archive chapter; the reply told the shard laid beside the register only.` },
  { id: "round-short-avalon-t14", story: "play-avalon", turn: 14, role: "beat", purpose: `${SHORT}: New Avalon's exploration step 2 of 3 (the old names); the reply told Orin's account only.` },
  { id: "round-short-avalon-t24", story: "play-avalon", turn: 24, role: "beat", purpose: `${SHORT}: New Avalon's last chapter opening (the open record); the reply told the authorization laid on the table only.` },
  {
    id: "round-short-food-trucks-t1",
    story: "play-food-trucks",
    turn: 1,
    role: "beat",
    purpose: `${SHORT} for both players, and again after production's retry, the one used: the food trucks' first turn, the first thing either player reads.`,
  },
];

const CATEGORY = "short-replies";

/** The stage's cases from the second round's stored runs, each only where its request is the one the run sent; and what could not be built. */
export function shortRepliesCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = SHORT_REPLIES_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-short-reply-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function shortRepliesCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = SHORT_REPLIES_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = shortRepliesCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
