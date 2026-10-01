import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { allowsLever } from "../leverPayments.js";
import { groupLeverLine, groupLeverSlots, sacrificeRewardLine, takesGroupLeverRules } from "../optionRules.js";
import { ThreadResolutionService } from "../ThreadResolutionService.js";
import { beatStep, type TextRequest } from "../storyTextSteps.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";
import { GROUP_LEVERS_TEXT } from "./groupLevers.js";
import { OPTIONS_O2C_TEXT, previousChapterRewards } from "./optionsO2c.js";
import { chapterLevers, OPTIONS_CONTINUITY_TEXT, type ChapterLevers } from "./turnOptionsContinuity.js";

/*
 * The owner's option rules for group turns (eval only; the coordinator's brief
 * of 2026-10-01 evening, decision A settled as everything: "Your option rules
 * for group turns (one reward a chapter, a strong reason for a second
 * sacrifice, different stats)").
 *
 * The cause, in production's request and the third playthroughs' group
 * stories (a temporary probe over playthroughs-3.json, replayed with
 * playthroughReplay.ts; every group turn's request today's byte for byte; no
 * calls). The owner's O2c rules (optionsO2c.ts, production's optionLeverLine
 * and THREE_WAYS) reach a single player's rolled step only; a group's rolled
 * players get B6's rate line (groupLeverLine: a lever fits when none was
 * offered in the player's last two challenge turns, the other kind preferred),
 * which never looks at chapters, and a group's option instructions carry none
 * of O2b's variety lines. On the 103 rolled group sets of round 3:
 * - rewards came where the owner's rules give none 8 times in 14 (a chapter's
 *   later step, or the chapter after one with a reward: the food trucks' Omar
 *   12 → 19, B6's "prefer a reward" after a sacrifice), and sacrifices came on
 *   5 of the 20 sets that would be a chapter's reward turn;
 * - "prefer the other kind" alternated one stat both ways (Omar's Service
 *   Stamina 45 → 35 → 45 → 35);
 * - 95 of 103 sets failed primaryStatsDistinct and 78 had two options only
 *   risk tells apart (base 0, the same bonus or none: "Do not invent stat
 *   bonuses", every option +10 from the contract race), the group prompt
 *   saying nothing about variety;
 * - the strong-reason state (a second sacrifice the rate allows) came once
 *   (the estate agents' turn 25, a four-step chapter's last step).
 *
 * The variant is production's group turn with, on a group's rolled step
 * (takesGroupLeverRules), three edits:
 * - each rolled player's line computed per player and chapter as O2c computes
 *   a single player's (groupOptionsRule): the reward turn the game places (the
 *   chapter's first step, where that player's previous chapter offered no
 *   reward and a stat allows one: "offer a reward this turn if a stat allows
 *   one. No sacrifice this turn."), elsewhere no reward and a sacrifice where
 *   B6's rate fits, a second in the chapter only for a strong reason stated in
 *   the option's text, none where the rate gives none; a player whose roll the
 *   step discards (another player's own outcome, its owner in the thread)
 *   none, as production. O2c's words, so a group's rolled player reads the
 *   lines a single player reads;
 * - O2b's stat lines and its risk-only weak example (the single player's
 *   STATS_DIFFER, NEGATIVE_BASE_HOLDS and RISK_ONLY_WEAK) under a lead for a
 *   group's rolled players, after the option examples, where a single player's
 *   THREE_WAYS goes; B6's three ways themselves stay a single player's (never
 *   measured for groups);
 * - each rolled player's plan question asked from those lines (groupLeversB's
 *   question reworded: one reward or sacrifice where the line offers a reward
 *   or says a sacrifice fits; a second sacrifice only where the scene gives a
 *   strong reason; "None" where the line says none), since its "Say 'None' only
 *   where the line says none" would ask for a second sacrifice wherever the
 *   strong-reason line stands.
 * Everything else production's request byte for byte: the reward exception,
 * GROUP_SHARED_AND_OWN, NO_DOUBLE_SACRIFICE, a player exploring beside the
 * others, every other turn.
 *
 * Adopted after the run of 2026-10-01 (evening): production's copy is
 * optionRules.ts (GROUP_OPTION_VARIETY, groupRewardTurn, groupLeverRule,
 * groupLeverLine, GROUP_LEVER_QUESTION), and the kept tests hold production to
 * groupOptions byte for byte, prompt and JSON schema. The variant builds on
 * production with those lines and that question taken out (groupOptionsBase,
 * withoutGroupOptions; the rate line production printed before is
 * groupRateLine), so it still builds as measured.
 */

const LABEL = "Group-options turn";

