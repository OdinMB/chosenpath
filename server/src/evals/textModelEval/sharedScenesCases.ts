import type { EvalCase } from "./cases.js";
import { choiceResultCases, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs3Sent } from "./groupOptionsCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The scenes stage's cases (decision A's retest of the parallel-thread lines,
 * the evening of 2026-10-01; no calls): group chapter openings and chapter
 * steps of the third round's stored runs (playthroughs-3.json), frozen beside
 * the other cases with --build-scenes-cases. Each is rebuilt by replaying its
 * stored run from its start (playthroughReplay.ts) and built only where its
 * request is the one production sent there, byte for byte (playthroughs3Sent:
 * production's request, but for a group's rolled step the group turn before
 * the group-options adoption, and without the insertions this stage led
 * production to adopt). A chapter opening is the chapter planner's input
 * and runs as a chain (the planner, then the group turn on its checked plan);
 * a chapter step is the turn's input on the plan the round stored.
 *
 * Where round 3 put a person in two places, read by hand on the story pages:
 * - the estate agents' turn 6, Tamsin's pick "Meet Rory away from Gloam House"
 *   planned with Rory in every step, Rory at the Amber Cup in her text while
 *   his own restaged the conservatory;
 * - the estate agents' turn 17, the buyer at the nursery door in Rory's text
 *   and at Noor's table in Tamsin's (both threads' steps name the buyer);
 * - the food trucks' turn 12, the scarce-slot contest (Amara's pick alone)
 *   planned with Omar in its steps and made her challenge, Omar's station and
 *   crew across the lane in her text while his own loaded the truck with Jo;
 * - the space pirates' turn 6, Oren's pick "Join Tomas and Davi at the chart
 *   table", Davi there in Oren's text and at the engine panel in his own;
 * and later steps on those plans: the estate agents' turn 10 (Tamsin at the
 * café in Rory's text, with the buyer and Mara in her own) and 18 (the buyer
 * in both threads), the food trucks' turn 14 (Omar's station at the showcase
 * and Omar in the yard), the space pirates' turn 9 (the chapter's last step,
 * Davi's thread bringing the ship to the cache while the chart table's
 * threads have it still a display entry). One ordinary of each, where every
 * text kept its people apart: the food trucks' turn 9 (Amara in the
 * community kitchen, Omar with his crew over the route) and the space
 * pirates' turn 16 (Tomas on the bridge, Davi at the engineering bench with
 * the creditor on the console, Oren with the guild contact in Glasswake).
 */

const SPLIT_PLAN = "A group chapter opening of the third playthroughs where the picks split the players and a person came to be in two places:";
const SPLIT_STEP = "A group chapter step of the third playthroughs on a plan whose threads held a person in two places:";
const ORDINARY = "A group chapter with parallel threads where every text kept its people apart:";

export const SCENES_CASE_SPECS: ChoiceCaseSpec[] = [
  {
    id: "round-scenes-plan-estate-agents-t6",
    story: "play-estate-agents",
    turn: 6,
    role: "thread",
    purpose: `${SPLIT_PLAN} Tamsin's pick "Meet Rory away from Gloam House" (the shared friendship) beside Rory's conservatory staging; round 3 planned Rory into every step of her thread and put him at the Amber Cup in her text.`,
  },
  {
    id: "round-scenes-plan-estate-agents-t17",
    story: "play-estate-agents",
    turn: 17,
    role: "thread",
    purpose: `${SPLIT_PLAN} Rory's nursery passage beside Tamsin's survey aftermath; round 3 named the buyer in both threads' steps and put the buyer at the nursery door and at Noor's table.`,
  },
  {
    id: "round-scenes-plan-food-trucks-t12",
    story: "play-food-trucks",
    turn: 12,
    role: "thread",
    purpose: `${SPLIT_PLAN} the scarce-slot contest, Amara's pick alone, beside Omar's rig test; round 3 planned both trucks into the showcase (made Amara's challenge) and put Omar's station and crew across the lane.`,
  },
  {
    id: "round-scenes-plan-space-pirates-t6",
    story: "play-space-pirates",
    turn: 6,
    role: "thread",
    purpose: `${SPLIT_PLAN} Oren's pick "Join Tomas and Davi at the chart table" beside Tomas's quota and Davi's engine; round 3 put Davi at the chart table in Oren's text and at the engine panel in his own.`,
  },
  { id: "round-scenes-plan-food-trucks-t9", story: "play-food-trucks", turn: 9, role: "thread", purpose: `${ORDINARY} Amara's recipe in the community kitchen beside Omar's route review with his crew.` },
  { id: "round-scenes-estate-agents-t10", story: "play-estate-agents", turn: 10, role: "beat", purpose: `${SPLIT_STEP} Rory's Amber Cup thread with Tamsin in its steps beside Tamsin's account for the buyer, step 2 of 3.` },
  { id: "round-scenes-estate-agents-t18", story: "play-estate-agents", turn: 18, role: "beat", purpose: `${SPLIT_STEP} the buyer in Rory's nursery passage and in Tamsin's survey, step 2 of 4.` },
  { id: "round-scenes-food-trucks-t14", story: "play-food-trucks", turn: 14, role: "beat", purpose: `${SPLIT_STEP} Amara's showcase with Omar in its steps beside Omar's rig in the yard, step 3 of 4.` },
  { id: "round-scenes-space-pirates-t9", story: "play-space-pirates", turn: 9, role: "beat", purpose: `${SPLIT_STEP} Davi's thread bringing the Comet to the cache beside the chart table's quota and seal threads, the last step of 4.` },
  { id: "round-scenes-space-pirates-t16", story: "play-space-pirates", turn: 16, role: "beat", purpose: `${ORDINARY} Tomas on the bridge, Davi at the engineering bench, Oren with the guild contact in Glasswake, step 2 of 3.` },
];

const CATEGORY = "scenes";

/** The stage's cases from the third round's stored runs, each only where its request is the one the run sent; and what could not be built. */
export function sharedScenesCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = SCENES_CASE_SPECS,
  sent: SentRequestText = playthroughs3Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-scenes-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function sharedScenesCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = SCENES_CASE_SPECS,
  sent: SentRequestText = playthroughs3Sent
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = sharedScenesCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
