import type { EvalCase } from "./cases.js";
import { choiceResultCases, productionSends, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import type { PlayRun } from "./playthroughs.js";
import { groupOptionsBase } from "../../game/services/storyTextRounds/groupOptions.js";

/*
 * The group-options stage's cases (decision A, the evening of 2026-10-01; no
 * calls): group chapter steps of the third round's stored runs
 * (playthroughs-3.json) where a player is in a challenge or contest thread,
 * frozen beside the other cases with --build-group-options-cases. Each is
 * rebuilt by replaying its stored run from its start (playthroughReplay.ts)
 * and built only where its request is the one production sent there, byte for
 * byte (playthroughs3Sent: production's turn as it stood before the stage's
 * adoption, unchanged since that run until then). A
 * chapter opening is the story before its plan with the plan as its fixed
 * analysis; a later step is its input.
 *
 * Chosen where the round's earlier sacrifices and rewards make the owner's
 * rules (one reward a chapter, on its first step; a second sacrifice only for
 * a strong reason) read differently from B6's rate line, which production's
 * group players get: every rolled player in them was offered a sacrifice
 * before. Per sample 24 rolled sets: 8 reward turns (5 where B6's rate gives
 * none: a lever in the player's last two rolled turns), 12 where a sacrifice
 * fits and no reward (B6's rate invites either kind on all 12, a reward
 * preferred on 5: the round's rewards off a chapter's first step and in
 * consecutive chapters), the round's one second-sacrifice state (the estate
 * agents' Tamsin at turn 25, the last step of a four-step chapter whose first
 * offered her a sacrifice), two none and one player whose roll the step
 * discards (the space pirates' Oren at turn 19, on Davi's debt). Two and
 * three players, chapter openings and later steps, contests and challenges,
 * shared and own outcomes, a player exploring beside the others.
 */

const ROLLED = "A group chapter step of the third playthroughs with players in a challenge or contest thread, earlier sacrifices and rewards behind them:";

export const GROUP_OPTIONS_CASE_SPECS: ChoiceCaseSpec[] = [
  {
    id: "round-options-food-trucks-t12",
    story: "play-food-trucks",
    turn: 12,
    role: "beat",
    purpose: `${ROLLED} the food trucks' four-step chapter opening after the first chapter's sacrifices (Amara on the showcase, Omar on his crew's trust): each player's reward turn, B6's rate preferring a reward.`,
  },
  {
    id: "round-options-food-trucks-t15",
    story: "play-food-trucks",
    turn: 15,
    role: "beat",
    purpose: `${ROLLED} the same chapter's last step after both players' rewards at its first: a sacrifice fits and no reward (B6's rate allows either, preferring a sacrifice).`,
  },
  {
    id: "round-options-food-trucks-t19",
    story: "play-food-trucks",
    turn: 19,
    role: "beat",
    purpose: `${ROLLED} Omar's route check, step 3 of 4, the chapter after his reward (Amara exploring beside him): a sacrifice fits and no reward, where B6's rate prefers a reward (round 3 gave him one, a reward in consecutive chapters).`,
  },
  {
    id: "round-options-food-trucks-t22",
    story: "play-food-trucks",
    turn: 22,
    role: "beat",
    purpose: `${ROLLED} the contract's last contest, its opening: Amara's reward turn where B6's rate gives none; Omar, whose previous chapter offered a reward, none.`,
  },
  {
    id: "round-options-food-trucks-t24",
    story: "play-food-trucks",
    turn: 24,
    role: "beat",
    purpose: `${ROLLED} the same contest, step 3 of 4: Amara a sacrifice and no reward where B6's rate prefers a reward (round 3 gave her one); Omar none after his sacrifice at step 2.`,
  },
  {
    id: "round-options-space-pirates-t6",
    story: "play-space-pirates",
    turn: 6,
    role: "beat",
    purpose: `${ROLLED} three players after the first chapter's sacrifices, the chapter's opening (Tomas exploring): Davi's and Oren's reward turn where B6's rate gives none.`,
  },
  {
    id: "round-options-space-pirates-t7",
    story: "play-space-pirates",
    turn: 7,
    role: "beat",
    purpose: `${ROLLED} the same chapter's step 2 of 4: Davi and Oren a sacrifice and no reward where B6's rate prefers a reward (round 3 gave both one).`,
  },
  {
    id: "round-options-space-pirates-t11",
    story: "play-space-pirates",
    turn: 11,
    role: "beat",
    purpose: `${ROLLED} the seal's contest opening, all three: Tomas's reward turn where B6's rate gives none; Davi and Oren, whose previous chapter offered a reward, a sacrifice and no reward.`,
  },
  {
    id: "round-options-space-pirates-t19",
    story: "play-space-pirates",
    turn: 19,
    role: "beat",
    purpose: `${ROLLED} a chapter opening on Davi's own debt with Oren in it (Oren's roll discarded) beside Tomas's own challenge: Tomas's reward turn where B6's rate gives none; Davi a sacrifice and no reward; Oren none.`,
  },
  {
    id: "round-options-estate-agents-t18",
    story: "play-estate-agents",
    turn: 18,
    role: "beat",
    purpose: `${ROLLED} Tamsin's challenge, step 2 of 4 (Rory exploring): a sacrifice and no reward where B6's rate prefers a reward (round 3 gave her one).`,
  },
  {
    id: "round-options-estate-agents-t22",
    story: "play-estate-agents",
    turn: 22,
    role: "beat",
    purpose: `${ROLLED} the commission's last contest, its opening: Rory's reward turn; Tamsin, whose previous chapter offered a reward, a sacrifice and no reward.`,
  },
  {
    id: "round-options-estate-agents-t25",
    story: "play-estate-agents",
    turn: 25,
    role: "beat",
    purpose: `${ROLLED} the same contest's last step: Rory a sacrifice and no reward after his reward at its first; Tamsin, offered a sacrifice at its first, a second only for a strong reason (B6's rate prefers a reward; round 3 gave her one).`,
  },
];

const CATEGORY = "group-options";

/**
 * What production sent in the third round of playthroughs: today's request (the fixes since changed repairs and
 * checks, not the turn's request), but for a group's rolled step, whose group-options lines production prints since
 * the stage's adoption (2026-10-01, evening): the variant's base, production with them taken out (groupOptionsBase).
 */
export const playthroughs3Sent: SentRequestText = (input) => (input.role === "beat" ? groupOptionsBase(input.story).prompt : productionSends(input));

/** The stage's cases from the third round's stored runs, each only where its request is the one the run sent; and what could not be built. */
export function groupOptionsCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = GROUP_OPTIONS_CASE_SPECS,
  sent: SentRequestText = playthroughs3Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-group-options-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function groupOptionsCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = GROUP_OPTIONS_CASE_SPECS,
  sent: SentRequestText = playthroughs3Sent
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = groupOptionsCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
