/*
 * The built trigger cases (roundCases.ts) and what firing their rule looks
 * like, for turn round 1's lean-against-full comparison (turn doc A5: keep the
 * field that restates the story's switch/thread instructions until the lean
 * form fires the built trigger cases as often as the full one). Each case's
 * rule forces the next thread, so a plan that follows it is a flavor switch on
 * the outcome the rule bears on (turn doc A4 step a); the Neonate feeding
 * chapter's recipe gives its chapter plan two beats. The expected outcomes
 * are the ones the reference's plans took on these cases (turn baseline
 * report, section 7), read against each case's rule by hand.
 */

export type TriggerExpectation =
  | { caseId: string; kind: "flavor"; outcomeId: string; rule: string }
  | { caseId: string; kind: "length"; length: number; rule: string };

export const TRIGGER_EXPECTATIONS: TriggerExpectation[] = [
  {
    caseId: "round-switch-trigger-stat-8988006e-t8",
    kind: "flavor",
    outcomeId: "player1_redefine_identity",
    rule: "Personal Agency at 40%: the next thread is about Arielle taking back control of her own choices",
  },
  {
    caseId: "round-switch-trigger-timing-8988006e-t8",
    kind: "flavor",
    outcomeId: "player1_influence_city_ai",
    rule: "turns 9 to 11: the City AI Council summons Arielle to a public hearing, a flavor switch on how she answers",
  },
  {
    caseId: "round-switch-trigger-opening-2db542e9-t0",
    kind: "flavor",
    outcomeId: "player1_inner_circle_loyalty",
    rule: "the opening: the first thread is about the launch-day explosion at the Nevada test site, which tests how far the Inner Circle will follow the player",
  },
  { caseId: "round-thread-neonate-feeding-t1", kind: "length", length: 2, rule: "a feeding thread: 2 beats, choosing the prey, then closing the deal" },
];

export const TRIGGER_SWITCH_CASES = TRIGGER_EXPECTATIONS.filter((e) => e.caseId.startsWith("round-switch-")).map((e) => e.caseId);
export const TRIGGER_THREAD_CASES = TRIGGER_EXPECTATIONS.filter((e) => e.caseId.startsWith("round-thread-")).map((e) => e.caseId);

export function triggerExpectation(caseId: string): TriggerExpectation | undefined {
  return TRIGGER_EXPECTATIONS.find((e) => e.caseId === caseId);
}