/** The option examples after which a single player's THREE_WAYS goes, and the group's variety lines here. */
const DIVERSION_ANCHOR = "--- Bad: 'Create a diversion'. Good: 'Divert the guards by throwing some gold coins around.'\n";

/** O2b's stat lines (OPTIONS_CONTINUITY_TEXT.o2Stats, o2NegativeBase, riskOnlyWeak) for a group's rolled players. */
const VARIETY = `- In a Challenge or Contest thread, each player's three options draw on different stats:
${OPTIONS_CONTINUITY_TEXT.o2Stats.replace("--- The options also draw on different stats: no two", "--- No two")}
${OPTIONS_CONTINUITY_TEXT.o2NegativeBase}
${OPTIONS_CONTINUITY_TEXT.riskOnlyWeak}
`;

/** The rolled players' plan question, asked from the lines this variant prints. */
const LEVER_QUESTION =
  "Based on the stats' options to sacrifice and options to gain as reward attributes, and this player's sacrifice-or-reward line in the option instructions: where the line offers a reward or says a sacrifice fits this turn, describe exactly one such option (total) for this beat, on one of this player's own stats where one allows it, and the reason this scene gives for it. Where the line allows another sacrifice only for a strong reason, describe one only if this scene gives such a reason, and state that reason. Say 'None' where the line says none this turn, or where no stat allows one.";

const NONE_THIS_TURN = "Sacrifice or reward: none this turn.";
const PREFIX = "Sacrifice or reward: ";

/** Whether some stat's rules allow a reward (its optionsToGainAsReward isn't "None"). */
function rewardAllowed(story: Story): boolean {
  const state = story.getState();
  return [...state.sharedStats, ...state.playerStats].some((stat) => allowsLever(stat, "reward"));
}

/**
 * The reward turn the game places for a group's rolled player: a group chapter's first step, where that player's
 * previous chapter offered no reward (offered, chosen or not) and some stat allows one. At most one a chapter per
 * player, never two chapters running.
 */
export function groupRewardTurn(story: Story, slot: string): boolean {
  if (!takesGroupLeverRules(story) || !groupLeverSlots(story).includes(slot)) return false;
  return story.getCurrentThreadBeatsCompleted() === 0 && previousChapterRewards(story, slot) === 0 && rewardAllowed(story);
}

/** What a rolled player's line allows: a reward (the reward turn only), and a sacrifice that fits, none, or a second only for a strong reason; none where the step discards the player's roll. */
export type GroupOptionsRule = { reward: boolean; sacrifice: "fits" | "none" | "strongReason"; ownersRoll?: true };

