import type { Story } from "core/models/Story.js";
import { MONEY_TURN_TEXT, takesMoneyRule } from "../moneyTurns.js";
import { beatStep, type TextRequest } from "../storyTextSteps.js";
import { choiceResultRequest } from "./choiceResult.js";
import { kidsTurnRequest } from "./kidsTurn.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";

export { takesMoneyRule };

/*
 * Money and counts that add up in a learning story (eval only; fix 7 of the
 * second playthroughs' review, 2026-10-01). Found in the second round's
 * lemonade story, which teaches budget allocation and profit margins to
 * middle-school students, with a counted Stand Cashbox (10 coins) and a
 * Profit Margin (25%):
 * - turn 2 quoted 3 coins of citrus, 2 of sugar and 1 of cups, "six" in all;
 *   turn 3's text paid "five coins for the extra fruit" (the chosen
 *   sacrifice) and "one more coin for paper sleeves", sold cups ("leave a coin
 *   on the cart", "the cashbox fills with a handful of mixed coins"), and its
 *   stat changes took only the sacrifice's five (10 -> 5): the sleeves and the
 *   sales never reached the cashbox, nor the opening supplies;
 * - the switch turn after (turn 4) raised the profit margin 25% -> 30% for
 *   the favorable chapter (its plan: "Add 5 percentage points to Profit
 *   Margin"), following the setup's own "+5 percentage points after a
 *   favorable thread centered on careful pricing or expense control", with no
 *   sum in the text;
 * - the ending counted "the four coins still there" and "your recorded 30%
 *   profit margin" after a season and a fair of sales.
 * The cause, in production's request: the stat-changes section names only
 * the sacrifice's and reward's payments, and within a chapter allows only
 * "minor" changes to stats that can be adjusted anytime; on a switch turn
 * "some meaningful stat changes might be warranted" for the chapter's
 * result. Nothing ties the money the text pays and earns to the stat that
 * counts it, or a figure the story works out (a margin) to the sum behind it,
 * and the stat changes are written before the text. The setup pulled the
 * same way: its Eli's instructions ("purchases affect the Cashbox only when
 * the thread resolves"), the cashbox's after-chapter rule (add the chapter's
 * "stated net profit", which no text stated) and the margin's fixed step
 * after a favorable chapter.
 *
 * The variant is production's turn today (productionTurnMeasured) with, on a
 * learning story (the setup form's learn-something category) that keeps a
 * counted stat (a number stat, shared or a player's), one block at the end
 * of the stat-changes section (after the chapter's "keep the changes minor",
 * or after a switch turn's or the ending's milestone lines): every amount of
 * a counted stat the text pays, spends, uses up, sells or earns moves that
 * stat by that amount in this reply's stat changes, never put off, decided
 * before the text and nothing else paid or earned; a quote, an estimate or a
 * plan moves nothing; the chosen sacrifice or reward is paid once; a stat
 * worked out from other figures moves only to the value the text works out
 * (or by a chosen lever), never for how a thread went, whatever its
 * after-chapter adjustments say; no stated total differs from the stat; the
 * changes are made in full, and a counted stat that can change only when a
 * thread is resolved is paid and earned only then. Every player
 * count (the block reads per stat). Every other turn gets production's
 * request byte for byte, the first turn included (it changes no stats).
 *
 * The one fix-and-retest (moneyAddsUpB, after the run of 2026-10-01): the
 * run's switch turn still raised the margin 25 -> 30 in both samples,
 * following the stat's own adjustment, which the thread-resolution lines send
 * it to ("Consider the 'Adjustments after threads' parameter"), and a chapter
 * step told "each coin received" with no amount and no change. B names every
 * amount the text pays or earns ("two coins", never a handful), and puts the
 * worked-out stat's exception right after that thread-resolution line (a
 * switch turn and the ending).
 *
 * The money-2 stage (2026-10-02) measured block B on production's turn of that
 * day (moneyTurn) and its own fix-and-retest (moneyTurnB), which was adopted:
 * production's copy is moneyTurns.ts (MONEY_TURN_TEXT, takesMoneyRule), which
 * BeatPromptService prints, and the kept tests hold production to moneyTurnB
 * byte for byte. The texts below are production's where production has them;
 * every variant here builds on production with those lines taken out
 * (withoutMoneyTurnLines), so each still builds as measured.
 */

const LABEL = "Money-adds-up turn";

const { heading: HEADING, amountsNamed: AMOUNTS_NAMED, summedUp: SUMMED_UP, rest: REST, resolutionLine: RESOLUTION_LINE } = MONEY_TURN_TEXT;
const AMOUNTS =
  "- Every amount of a counted stat (money, cups, supplies) that this beat's text pays, spends, uses up, sells or earns moves that stat by exactly that amount in these stat changes, never put off to a later beat: a purchase or a fee subtracts its price, a sale adds what the customers pay. Decide here what the text will pay and earn, apply exactly that, and let the text pay and earn nothing else. A price quoted, an estimate or a plan moves nothing.";

const BLOCK = [HEADING, AMOUNTS, ...REST].join("\n") + "\n";
/** The fix-and-retest's block: the first line the same, with every amount named, never "a handful of coins". */
const BLOCK_B = [HEADING, AMOUNTS_NAMED, ...REST].join("\n") + "\n";

/**
 * The money-2 stage's fix-and-retest of the turn line (moneyTurnB, 2026-10-02),
 * right after the amounts line: the replies that still did not add up told a
 * stretch of sales or a fee in a summary with no figures, one subtracted an
 * ingredient cost it only worked out, and on one step both samples kept the
 * waiting customer from buying. Production's own since the adoption.
 */
