import type { EvalCase } from "./cases.js";
import type { ChoiceCaseSpec, PromptHashOf, SentRequestText } from "./choiceResultCases.js";
import { casesByRound, SENT_BY_ROUND, type RunsByRound } from "./contestSettledCases.js";

/*
 * The result-words stage's cases (decision A's result-words fix, 2026-10-02; no
 * calls): every group turn of the stored playthroughs whose text named a
 * result's kind (production's note resultWordsInText, beatRepairs.ts: the
 * second round's space pirates twice, the third round's space pirates four
 * times and food trucks once; none in round 1 and none for a single player),
 * frozen beside the other cases with --build-result-words-cases. Each is
 * rebuilt by replaying its stored run from its start (playthroughReplay.ts) and
 * built only where its request is the one its round's production sent there,
 * byte for byte (playthroughs2Sent, playthroughs3Sent). Five later chapter steps
 * and two switches after a chapter; six three-player turns and one two-player.
 */

export type ResultWordsCaseSpec = ChoiceCaseSpec & { round: 2 | 3 };

const TOLD = "A group turn whose text told a result's kind as story text:";

export const RESULT_WORDS_CASE_SPECS: ResultWordsCaseSpec[] = [
  {
    id: "round-words-r2-space-pirates-t8",
    round: 2,
    story: "play-space-pirates",
    turn: 8,
    role: "beat",
    purpose: `${TOLD} round 2's space pirates, the claim contest's last step after two Side A results (three players): "The favorable hearing is plain in Jori's pause".`,
  },
  {
    id: "round-words-r2-space-pirates-t18",
    round: 2,
    story: "play-space-pirates",
    turn: 18,
    role: "beat",
    purpose: `${TOLD} round 2's space pirates, the switch after the anchorage chapter's mixed resolution (three players): "The mixed result is plain in the readings", "The mixed result turns the cleft into a refuge".`,
  },
  {
    id: "round-words-r3-food-trucks-t14",
    round: 3,
    story: "play-food-trucks",
    turn: 14,
    role: "beat",
    purpose: `${TOLD} round 3's food trucks, parallel threads' third step after Amara's mixed results and Omar's unfavorable roll (two players): "the unfavorable finding is plain in the empty space".`,
  },
  {
    id: "round-words-r3-space-pirates-t3",
    round: 3,
    story: "play-space-pirates",
    turn: 3,
    role: "beat",
    purpose: `${TOLD} round 3's space pirates, the first chapter's second step after a mixed result (three players): "the mixed reading leaves you with two passages".`,
  },
  {
    id: "round-words-r3-space-pirates-t13",
    round: 3,
    story: "play-space-pirates",
    turn: 13,
    role: "beat",
    purpose: `${TOLD} round 3's space pirates, the seal contest's last step after two Side B results, Oren on side B, his own roll favorable (three players): "The favorable attention your procedure earned remains".`,
  },
  {
    id: "round-words-r3-space-pirates-t14",
    round: 3,
    story: "play-space-pirates",
    turn: 14,
    role: "beat",
    purpose: `${TOLD} round 3's space pirates, the switch after the seal chapter's mixed resolution (three players): "The crew's mixed judgment leaves the Salvagers' proposal and your safeguards on the table together".`,
  },
  {
    id: "round-words-r3-space-pirates-t16",
    round: 3,
    story: "play-space-pirates",
    turn: 16,
    role: "beat",
    purpose: `${TOLD} round 3's space pirates, three parallel challenges' second step after two mixed and one unfavorable result (three players): "The mixed result remains plain in the room", "The unfavorable outcome hangs between you".`,
  },
];

const CATEGORY = "result-words";

/** The stage's cases from the stored runs of rounds 2 and 3, each only where its request is the one the run sent; and what could not be built. */
export function resultWordsCases(
  runs: RunsByRound,
  promptHashOf: PromptHashOf,
  specs: ResultWordsCaseSpec[] = RESULT_WORDS_CASE_SPECS,
  sent: Record<1 | 2 | 3, SentRequestText> = SENT_BY_ROUND
): { cases: EvalCase[]; problems: string[] } {
  return casesByRound(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-result-words-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function resultWordsCasesToFreeze(
  frozen: EvalCase[],
  runs: RunsByRound,
  promptHashOf: PromptHashOf,
  replace: boolean,
  specs: ResultWordsCaseSpec[] = RESULT_WORDS_CASE_SPECS,
  sent: Record<1 | 2 | 3, SentRequestText> = SENT_BY_ROUND
): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = resultWordsCases(runs, promptHashOf, specs, sent);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}