export function groupOptionsRule(story: Story, slot: string): GroupOptionsRule {
  const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
  const owner = thread ? ThreadResolutionService.rollingOwner(thread, story) : undefined;
  if (owner !== undefined && owner !== slot) return { reward: false, sacrifice: "none", ownersRoll: true };
  if (groupRewardTurn(story, slot)) return { reward: true, sacrifice: "none" };
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

/** A rolled player's line in the variant, in O2c's words: the reward turn's, a sacrifice that fits, a second only for a strong reason, or none. */
export function groupOptionsLine(story: Story, slot: string): string {
  const rule = groupOptionsRule(story, slot);
  if (rule.reward) return OPTIONS_O2C_TEXT.rewardTurn;
  if (rule.sacrifice === "none") return NONE_THIS_TURN;
  if (rule.sacrifice === "fits") return OPTIONS_O2C_TEXT.sacrificeFits;
  return `${PREFIX}this thread already offered ${sacrificesSoFar(chapterLevers(story, slot))}, ${OPTIONS_O2C_TEXT.strongReason}. No reward this turn.`;
}

/** The passages the tests pin. */
export const GROUP_OPTIONS_TEXT = { diversionAnchor: DIVERSION_ANCHOR, variety: VARIETY, leverQuestion: LEVER_QUESTION };

/**
 * The line production printed for a rolled group player before the adoption, which the stage measured beside the
 * variant: B6's rate (sacrificeRewardLine) on the player's own history, none where the step discards their roll.
 */
export function groupRateLine(story: Story, slot: string): string {
  const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
  const owner = thread ? ThreadResolutionService.rollingOwner(thread, story) : undefined;
  return owner !== undefined && owner !== slot ? NONE_THIS_TURN : sacrificeRewardLine(story, slot);
}

const headOf = (story: Story, slot: string) => {
  const name = story.getPlayer(slot)?.name;
  return `----- ${slot}${name ? ` (${name})` : ""}: `;
};

/**
 * Production's group prompt with the adopted group-options edits taken out (a group's rolled step: the variety lines,
 * each rolled player's line by the owner's rules back to the rate line; any other turn, and a prompt without them, as
 * it is). The kept tests read production as it stood before through it too (beforeGroupOptions in adoptedDeltas.ts).
 */
export function withoutGroupOptions(prompt: string, story: Story): string {
  if (!takesGroupLeverRules(story) || !prompt.includes(VARIETY)) return prompt;
  let undone = replaceOnce(LABEL, prompt, `${DIVERSION_ANCHOR}${VARIETY}`, DIVERSION_ANCHOR);
  for (const slot of groupLeverSlots(story)) {
    undone = replaceOnce(LABEL, undone, `${headOf(story, slot)}${groupLeverLine(story, slot).replace(PREFIX, "")}\n`, `${headOf(story, slot)}${groupRateLine(story, slot).replace(PREFIX, "")}\n`);
  }
  return undone;
}

/**
 * Production's group turn as the stage measured it beside the variant. Since the adoption (2026-10-01, decision A)
 * production prints the variant's lines and question on a rolled group step (optionRules.ts: GROUP_OPTION_VARIETY,
 * groupLeverLine, GROUP_LEVER_QUESTION), so they are taken out there (the texts are the variant's, which a test holds):
 * the rate lines back, and groupLeversB's question in the rolled players' fields. Every other turn is production's as
 * it is.
 */
export function groupOptionsBase(story: Story): TextRequest<z.AnyZodObject> {
  const production = beatStep.request(story);
  if (!takesGroupLeverRules(story)) return production;
  return { prompt: withoutGroupOptions(production.prompt, story), schema: schemaWithQuestion(production.schema, groupLeverSlots(story), GROUP_LEVERS_TEXT.leverQuestionB) };
}

/** A rolled player's beat schema with the plan question asked from the variant's lines. */
function playerWithQuestion(player: z.AnyZodObject, question: string): z.AnyZodObject {
  const plan = player.shape.plan;
  if (!(plan instanceof z.ZodObject)) throw new Error(`${LABEL}: the plan is not an object schema`);
  const considerations = plan.shape.optionConsiderations;
  if (!(considerations instanceof z.ZodUnion)) throw new Error(`${LABEL}: optionConsiderations is not a union`);
  const [asText, detailed] = considerations.options as [z.ZodTypeAny, z.ZodTypeAny];
  if (!(detailed instanceof z.ZodObject)) throw new Error(`${LABEL}: optionConsiderations has no object form`);
  const lever = detailed.shape.upToOneSacrificeOrRewardOption;
  if (!(lever instanceof z.ZodString)) throw new Error(`${LABEL}: the lever question is not a string`);
  const union = z.union([asText, detailed.extend({ upToOneSacrificeOrRewardOption: lever.describe(question) })]);
  return player.extend({ plan: plan.extend({ optionConsiderations: considerations.description === undefined ? union : union.describe(considerations.description) }) });
}

/** The reply schema with each rolled player's question set; slots sharing one instance keep sharing one, as production's do. */
function schemaWithQuestion(root: z.AnyZodObject, slots: string[], question: string): z.AnyZodObject {
  const editedOf = new Map<unknown, z.AnyZodObject>();
  const edited = Object.fromEntries(
    slots.map((slot) => {
      const player = root.shape[slot];
      if (!(player instanceof z.ZodObject)) throw new Error(`${LABEL}: ${slot} is not an object schema`);
      const known = editedOf.get(player) ?? playerWithQuestion(player, question);
      editedOf.set(player, known);
      return [slot, known];
    })
  );
  return root.extend(edited);
}

/** Production's group turn (as measured) with the owner's option rules on a group's rolled step; production's request byte for byte elsewhere. */
export function groupOptionsRequest(story: Story): TextRequest<z.AnyZodObject> {
  const production = groupOptionsBase(story);
  if (!takesGroupLeverRules(story)) return production;
  const slots = groupLeverSlots(story);
  const { instructions, state } = splitAtState(LABEL, production.prompt);
  let edited = replaceOnce(LABEL, instructions, DIVERSION_ANCHOR, `${DIVERSION_ANCHOR}${VARIETY}`);
  for (const slot of slots) {
    edited = replaceOnce(LABEL, edited, `${headOf(story, slot)}${groupRateLine(story, slot).replace(PREFIX, "")}\n`, `${headOf(story, slot)}${groupOptionsLine(story, slot).replace(PREFIX, "")}\n`);
  }
  return { prompt: edited + state, schema: schemaWithQuestion(production.schema, slots, LEVER_QUESTION) };
}
