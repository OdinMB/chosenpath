import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { Beat } from "core/types/index.js";
import { allowsLever } from "../leverPayments.js";
import { sacrificeRewardLine, takesOptionRules } from "../optionRules.js";
import { beatStep, type TextRequest } from "../storyTextSteps.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";
import { chapterLevers, OPTIONS_CONTINUITY_TEXT, type ChapterLevers } from "./turnOptionsContinuity.js";

/*
 * Option variety with fewer rewards (eval only; version O2c, the coordinator's
 * brief of 2026-10-01 after the owner's feedback on O2b: "14 reward options in
 * 32 choice sets is a bit too much. At most one reward is good. Several
 * sacrifices can sometimes make sense, but should have a strong justification
 * starting at the second one." Options should use different stats, not differ
 * only in risk).
 *
 * The cause, read from O2b's stored replies and production's beside them (the
 * options-o2 stage's 32 rolled steps under adopted3; a temporary probe, no
 * calls):
 * - Rewards. O2b's line invites a reward on every rolled step until the chapter
 *   has offered one, whatever B6's rate says, so on the stored states (no
 *   stored chapter offered a reward before its turn) it invited on all 32, and
 *   took it on 14 (54% where it said "a reward fits … No sacrifice this turn.",
 *   1 of 8 where it said "and so does a sacrifice"). In play the same line
 *   would invite on every step of every chapter until one is offered, so most
 *   chapters (about 80% at three steps) would end with a reward.
 * - The odds tilt. The balance simulation's "strength option best outright"
 *   counts any normal option with a bonus as the strength option. Read by the
 *   option B6 calls tempting (a normal option with a negative base and a
 *   bonus): production's leads 72% of its sets without a lever, O2b's 83%;
 *   production's sets with a sacrifice lead with the sacrifice (+30) 10 of 14;
 *   O2b's 14 reward sets lead with the tempting option 13 of 14, since the
 *   reward (-30) takes the third option's place, where production had a
 *   sacrifice in 14 of 63 sets against O2b's 6 of 32. So the tilt comes with
 *   the reward count: fewer rewards put sacrifices and a third normal option
 *   back in that place.
 * - The extra reasoning. Median reasoning tokens on these steps: production
 *   1,754, arm O (the stats line alone, an hour apart) +7%, O2 +14%, O2b +21%;
 *   O2b's sets without a reward 2,048 (+17%), with one 2,333 (+33%). The
 *   invitation is deliberated over on every step it is sent, taken or not; the
 *   stat-variety line costs the rest.
 *
 * The variant is production's single-player turn (beatStep.request, every turn
 * kind) with, on a rolled chapter step (takesOptionRules: a single player's
 * challenge or contest step), O2b's stat lines word for word (after B6's third
 * way: the options draw on different stats, a lever option needs no bonus,
 * risk alone never tells two apart, no option names its stat; and the strength
 * option keeps -5 to -15) and its risk-only weak example, and a lever line the
 * game computes (o2cLeverRule):
 * - a reward only on the reward turn, which the game places (o2cRewardTurn): a
 *   chapter's first step, where the player's previous chapter offered no reward
 *   (offered, chosen or not) and some stat's rules allow one (allowsLever). So
 *   at most one a chapter, never two chapters in a row: about one chapter in two
 *   or three once a reward isn't always taken. The first step: one invitation
 *   a chapter at a fixed place, the only way to cut the invitations (and their
 *   reasoning) without the turn counting anything, and the reward's lower odds
 *   fall where the chapter opens, not on its decisive later steps. On it, no
 *   sacrifice (one lever a turn), whatever today's rate says.
 * - elsewhere no reward, and a sacrifice where B6's rate allows one (O2b's
 *   sacrifice half); where the rate allows one after the chapter already offered
 *   a sacrifice (only at a four-step chapter's last step, or after options a
 *   played step typed as exploration), another only for a strong reason stated
 *   in the option's text. The clause tightens there, where production's line
 *   invites a lever freely; O2's clause, sent where the rate gave none, read as
 *   leave, and O2b dropped it.
 * - today's "none this turn" where the rate gives none.
 * Everywhere else production's request byte for byte.
 *
 * Adopted after the run of 2026-10-01: production's copy is optionRules.ts
 * (THREE_WAYS with the stat lines, rewardTurn, optionLeverLine), and the kept
 * tests hold production to turnO2c byte for byte, prompt and JSON schema. The
 * variant builds on production with those lines taken out (optionsO2cBase), so
 * it still builds as measured.
 */

const LABEL = "Options O2c turn";

/** B6's third way, after which O2b's stat lines go (production's wording, optionRules.ts THREE_WAYS). */
const THIRD_WAY =
  "--- one costs or risks something the others don't (a sacrifice, a chased reward, a relationship put on the line), or serves a different stake of the character's.\n";
/** B6's weak example, after which the risk-only weak example goes. */
const WEAK_ONE_APPROACH = '--- Weak: "Use your speech skill to…" / "Use your charm to…" / "Use your knowledge of law to…" (one approach three times)\n';

const NONE_THIS_TURN = "Sacrifice or reward: none this turn.";
const REWARD_TURN = "Sacrifice or reward: offer a reward this turn if a stat allows one. No sacrifice this turn.";
const SACRIFICE_FITS = "Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward this turn.";
const STRONG_REASON = "so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text";
const NO_REWARD = "No reward this turn.";

const offered = (beats: Beat[], kind: string) => beats.reduce((sum, beat) => sum + (beat.options ?? []).filter((o) => o.resourceType === kind).length, 0);

