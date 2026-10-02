import type { EvalCase } from "./cases.js";
import { choiceResultCases, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { playthroughs2Sent } from "./parallelThreadsCases.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The money-adds-up stage's cases (2026-10-01, fix 7 of the second
 * playthroughs' review; no calls): turns of the second round's lemonade story
 * (budget allocation and profit margins for middle-school students; a counted
 * Stand Cashbox of 10 coins and a Profit Margin of 25%), frozen beside the
 * other cases with --build-money-cases. Each is rebuilt by replaying the
 * stored run from its start (playthroughReplay.ts) and built only where its
 * request is the one production sent there, byte for byte (playthroughs2Sent:
 * production's turn as it stood then, which it still is on this story). A
 * switch turn or chapter opening is its input with its plan as its fixed
 * analysis; a chapter step or the ending is its input.
 *
 * Each is then recorded as the game records a story from the setup form's
 * learn-something category (StoryCreationService keeps the form's category),
 * which the eval's run did not record (storyFromSetup records only a
 * read-with-kids category); production's turn read no learning category then,
 * so the request is still the one the run sent (the check reads the replayed
 * story, before the category is recorded; since the money-2 adoption of
 * 2026-10-02 production prints the money lines on a learning story's turn that
 * counts), and the variant's block applies.
 *
 * Where the ledger broke: turn 3 (the text paid five coins for fruit, the
 * chosen sacrifice, and one more for paper sleeves, and sold cups into the
 * cashbox; only the five reached the stat) and the switch turn 4 (the margin
 * raised 25% -> 30% as the chapter's reward, no sum in the text); the ending
 * (four coins and the 30% margin after a season and a fair of sales).
 * Beside them, turns where money only changed hands as quotes or was paid
 * and counted: the chapter opening at turn 2 (citrus, sugar and cups quoted,
 * 3 + 2 + 1), the fee step at turn 6 (a two-coin fee and a three-coin estimate
 * quoted) and the switch turn 8 (the one-coin fee share paid, 5 -> 4).
 */

const LEDGER = "A turn of the lemonade story, which teaches budgets and profit margins, with a counted cashbox and a profit margin:";

export const MONEY_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-money-lemonade-t2", story: "play-lemonade", turn: 2, role: "beat", purpose: `${LEDGER} the opening chapter's first step, where the stored text quoted citrus, sugar and cups (3 + 2 + 1 coins) and paid nothing.` },
  {
    id: "round-money-lemonade-t3",
    story: "play-lemonade",
    turn: 3,
    role: "beat",
    purpose: `${LEDGER} the step after the five-coin fruit sacrifice, where the stored text paid five coins for fruit and one for paper sleeves and sold cups, and the stat changes took only the five.`,
  },
  { id: "round-money-lemonade-t4", story: "play-lemonade", turn: 4, role: "beat", purpose: `${LEDGER} the switch turn after the favorable chapter, where the stored reply raised the margin 25% -> 30% as a reward with no sum in the text.` },
  { id: "round-money-lemonade-t6", story: "play-lemonade", turn: 6, role: "beat", purpose: `${LEDGER} the fee step, where the stored text quoted a two-coin stall fee and a three-coin estimate and paid nothing.` },
  { id: "round-money-lemonade-t8", story: "play-lemonade", turn: 8, role: "beat", purpose: `${LEDGER} the switch turn after the shared stall, where the stored reply paid the one-coin fee share (5 -> 4) and told four coins left.` },
  { id: "round-money-lemonade-t11", story: "play-lemonade", turn: 11, role: "beat", purpose: `${LEDGER} the ending, where the stored text counted the four coins and the recorded 30% margin after a season and a fair with no sales told.` },
];

const CATEGORY = "money-adds-up";

/**
 * The stage's cases from the second round's stored runs, each only where its request is the one the run sent, recorded
 * as a learning story (the setup form's learn-something category); and what could not be built.
 */
export function moneyAddsUpCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = MONEY_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[] } {
  const built = choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
  const cases = built.cases.map(
    (c): EvalCase =>
      c.state
        ? {
            ...c,
            state: { ...c.state, category: "learn-something" },
            note: `${c.note} Recorded as the game records a story from the learn-something form: its category, which the run did not record and production's turn does not read.`,
          }
        : c
  );
  return { cases, problems: built.problems };
}

/** What --build-money-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function moneyAddsUpCasesToFreeze(
  frozen: EvalCase[],
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ChoiceCaseSpec[] = MONEY_CASE_SPECS,
  sent: SentRequestText = playthroughs2Sent
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = moneyAddsUpCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
