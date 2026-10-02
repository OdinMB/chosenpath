import type { Story } from "core/models/Story.js";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { ChangeService } from "../../game/services/ChangeService.js";
import type { EvalCase } from "./cases.js";
import { withoutMoneyTurnLines } from "../../game/services/storyTextRounds/moneyAddsUp.js";
import { choiceResultCases, productionSends, type ChoiceCaseSpec, type PromptHashOf, type SentRequestText } from "./choiceResultCases.js";
import { amountSentences, isCounted, statsOfSetup, type Money2CountedValue } from "./money2Play.js";
import type { PlayRun } from "./playthroughs.js";

/*
 * The money-2 stage's turn cases (decision A's money fix, 2026-10-02; no
 * calls): fix 7's turn line where the stage found it still needed. With the
 * money setup, both lemonade runs counted their cash in coins and sold cups in
 * their first chapter, but production's turn moved the money the text paid and
 * earned in 2 of the 7 played turns whose text paid or sold; with production's
 * setup, the one run that paid and sold did the same. The cases are those turns
 * and the turns beside them, frozen with --build-money-2-cases, each rebuilt
 * by replaying its run and built only where its request is the one production
 * sent there (production's turn as it stood when the stage played them: since
 * the adoption it carries the money lines on these turns, money2Sent takes them
 * out). The stories record the learning category, as the game records one
 * from the learn-something form, so the turn line applies.
 */

const LEMONADE = "A turn of the lemonade stand (budget allocation and profit margins), counted in coins or dollars:";

export const MONEY_2_TURN_CASE_SPECS: ChoiceCaseSpec[] = [
  { id: "round-money2-setup-s1-t3", story: "money2-lemonade-moneySetup", sample: 1, turn: 3, role: "beat", purpose: `${LEMONADE} the money setup's first run, a chapter step where the cost per cup is worked out ($6 / 20) and nothing paid.` },
  { id: "round-money2-setup-s1-t4", story: "money2-lemonade-moneySetup", sample: 1, turn: 4, role: "beat", purpose: `${LEMONADE} the money setup's first run, a chapter step where production sold a 40-cent cup and let two lemons be tasted, each moved by its amount.` },
  { id: "round-money2-setup-s1-t5", story: "money2-lemonade-moneySetup", sample: 1, turn: 5, role: "beat", purpose: `${LEMONADE} the money setup's first run, the switch turn after the chapter, where production sold a 60-cent cup and moved it.` },
  { id: "round-money2-setup-s2-t3", story: "money2-lemonade-moneySetup", sample: 2, turn: 3, role: "beat", purpose: `${LEMONADE} the money setup's second run, a chapter step after the reward for selling an early cup, where production told a 75-cent sale and moved the cash by the reward's 2 coins.` },
  { id: "round-money2-setup-s2-t4", story: "money2-lemonade-moneySetup", sample: 2, turn: 4, role: "beat", purpose: `${LEMONADE} the money setup's second run, a chapter step where production sold more cups ('two more coins than before') and left the cash unmoved.` },
  { id: "round-money2-setup-s2-t5", story: "money2-lemonade-moneySetup", sample: 2, turn: 5, role: "beat", purpose: `${LEMONADE} the money setup's second run, the switch turn after the fair, where production told sales short of the six-coin fee and raised the cash by 2.` },
  { id: "round-money2-prod-s2-t4", story: "money2-lemonade-adopted", sample: 2, turn: 4, role: "beat", purpose: `${LEMONADE} production's setup's second run (Stand Cash in dollars, its sales added after threads), a chapter step where production paid $3.55 for supplies and a $2 permit and left the cash unmoved.` },
  { id: "round-money2-prod-s2-t5", story: "money2-lemonade-adopted", sample: 2, turn: 5, role: "beat", purpose: `${LEMONADE} production's setup's second run, the switch turn after the chapter, where production told the day's sales with no sum and left the cash unmoved.` },
];

const CATEGORY = "money-2";

/**
 * What production sent in the stage's own runs, played before its adoption
 * (2026-10-02): a learning story's turn that counts without the money lines
 * production prints since; today's request everywhere else.
 */
export const money2Sent: SentRequestText = (input) => (input.role === "beat" ? withoutMoneyTurnLines(productionSends(input)) : productionSends(input));

/**
 * The stage's turn cases from its own lemonade runs, each only where its request is the one production sent; and what
 * could not be built. A run played through today's code (the tests' fake runs) sent productionSends.
 */
export function money2TurnCases(
  runs: PlayRun[],
  promptHashOf: PromptHashOf,
  specs: ChoiceCaseSpec[] = MONEY_2_TURN_CASE_SPECS,
  sent: SentRequestText = money2Sent
): { cases: EvalCase[]; problems: string[] } {
  return choiceResultCases(runs, promptHashOf, specs, sent, CATEGORY);
}

/** What --build-money-2-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function money2TurnCasesToFreeze(frozen: EvalCase[], runs: PlayRun[], promptHashOf: PromptHashOf, replace: boolean): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = money2TurnCases(runs, promptHashOf);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}

export type Money2ReplyReading = { counted: Money2CountedValue[]; changes: string[]; text: string; amounts: string[]; interludes: string[] };

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** A turn reply on a story, read for its money: the counted stats before and after its changes as the game repairs and applies them, its changes on them, every player's text and the sentences that name an amount. */
export function readMoney2Reply(story: Story, reply: SetOfBeatGenerationSchema): Money2ReplyReading {
  const counted = statsOfSetup(story.getState()).filter(isCounted);
  let repaired = reply;
  try {
    repaired = repairBeatReply(story, reply).reply;
  } catch {
    // A reply the repairs can't read is read as it came
  }
  const changes = (repaired.statChanges ?? []).filter((c) => c.type === "statChange");
  const after = new ChangeService().applyChanges(story.clone(), changes);
  const slots = story.getPlayerSlots();
  const valueOf = (s: Story, group: string, id: string) =>
    (group === "shared" ? s.getState().sharedStatValues : s.getState().players[group]?.statValues)?.find((e) => e.statId === id)?.value;
  const values = counted.flatMap((s): Money2CountedValue[] =>
    (s.group === "shared" ? ["shared"] : slots).map((group) => ({ group, id: s.id, name: s.name, before: valueOf(story, group, s.id), after: valueOf(after, group, s.id) }))
  );
  const ids = new Set(counted.map((s) => s.id));
  const beats = repaired as unknown as Record<string, { text?: unknown; interludes?: unknown }>;
  const texts = slots.map((slot) => text(beats[slot]?.text)).filter(Boolean);
  return {
    counted: values,
    changes: changes.flatMap((c) => (c.type === "statChange" && ids.has(c.stat) ? [`${c.group} ${c.stat} ${c.change} ${c.value}`] : [])),
    text: texts.join("\n\n"),
    amounts: amountSentences(texts.join("\n\n")),
    interludes: slots.flatMap((slot) => (Array.isArray(beats[slot]?.interludes) ? (beats[slot]?.interludes as unknown[]).filter((i): i is string => typeof i === "string") : [])),
  };
}
