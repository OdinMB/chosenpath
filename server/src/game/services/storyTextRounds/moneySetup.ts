import type { GameMode, PlayerCount } from "core/types/index.js";
import type { SetupPromptOptions } from "../prompts/StorySetupPromptService.js";
import { MONEY_SETUP_LINE } from "../prompts/setupPromptText.js";
import { setupStep, type SetupRequest } from "../storyTextSteps.js";
import { replaceOnce } from "./roundEdits.js";

/*
 * Money and counts in a learning story's setup (eval only; decision A's money
 * fix, the money-2 stage of 2026-10-02). Found in the third playthroughs'
 * lemonade stand (budget allocation and profit margins for middle-school
 * students), which never sold a cup: its setup typed Stand Cash as a
 * percentage (50%, "Spend 10% of Stand Cash", "+10% after a favorable thread
 * that earns sales or avoids unnecessary expense"), so a sale or a cost in
 * coins had nowhere to land, and the story's prose never named a sum ("four
 * small piles", "three quarters of the starting cash"). The second round's
 * setup for the same premise had a number ("Stand Cashbox", 10), and its prose
 * counted coins.
 *
 * The cause, in production's setup request: the stat type catalogue and the
 * stat guidelines do say money is a number, but every example a setup copies
 * is a percentage ('Spend 10% fuel', 'Regain 10% health', 'Above 70%: +10',
 * the worked example's Public Support and Fervor, '+10% after a favorable
 * challenge thread about the crowd'), and the adjustments field asks every
 * stat for "one or two changes after threads, each keyed on the kind of thread
 * and its result ... (a percentage by 5 to 15)". So a setup's money moves by a
 * fixed step for how a thread went, not by what the story pays and earns. On
 * production's setup form, 2 of the 5 stored lemonade setups typed the cash as
 * a percentage (setup round 3's sample 1, the third playthroughs'), and all 5
 * moved it after threads by a fixed step or by "the thread's recorded profit",
 * which no turn records; the second round's also made the profit margin a stat
 * raised 5 points after a favorable thread, which every switch turn of the
 * money-adds-up stage followed.
 *
 * The variant is production's setup request with, on a learning story (the
 * setup form's learn-something category, which production's story creation
 * records), one line at the end of the "This setup" block, right before the
 * premise: where the premise is about money or other counted things, each such
 * amount is a number stat in its own units, never a percentage, with its
 * effects, thresholds and levers in those units; it is adjustable anytime and
 * moves by exactly what the story pays, spends, uses up, sells or earns, in the
 * beat where that happens, so its adjustments after threads name no fixed
 * amount for a favorable or unfavorable thread and no story element puts a
 * payment off to a thread's end; a figure worked out from others (a profit
 * margin, a price per item, an average) is not a stat. Its examples come from
 * no premise the stage measures. The schema is production's. Every other setup
 * gets production's request byte for byte.
 *
 * Adopted after the run of 2026-10-02: production's copy of the line is
 * setupPromptText.ts's MONEY_SETUP_LINE, which StorySetupPromptService prints
 * where the story creation passes the learning flag, and the kept test
 * (adoptedSetup.test.ts) holds production to this variant byte for byte. The
 * variant builds on production without the flag, so it still builds as
 * measured.
 */

const LABEL = "Money setup";

/** What follows the "This setup" block: the premise. */
const ANCHOR = "\n\n<premise>\n";

const LINE = MONEY_SETUP_LINE;

/** The passages the tests pin. */
export const MONEY_SETUP_TEXT = { anchor: ANCHOR, line: LINE };

/** The setup's options with the learning category: the setup form's learn-something stories (production's own since the adoption). */
export type MoneySetupOptions = SetupPromptOptions;

/** Production's setup (without the learning flag) with the money line on a learning story; production's request byte for byte on every other. */
export function moneySetupRequest(
  premise: string,
  playerCount: PlayerCount,
  gameMode: GameMode,
  maxTurns: number,
  kind: "story" | "template",
  options: MoneySetupOptions = {}
): SetupRequest {
  const { learning, ...production } = options;
  const base = setupStep.request(premise, playerCount, gameMode, maxTurns, kind, production);
  if (!learning) return base;
  return { ...base, prompt: replaceOnce(LABEL, base.prompt, ANCHOR, `\n${LINE}${ANCHOR}`) };
}
