import type { EvalCase } from "./cases.js";
import { choiceResultCases, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs2Sent } from "./parallelThreadsCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The recorded-result stage's cases (2026-09-30, fix 2 of the second
 * playthroughs' review; no calls): turns of the second round's stored runs
 * (playthroughs-2.json) that narrate an exploration step's recorded result
 * where the player changed direction from the step before, frozen beside the
 * other cases with --build-recorded-cases. Each is rebuilt by replaying its
 * stored run from its start (playthroughReplay.ts) and built only where its
 * request is the one production sent there, byte for byte: production's turn
 * is unchanged since that run, so what it sends today is what it sent, but
 * for the kids rules a single player's read-with-kids turn takes since
 * 2026-10-01, which the mouse story's turns did not carry (playthroughs2Sent).
 * A switch turn is its input with the switch plan as its
 * fixed analysis; a chapter step is its input.
 *
 * Where the defect happened: food trucks turn 23, the switch turn after Suri's
 * exploration chapter (turn 21 she chose to wait for verification, result 1;
 * turn 22 to use the cabinet within disclosed safeguards, result 2, which the
 * game recorded): the text told result 1 ("No ingredients stored here until
 * the operating temperature is independently verified") and the milestone
 * blended the two. Beside it ordinary ones, every player count, each a change
 * of direction the stored turn told as recorded: the space pirates' switch
 * turn 14 (Bex, after answering the relay alone, asks Tamsin to carry a
 * command burden) and chapter step 25 (all three players change direction:
 * Bex steps back, Jori asks for promises, Pip drafts a direct account); the
 * estate agents' switch turn 15 (Rory, after keeping the evidence distinct,
 * uses the ledger's note as a sales hook); lemonade step 7 (Theo, after
 * keeping the cash, budgets for a busy fair); New Avalon step 11 (Jun, after
 * asking only for records, shares a personal memory) and switch turn 16 (after
 * sharing only work thoughts, Jun tells Orin why their paths diverged); the
 * mouse story's switch turn 8 (Bran, after leaving Pip waiting, meets Pip as
 * promised), read with a five-year-old.
 */

const TOLD_OTHER = "A turn after an exploration step where the player changed direction, whose text told the earlier direction and whose milestone blended the two:";
const CHANGED = "A turn after an exploration step where the player changed direction, told as recorded:";

export const RECORDED_RESULT_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-recorded-food-trucks-t23", story: "play-food-trucks", turn: 23, role: "beat", purpose: `${TOLD_OTHER} Suri waited for verification (result 1), then chose to use the cabinet within disclosed safeguards (result 2); the switch turn wrote "No ingredients stored here until the operating temperature is independently verified".` },
  { id: "round-recorded-space-pirates-t14", story: "play-space-pirates", turn: 14, role: "beat", purpose: `${CHANGED} three players; Bex answered the relay alone (result 3), then asked Tamsin to carry a defined command burden (result 1).` },
  { id: "round-recorded-space-pirates-t25", story: "play-space-pirates", turn: 25, role: "beat", purpose: `${CHANGED} three players, each in an exploration thread of their own and each changing direction (Bex steps back, Jori asks for promises, Pip drafts a direct account).` },
  { id: "round-recorded-estate-agents-t15", story: "play-estate-agents", turn: 15, role: "beat", purpose: `${CHANGED} two players; Rory kept the evidence distinct (result 2), then used the ledger's note as a sales hook (result 3).` },
  { id: "round-recorded-lemonade-t7", story: "play-lemonade", turn: 7, role: "beat", purpose: `${CHANGED} Theo kept the cash available (result 3), then budgeted the fee and a larger menu for a busy fair (result 1), a chapter step.` },
  { id: "round-recorded-avalon-t11", story: "play-avalon", turn: 11, role: "beat", purpose: `${CHANGED} Jun asked Orin only for public records (result 3), then shared a personal memory (result 1), a chapter step.` },
  { id: "round-recorded-avalon-t16", story: "play-avalon", turn: 16, role: "beat", purpose: `${CHANGED} Jun shared only the thoughts the work needed (result 2), then told Orin honestly why their paths diverged (result 3), a switch turn.` },
  { id: "round-recorded-kids-mouse-t8", story: "play-kids-mouse", turn: 8, role: "beat", purpose: `${CHANGED} Bran left Pip waiting for the watch (result 3), then met Pip as promised (result 1), a switch turn read with a five-year-old.` },
];

const CATEGORY = "recorded-result";

/**
 * The stage's cases from the second round's stored runs, each only where its request is the one the run sent; and what
 * could not be built. Since the kids-turns stage's adoption (2026-10-01) the mouse story's turn takes the kids rules, which
 * that round's turns did not carry, so the request the run sent is playthroughs2Sent's.
 */
export function recordedResultCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = RECORDED_RESULT_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-recorded-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function recordedResultCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = RECORDED_RESULT_CASE_SPECS
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = recordedResultCases(runs, promptHashOf, specs);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