const RETEST_LINE = SUMMED_UP;

/**
 * The thread-resolution line that sends a switch turn or the ending to each
 * stat's adjustments after threads (the run's switch turn followed the
 * margin's own "+5 after a favorable thread" there); the fix-and-retest's
 * exception goes right after it (RESOLUTION_LINE, production's own since the
 * money-2 adoption).
 */
const ADJUSTMENTS_ANCHOR = "- Stats define how they should be adjusted after threads. Consider the 'Adjustments after threads' parameter in the stat definitions.\n";

/** What follows the stat-changes section: a group's coordination section, else the beats. */
const SINGLE_NEXT = "\n\n3. GENERATE ONE STORY BEAT FOR EACH PLAYER";
const GROUP_NEXT = "\n\n3. MULTIPLAYER COORDINATION";

/** The passages the tests pin. */
export const MONEY_ADDS_UP_TEXT = {
  block: BLOCK,
  blockB: BLOCK_B,
  adjustmentsAnchor: ADJUSTMENTS_ANCHOR,
  resolutionLine: RESOLUTION_LINE,
  singleNext: SINGLE_NEXT,
  groupNext: GROUP_NEXT,
  amountsNamed: AMOUNTS_NAMED,
  retestLine: RETEST_LINE,
};

/** The run's form (moneyAddsUp), or its fix-and-retest (moneyAddsUpB): every amount named, and the margin's exception in the thread-resolution lines. */
export type MoneyAddsUpForm = { b?: boolean };

/**
 * A turn prompt without the money lines production prints since the money-2
 * adoption (2026-10-02): its block and the worked-out stat's exception,
 * wherever they stand; a prompt without them as it is.
 */
export function withoutMoneyTurnLines(prompt: string): string {
  return [`\n${MONEY_TURN_TEXT.block}`, MONEY_TURN_TEXT.resolutionLine].reduce((text, passage) => text.split(passage).join(""), prompt);
}

/**
 * Production's turn today as the eval measured it: a single player's turn the
 * kids-turns stage's (kidsTurn: production's turn, with the kids rules on a
 * story read with a child), a group's the choice-result stage's (choiceResult:
 * production's turn with the exploration line, which kidsTurn builds on);
 * without the money lines production prints since the money-2 adoption.
 */
export function productionTurnMeasured(story: Story): TextRequest {
  const request = story.isMultiplayer() ? choiceResultRequest(story) : kidsTurnRequest(story);
  return { ...request, prompt: withoutMoneyTurnLines(request.prompt) };
}

/**
 * Production's turn as the money-2 stage measured it beside the turn line:
 * production's turn today with the money lines it prints since the adoption
 * taken out (the same turn without the learning category).
 */
export function moneyTurnBase(story: Story): TextRequest {
  const production = beatStep.request(story);
  return { ...production, prompt: withoutMoneyTurnLines(production.prompt) };
}

/** A turn request with the money block (or B, with its thread-resolution line) at the end of its stat-changes section. */
function withMoneyBlock(base: TextRequest, story: Story, b: boolean): TextRequest {
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  const next = story.isMultiplayer() ? GROUP_NEXT : SINGLE_NEXT;
  let edited = replaceOnce(LABEL, instructions, next, `\n${b ? BLOCK_B : BLOCK}${next}`);
  if (b && story.getCurrentBeatType() !== "thread") edited = replaceOnce(LABEL, edited, ADJUSTMENTS_ANCHOR, `${ADJUSTMENTS_ANCHOR}${RESOLUTION_LINE}`);
  return { ...base, prompt: edited + state };
}

/** Production's turn with the money block on a learning story that counts; production's request byte for byte elsewhere. */
export function moneyAddsUpRequest(story: Story, form: MoneyAddsUpForm = {}): TextRequest {
  const base = productionTurnMeasured(story);
  return takesMoneyRule(story) ? withMoneyBlock(base, story, form.b === true) : base;
}

/**
 * Fix 7's turn line where the money-2 stage found it still needed (decision
 * A's money fix, 2026-10-02): block B and its thread-resolution line, word for
 * word as the money-adds-up stage measured them, on production's turn of that
 * day (moneyTurnBase) rather than on production as it stood then; production's
 * request byte for byte on every turn that takes no block. With the money
 * setup's number stats moving by what the story pays and earns, production's
 * turn still left the text's payments and sales out of the stat changes in 5
 * of the 7 played lemonade turns whose text paid or sold: "You pay $3.55 for
 * the supplies, add the $2 permit" with the cash unmoved, "a few more
 * neighbors buy cups ... two more coins than before" with the cash unmoved, a
 * 75-cent sale moving the cash by a reward's 2 coins. The fix-and-retest
 * (retest, moneyTurnB) is production's turn since the adoption.
 */
export function moneyTurnRequest(story: Story, form: { retest?: boolean } = {}): TextRequest {
  const base = moneyTurnBase(story);
  if (!takesMoneyRule(story)) return base;
  const request = withMoneyBlock(base, story, true);
  // The fix-and-retest (moneyTurnB): one line right after the amounts line
  return form.retest ? { ...request, prompt: replaceOnce(LABEL, request.prompt, `${AMOUNTS_NAMED}\n`, `${AMOUNTS_NAMED}\n${RETEST_LINE}\n`) } : request;
}
