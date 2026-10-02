import type { Story } from "core/models/Story.js";

/*
 * Money and counts that move in a learning story's turns (adopted 2026-10-02
 * from the money-2 stage, decision A's money fix; the eval's moneyTurnB,
 * storyTextRounds/moneyAddsUp.ts, which measured it). The third playthroughs'
 * lemonade stand never sold a cup; with the setup now keeping money and counted
 * things in number stats (MONEY_SETUP_LINE in setupPromptText.ts), production's
 * turn still left the text's payments and sales out of the stat changes ("You
 * pay $3.55 for the supplies, add the $2 permit" with the cash unmoved, sales at
 * a fair "that do not cover what the stand spent" with no figures). Nothing in
 * the turn tied the money the text pays and earns to the stat that counts it.
 *
 * On a learning story (the setup form's learn-something category) that keeps a
 * counted (number) stat, every turn after the first carries one block at the
 * end of its stat changes: every amount of a counted stat the text pays,
 * spends, uses up, sells or earns moves that stat by exactly that amount, named
 * in the text, even where the text sums up a stretch of time; a quote, an
 * estimate or a plan moves nothing, nor a cost only worked out; the chosen
 * sacrifice or reward is paid once; a stat worked out from other figures moves
 * only by its sum; no stated total differs from the stat. A switch turn and the
 * ending also carry the worked-out stat's exception right after the line that
 * sends them to each stat's adjustments after threads.
 *
 * Measured on single-player lemonade turns built from the stage's own runs,
 * read blind by hand: replies whose money adds up, production 3 of 8, the
 * fix-and-retest 7 of 8 (moved higher, p 0.059), on the four cases where the
 * first form's replies still failed; the first form alone 10 of 16 -> 13 of 15
 * on eight cases (within the noise). Those four cases were chosen from
 * production's records of that run, one because production failed it in both
 * samples, so the review of the adoption (2026-10-02) ran production's turn as
 * measured fresh on them: 2 of 7 (one partial) against the same 7 of 8, moved
 * higher (p 0.035, noise 8 points); without the case chosen on production's
 * failure, 2 of 5 against 5 of 6, not moved. A group's turn carries the block
 * too, unmeasured for groups.
 */

const HEADING = "MONEY AND COUNTS: this story teaches with its figures, so they add up from beat to beat.";

/** Every amount the text pays or earns moves its stat by that amount, each named. */
const AMOUNTS_NAMED =
  '- Every amount of a counted stat (money, cups, supplies) that this beat\'s text pays, spends, uses up, sells or earns moves that stat by exactly that amount in these stat changes, never put off to a later beat: a purchase or a fee subtracts its price, a sale adds what the customers pay. Decide here what the text will pay and earn, apply exactly that, and let the text pay and earn nothing else; the text names each of those amounts ("two coins"), never a handful or a few. A price quoted, an estimate or a plan moves nothing.';

/** The fix-and-retest's line: a sale or fee told in a summary is named and counted too; a cost only worked out moves nothing. */
const SUMMED_UP =
  "- A sale, a purchase or a fee the text tells is one of those amounts, even where the text sums up a stretch of time or an event ('eight cups at 65 cents', 'the six-coin stall fee'): it is named and counted here, never told as 'a few purchases' or 'the sales did not cover the costs' without its figures. A cost the text only works out (the ingredients in the cups sold, from supplies already bought) moves nothing; only money that changes hands in this beat does. The text never leaves a sale out of the scene to keep these changes simple.";

const REST = [
  "- The sacrifice or reward the player chose is paid once, by the amount its option names: when the text shows that payment, it is the same amount, not a second one.",
  "- A stat worked out from other figures (a profit margin) moves only to the value the text works out from figures it shows, with the sum, or by the sacrifice or reward the player chose. It is not raised or lowered for how a thread went, whatever its adjustments after threads say.",
  "- The text, the interludes and the facts never state a total for a stat (the money left, a count, a margin) other than its value after these changes.",
  "- These changes are bookkeeping, so they are made in full on any stat that can be adjusted anytime. Where a counted stat can change only when a thread is resolved, the text quotes and plans its amounts until then and pays and earns none of them.",
];

/** The block at the end of the stat-changes section (BeatPromptService prints it after a blank line). */
const BLOCK = [HEADING, AMOUNTS_NAMED, SUMMED_UP, ...REST].join("\n") + "\n";

/** The worked-out stat's exception, right after the thread-resolution line on each stat's adjustments after threads. */
const RESOLUTION_LINE =
  "--- In this story, a stat worked out from other figures (a profit margin) is the exception: skip its adjustments after threads, and change it only to the value the text works out from figures it shows, with the sum.\n";

/** The passages BeatPromptService prints and the tests pin. */
export const MONEY_TURN_TEXT = { heading: HEADING, amountsNamed: AMOUNTS_NAMED, summedUp: SUMMED_UP, rest: REST, block: BLOCK, resolutionLine: RESOLUTION_LINE } as const;

/** Whether the story keeps a counted stat: a number stat, shared or a player's. */
function keepsCountedStat(story: Story): boolean {
  const state = story.getState();
  return [...(state.sharedStats ?? []), ...(state.playerStats ?? [])].some((stat) => stat.type === "number");
}

/** Whether a turn takes the money lines: a learning story's turn after the first (which changes no stats), where the story keeps a counted stat. */
export function takesMoneyRule(story: Story): boolean {
  return story.getCategory() === "learn-something" && !story.isFirstBeat() && keepsCountedStat(story);
}