/** The rewards the player's previous chapter (the last thread they played before the current one) offered, chosen or not; 0 before any. */
export function previousChapterRewards(story: Story, slot: string): number {
  const phases = story.getState().storyPhases;
  const current = story.getCurrentThreadAnalysis();
  for (let i = phases.length - 1; i >= 0; i--) {
    const phase = phases[i];
    if (!("threads" in phase) || phase === current) continue;
    const thread = phase.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
    if (thread) return offered(story.getThreadBeatTexts(thread)[slot] ?? [], "reward");
  }
  return 0;
}

/** Whether some stat's rules allow a reward (its optionsToGainAsReward isn't "None"). */
function rewardAllowed(story: Story): boolean {
  const state = story.getState();
  return [...state.sharedStats, ...state.playerStats].some((stat) => allowsLever(stat, "reward"));
}

/**
 * The reward turn the game places: a single player's rolled chapter step that
 * is the chapter's first, where the player's previous chapter offered no reward
 * and some stat allows one. At most one a chapter, never two chapters running.
 */
export function o2cRewardTurn(story: Story, slot: string): boolean {
  if (!takesOptionRules(story) || slot !== "player1") return false;
  return story.getCurrentThreadBeatsCompleted() === 0 && previousChapterRewards(story, slot) === 0 && rewardAllowed(story);
}

/** What the line allows: a reward (the reward turn only), and a sacrifice that fits, none, or a second only for a strong reason. */
export type O2cLeverRule = { reward: boolean; sacrifice: "fits" | "none" | "strongReason" };

export function o2cLeverRule(story: Story, slot: string): O2cLeverRule {
  if (o2cRewardTurn(story, slot)) return { reward: true, sacrifice: "none" };
  if (sacrificeRewardLine(story, slot) === NONE_THIS_TURN) return { reward: false, sacrifice: "none" };
  return { reward: false, sacrifice: chapterLevers(story, slot).sacrifices > 0 ? "strongReason" : "fits" };
}

const WORDS = ["no", "one", "two", "three", "four", "five"];
const inWords = (n: number) => WORDS[n] ?? String(n);

function sacrificesSoFar({ sacrifices, sacrificesTaken }: ChapterLevers): string {
  if (sacrifices === 1) return `a sacrifice, which the player ${sacrificesTaken > 0 ? "took" : "didn't take"}`;
  const took = sacrificesTaken === 0 ? "none of them" : sacrificesTaken === sacrifices ? (sacrifices === 2 ? "both" : "all of them") : `${inWords(sacrificesTaken)} of them`;
  return `${inWords(sacrifices)} sacrifices, and the player took ${took}`;
}

/** O2c's lever line, in B6's line's place: the reward turn's, a sacrifice that fits, a second only for a strong reason, or today's "none". */
export function o2cLeverLine(story: Story, slot: string): string {
  const rule = o2cLeverRule(story, slot);
  if (rule.reward) return REWARD_TURN;
  if (rule.sacrifice === "none") return NONE_THIS_TURN;
  if (rule.sacrifice === "fits") return SACRIFICE_FITS;
  return `Sacrifice or reward: this thread already offered ${sacrificesSoFar(chapterLevers(story, slot))}, ${STRONG_REASON}. ${NO_REWARD}`;
}

/**
 * Production's single-player turn as the stage measured it beside the variant.
 * Since the adoption (2026-10-01) production prints O2c's lines on a rolled step
 * (optionRules.ts: THREE_WAYS and optionLeverLine), so they are taken out there
 * and B6's rate line put back in the lever line's place (the texts are the
 * variant's, which a test holds); every other turn is production's as it is.
 */
export function optionsO2cBase(story: Story): TextRequest<z.AnyZodObject> {
  const production = beatStep.request(story);
  if (!takesOptionRules(story)) return production;
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  let edited = replaceOnce(LABEL, instructions, `${THIRD_WAY}${OPTIONS_CONTINUITY_TEXT.o2Stats}\n${OPTIONS_CONTINUITY_TEXT.o2NegativeBase}\n`, THIRD_WAY);
  edited = replaceOnce(LABEL, edited, `${WEAK_ONE_APPROACH}${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}\n`, WEAK_ONE_APPROACH);
  edited = replaceOnce(LABEL, edited, `--- ${o2cLeverLine(story, "player1")}\n`, `--- ${sacrificeRewardLine(story, "player1")}\n`);
  return { prompt: edited + state, schema: production.schema };
}

/** Production's single-player turn with O2b's stat lines and O2c's lever line on a rolled chapter step; production's request elsewhere. */
export function optionsO2cRequest(story: Story): TextRequest<z.AnyZodObject> {
  if (story.isMultiplayer()) throw new Error(`${LABEL}: the variant is single-player (group turns stay on production's group form)`);
  const base = optionsO2cBase(story);
  if (!takesOptionRules(story)) return base;
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  let edited = replaceOnce(LABEL, instructions, THIRD_WAY, `${THIRD_WAY}${OPTIONS_CONTINUITY_TEXT.o2Stats}\n${OPTIONS_CONTINUITY_TEXT.o2NegativeBase}\n`);
  edited = replaceOnce(LABEL, edited, WEAK_ONE_APPROACH, `${WEAK_ONE_APPROACH}${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}\n`);
  edited = replaceOnce(LABEL, edited, `--- ${sacrificeRewardLine(story, "player1")}\n`, `--- ${o2cLeverLine(story, "player1")}\n`);
  return { prompt: edited + state, schema: base.schema };
}

/** The passages the tests pin. */
export const OPTIONS_O2C_TEXT = { rewardTurn: REWARD_TURN, sacrificeFits: SACRIFICE_FITS, strongReason: STRONG_REASON, thirdWay: THIRD_WAY, weakOneApproach: WEAK_ONE_APPROACH };
