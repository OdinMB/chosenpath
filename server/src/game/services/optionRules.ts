import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import { getThreadType, type Beat } from "core/types/index.js";
import { allowsLever } from "./leverPayments.js";
import { ThreadResolutionService } from "./ThreadResolutionService.js";

/*
 * The option rules (turn doc B6), adopted on 2026-09-28 for single-player
 * challenge and contest chapter steps, the turns whose options are rolled:
 * three different ways to act that a player can tell apart, a base-point
 * scale that separates them, at most two stat bonuses from the approach
 * itself, the reward exception, and a lever line the game computes from the
 * player's history (a sacrifice or reward fits when none was offered in the
 * last two rolled turns, the other kind preferred). As the setup-to-play
 * chain ran them (variant turnB6, today's turn form with B6 alone). Group
 * turns stayed on today's form (B6 was never built or measured for groups)
 * until the group-levers stage of 2026-10-01, which gave each player in a
 * group's challenge or contest thread B6's lever parts (below,
 * groupSacrificeRewardLines). Since the options-o2c stage of the same day a
 * single player's three ways carry O2b's stat lines and the single player's
 * lever line is the one the game computes from B6's rate and the chapters
 * (optionLeverLine, below); since the group-options stage (decision A, that
 * evening) a group's rolled players get the same rules per player and chapter
 * (groupLeverLine) and O2b's stat lines (GROUP_OPTION_VARIETY). BeatPromptService prints the lines,
 * storyTextSteps.beatStep puts the field texts in the schema;
 * adoptedTurns.test.ts holds both equal to the measured forms.
 */

/*
 * Option variety with fewer rewards (the options-o2c stage of 2026-10-01,
 * measured as the eval's turnO2c, storyTextRounds/optionsO2c.ts): after the
 * third way, O2b's stat lines (the options draw on different stats, a lever
 * option needs no bonus, risk alone never tells two apart, no option names its
 * stat; the option that plays to the strength keeps -5 to -15), and after B6's
 * weak example the risk-only one. Measured twice on the 32 stored rolled steps
 * beside production: main stats distinct 13% -> 47% of sets, sets with a second
 * sacrifice in the chapter 28% -> 9%, reasoning tokens level.
 */
const STATS_DIFFER =
  "--- The options also draw on different stats: no two take their main stat bonus from the same stat, and at most one option that is neither a sacrifice nor a reward has no stat bonus (as far as the stats' current values give bonuses). A sacrifice or reward option needs no stat bonus: what it spends or gains already sets it apart. Risk alone never tells two options apart. An option's words say what the character does; they never name the stat its bonus comes from.";
const NEGATIVE_BASE_HOLDS =
  "--- Drawing on different stats doesn't change basePoints: the option that plays to the character's strength still takes -5 to -15, even when every option earns a bonus.";
const RISK_ONLY_WEAK = "--- Weak: three options that each earn +10 from Nerve and differ only in how risky they are.";

export const THREE_WAYS = `- The three options are three different ways to act, and a player can tell them apart from their words alone (players see nothing else before they choose):
--- one is the sensible approach to the moment;
--- one plays to the character's strength, asset or contact: tempting, but not the obvious move;
--- one costs or risks something the others don't (a sacrifice, a chased reward, a relationship put on the line), or serves a different stake of the character's.
${STATS_DIFFER}
${NEGATIVE_BASE_HOLDS}
--- Weak: "Use your speech skill to…" / "Use your charm to…" / "Use your knowledge of law to…" (one approach three times)
${RISK_ONLY_WEAK}
--- Good: "Quote the Guild's own charter back to Sir Bram, clause by clause." / "Bring Gruk's enclave into the hall to stand silently behind you." / "Offer Sir Bram a public apology from the movement (-10% Public Support) in exchange for a hearing."
- A story element's Instructions can supply the tempting or the costly option.`;

export const REWARD_EXCEPTION =
  "A reward option is the one exception: it turns aside from the goal for a moment to gain something, like grabbing a healing plant while chasing a foe.";

export const NO_DOUBLE_SACRIFICE = "Don't offer to sacrifice a stat that was already sacrificed in this thread (see the CHOSEN OPTION lines).";

const BASE_POINTS = `How sensible this approach is before stats: 0 for the approach a sensible person would take; +5 for one that uses something the story has established (a clue found, an ally's promise); -5 to -15 for one that tempts because it plays to the character's strengths or assets (so it earns stat bonuses) but is not the obvious approach. Sacrifice options +${POINTS_FOR_SACRIFICE}, reward options ${POINTS_FOR_REWARD}.`;

const BONUSES =
  "At most two, from the stats this option's approach relies on, at their current values. A stat that fits the whole step rather than this option's approach gives no bonus.";

/** Today's options field, which B6 extends with the reward exception. */
const OPTIONS_FIELD =
  "Exactly 3 choices for the player. Don't allow the player to leave the scene, suddenly do something else, or derail the core theme of the switch/thread. Only mention the action/decision of the player, not the consequences. Remember that both sacrifices and rewards are certain and not just risks or potential rewards. There can only ever be a total of zero or one sacrifice/reward option among the 3 options. Don't repeat similar options to what this player was offered before in the same thread.";
const OPTIONS_FIELD_WITH_REWARD = OPTIONS_FIELD.replace(
  "derail the core theme of the switch/thread.",
  "derail the core theme of the switch/thread; a reward option is the one exception."
);

/** The plan field's "(Many beats are better…)", which the lever line replaces. */
const MANY_BEATS = " (Many beats are better without any sacrifice or reward options.)";

/** Whether this turn's options take B6: a single player's challenge or contest chapter step (the rolled options). */
export function takesOptionRules(story: Story): boolean {
  if (story.isMultiplayer() || story.getCurrentBeatType() !== "thread") return false;
  const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes("player1") || t.playersSideB.includes("player1"));
  return thread !== undefined && getThreadType(thread) !== "exploration";
}

/*
 * The exploration-order line (the choice-result stage of 2026-09-30, measured
 * as the eval's choiceResult): on an exploration step the game records the
 * chosen option by its position as the step's result (BeatResolutionService:
 * option n is resolution n), and the playthroughs' turns wrote options that
 * carry out another result, or none, so the next turn told the recorded
 * result instead of the choice. Adopted for group turns first (a group's
 * options followed their results 0 of 6 -> 6 of 6 with nothing else moved),
 * then for a single player (the choice-line-sp stage, the same day): with
 * production's one retry of a short reply in the loop, a single player's
 * options at their own result 12 of 20 -> 19 of 20 on the replies the game
 * keeps, nothing moved the wrong way and the waits within their allowances;
 * the choice-result run's 3 of 20 one-paragraph replies with the line were
 * 0 of 20 there (production's own 3 of 20, each rescued by the retry).
 * BeatPromptService prints it after the option types; adoptedTurns.test.ts
 * holds it to the measured form.
 */
export const EXPLORATION_ORDER =
  "--- In an Exploration thread, a player's three options are the current step's three possible outcomes, in their order: option 1 is Resolution 1, option 2 is Resolution 2 and option 3 is Resolution 3, each the same action in the same direction, without its consequences, in the scene's own words. The game records the chosen option's resolution as what the player did, so an option that says something else sends the story where the player didn't choose. The beat text leads up to the three and carries out none of them.\n";

/** Whether this turn takes the exploration-order line: a chapter step where some player's thread is an exploration thread, every player count. */
export function takesExplorationOrder(story: Story): boolean {
  if (story.getCurrentBeatType() !== "thread") return false;
  return (story.getCurrentThreadAnalysis()?.threads ?? []).some((thread) => getThreadType(thread) === "exploration");
}

const isChallengeTurn = (beat: Beat) => (beat.options ?? []).length > 0 && beat.options.every((o) => o.optionType === "challenge");
const leverOf = (beat: Beat) => (beat.options ?? []).find((o) => o.resourceType !== "normal")?.resourceType;

/**
 * B6's rate, from the options stored in this player's history (offered and
 * not chosen alike): a lever fits when none was offered in the player's last
 * two challenge or contest turns, and the line names the last one offered and
 * prefers the other kind. A turn can't count this itself, since it sees a
 * lever's tag only on chosen options.
 */
export function sacrificeRewardLine(story: Story, slot: string): string {
  const history = story.getPlayer(slot)?.beatHistory ?? [];
  const challengeTurns = history.map((beat, index) => ({ beat, index })).filter(({ beat }) => isChallengeTurn(beat));
  if (challengeTurns.slice(-2).some(({ beat }) => leverOf(beat) !== undefined)) return "Sacrifice or reward: none this turn.";
  const last = [...challengeTurns].reverse().find(({ beat }) => leverOf(beat) !== undefined);
  if (!last) return "Sacrifice or reward: one fits this turn if a stat allows it.";
  const kind = leverOf(last.beat) as string;
  const other = kind === "sacrifice" ? "reward" : "sacrifice";
  const ago = history.length - last.index;
  return `Sacrifice or reward: one fits this turn if a stat allows it (the last one offered was a ${kind}, ${ago} turn${ago === 1 ? "" : "s"} ago; prefer a ${other}).`;
}

/*
 * A single player's lever line (the options-o2c stage of 2026-10-01, measured as
 * the eval's turnO2c and adopted; the owner on O2b: "14 reward options in 32
 * choice sets is a bit too much. At most one reward is good. Several sacrifices
 * can sometimes make sense, but should have a strong justification starting at
 * the second one"). The game places a chapter's one reward (rewardTurn): the
 * chapter's first step, where the player's previous chapter offered no reward
 * (offered, chosen or not) and some stat's rules allow one, with no sacrifice
 * beside it; so at most one a chapter and never two chapters running, about one
 * chapter in two or three once a reward isn't always taken. Elsewhere no
 * reward, and a sacrifice where B6's rate allows one (sacrificeRewardLine), a
 * second in the chapter only for a strong reason in the option's text; today's
 * "none this turn" where the rate gives none. Measured twice on the 32 stored
 * rolled steps beside production: rewards 10 of 64 sets (target about 4-6 per
 * 32), all on the reward turn (10 of 10) and none elsewhere (production 4 of
 * 54), sacrifices 24 -> 12, second sacrifices 18 -> 6. A group's players kept
 * B6's rate line until the group-options stage (decision A, the evening of
 * 2026-10-01), which measured the same rules for them and adopted them
 * (groupLeverLine and GROUP_OPTION_VARIETY, below).
 */
const NONE_THIS_TURN = "Sacrifice or reward: none this turn.";
const REWARD_TURN = "Sacrifice or reward: offer a reward this turn if a stat allows one. No sacrifice this turn.";
const SACRIFICE_FITS = "Sacrifice or reward: a sacrifice fits this turn if a stat allows it. No reward this turn.";

const offeredIn = (beats: Beat[], kind: string) => beats.reduce((sum, beat) => sum + (beat.options ?? []).filter((o) => o.resourceType === kind).length, 0);

/** The current chapter's beats in this player's history so far. */
function chapterBeats(story: Story, slot: string): Beat[] {
  if (story.getCurrentBeatType() !== "thread") return [];
  const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
  return thread ? (story.getThreadBeatTexts(thread)[slot] ?? []) : [];
}

/** The rewards the player's previous chapter (the last thread they played before the current one) offered, chosen or not; 0 before any. */
function previousChapterRewards(story: Story, slot: string): number {
  const phases = story.getState().storyPhases;
  const current = story.getCurrentThreadAnalysis();
  for (let i = phases.length - 1; i >= 0; i--) {
    const phase = phases[i];
    if (!("threads" in phase) || phase === current) continue;
    const thread = phase.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
    if (thread) return offeredIn(story.getThreadBeatTexts(thread)[slot] ?? [], "reward");
  }
  return 0;
}

const rewardAllowed = (story: Story) => {
  const state = story.getState();
  return [...state.sharedStats, ...state.playerStats].some((stat) => allowsLever(stat, "reward"));
};

/** The reward turn the game places: a single player's rolled chapter step that is the chapter's first, after a chapter that offered no reward, where a stat allows one. */
export function rewardTurn(story: Story, slot: string): boolean {
  if (!takesOptionRules(story) || slot !== "player1") return false;
  return story.getCurrentThreadBeatsCompleted() === 0 && previousChapterRewards(story, slot) === 0 && rewardAllowed(story);
}

const WORDS = ["no", "one", "two", "three", "four", "five"];
const inWords = (n: number) => WORDS[n] ?? String(n);

/** The sacrifices this player's chapter offered so far (chosen or not); 0 before any. */
const chapterSacrifices = (story: Story, slot: string) => offeredIn(chapterBeats(story, slot), "sacrifice");

/** The line where the chapter already offered this player a sacrifice: another only for a strong reason stated in the option's text, and no reward. */
function strongReasonLine(story: Story, slot: string): string {
  const beats = chapterBeats(story, slot);
  const sacrifices = offeredIn(beats, "sacrifice");
  const taken = beats.filter((beat) => beat.choice >= 0 && beat.options?.[beat.choice]?.resourceType === "sacrifice").length;
  const soFar =
    sacrifices === 1
      ? `a sacrifice, which the player ${taken > 0 ? "took" : "didn't take"}`
      : `${inWords(sacrifices)} sacrifices, and the player took ${taken === 0 ? "none of them" : taken === sacrifices ? (sacrifices === 2 ? "both" : "all of them") : `${inWords(taken)} of them`}`;
  return `Sacrifice or reward: this thread already offered ${soFar}, so offer another sacrifice only if the scene gives a strong reason for it, and make that reason clear in the option's text. No reward this turn.`;
}

/** A single player's lever line on a rolled chapter step, in B6's line's place: the reward turn's, a sacrifice that fits, a second only for a strong reason, or none. */
export function optionLeverLine(story: Story, slot: string): string {
  if (rewardTurn(story, slot)) return REWARD_TURN;
  if (sacrificeRewardLine(story, slot) === NONE_THIS_TURN) return NONE_THIS_TURN;
  return chapterSacrifices(story, slot) === 0 ? SACRIFICE_FITS : strongReasonLine(story, slot);
}

/*
 * A group's sacrifices and rewards (the group-levers stage of 2026-10-01,
 * measured as the eval's groupLeversB, the stage's fix-and-retest). B6 was a
 * single player's only, so a group's challenge or contest step had no lever
 * line, kept the plan question's "(Many beats are better without any
 * sacrifice or reward options.)" and had no reward exception: the second
 * playthroughs' three group stories offered 1 lever in 105 rolled option sets
 * (B6's line would have invited one in 103), every group plan answering
 * "None", and the players' own stats moved only at switches. Now each player
 * in a challenge or contest thread on a group's chapter step gets B6's lever
 * parts: the reward exception, that player's computed line (sacrificeRewardLine
 * on their own history), one sentence for a group (a shared stat's lever goes
 * to one player a turn, which the sharedLeverRepeated repair enforces; the
 * player's own stats first), NO_DOUBLE_SACRIFICE, and in that player's fields
 * the options field's reward exception and the plan's lever question asked
 * from the line (GROUP_LEVER_QUESTION). Measured on twelve group chapter steps
 * of the second playthroughs, twice: sets with a lever 0 of 50 -> 25 of 50,
 * on the player's own stat 0 -> 21, rewards 0 -> 8, none where the line said
 * none, sets that only risk tells apart 88% -> 74%, waits level. B6's other
 * parts (the three ways, the base-point scale, at most two bonuses) stay a
 * single player's: they were not measured for groups. Since the group-options
 * stage (the same evening) each player's line follows the owner's rules per
 * chapter (groupLeverLine) and the plan's question is asked from those lines.
 */
export const GROUP_SHARED_AND_OWN =
  "A sacrifice or reward on one of a player's own stats is that player's alone; one on a shared stat spends or gains for the whole group, so offer it to one player at most this turn. Prefer the player's own stats where they allow one.";

/**
 * The plan's lever question for a player in a group's challenge or contest thread: asked from the player's computed
 * line (groupLeversB's question, reworded at the group-options stage for that stage's lines: one where the line offers
 * a reward or says a sacrifice fits; a second sacrifice only where the scene gives a strong reason; "None" where the
 * line says none, since groupLeversB's "Say 'None' only where the line says none" would ask for a second sacrifice
 * wherever the strong-reason line stands).
 */
export const GROUP_LEVER_QUESTION =
  "Based on the stats' options to sacrifice and options to gain as reward attributes, and this player's sacrifice-or-reward line in the option instructions: where the line offers a reward or says a sacrifice fits this turn, describe exactly one such option (total) for this beat, on one of this player's own stats where one allows it, and the reason this scene gives for it. Where the line allows another sacrifice only for a strong reason, describe one only if this scene gives such a reason, and state that reason. Say 'None' where the line says none this turn, or where no stat allows one.";

/*
 * The owner's option rules for a group's rolled players (the group-options
 * stage, decision A of the evening of 2026-10-01: "one reward a chapter, a
 * strong reason for a second sacrifice, options on different stats, not only
 * risk"; measured as the eval's groupOptions and adopted). Until then a group's
 * rolled players got B6's rate line, which never looks at chapters, and a
 * group's options carried none of O2b's variety lines: in the third
 * playthroughs 8 of 14 group rewards fell off a chapter's first step or in the
 * chapter after one with a reward, and 78 of 103 rolled sets had two options
 * only risk tells apart. Now each rolled player's line is computed per player
 * and chapter as a single player's is (groupLeverRule: the reward turn the game
 * places, a sacrifice on B6's rate, a second only for a strong reason, none),
 * none where the step discards the player's roll, and their options get O2b's
 * stat lines (GROUP_OPTION_VARIETY, BeatPromptService prints it after the option
 * examples). Measured on twelve group steps of the third playthroughs, twice:
 * rewards off the reward turn 9 of 32 -> 0, rewards on it 4 of 16 -> 11,
 * sacrifices where one fits 9 of 24 -> 19, main stats distinct 1 -> 11 of 48,
 * only-risk sets 36 -> 18 of 48, none where the rules say none; reasoning
 * tokens +31% (not moved), the odds level.
 */
export const GROUP_OPTION_VARIETY = `- In a Challenge or Contest thread, each player's three options draw on different stats:
${STATS_DIFFER.replace("--- The options also draw on different stats: no two", "--- No two")}
${NEGATIVE_BASE_HOLDS}
${RISK_ONLY_WEAK}`;

/**
 * The reward turn the game places for a group's rolled player: a group chapter's first step, where that player's
 * previous chapter offered no reward (offered, chosen or not) and some stat allows one; at most one a chapter per
 * player, never two chapters running.
 */
export function groupRewardTurn(story: Story, slot: string): boolean {
  if (!groupLeverSlots(story).includes(slot)) return false;
  return story.getCurrentThreadBeatsCompleted() === 0 && previousChapterRewards(story, slot) === 0 && rewardAllowed(story);
}

/** What a rolled group player's line allows: a reward (the reward turn only), and a sacrifice that fits, none, or a second only for a strong reason; none where the step discards the player's roll. */
export type GroupLeverRule = { reward: boolean; sacrifice: "fits" | "none" | "strongReason"; ownersRoll?: true };

export function groupLeverRule(story: Story, slot: string): GroupLeverRule {
  const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
  const owner = thread ? ThreadResolutionService.rollingOwner(thread, story) : undefined;
  if (owner !== undefined && owner !== slot) return { reward: false, sacrifice: "none", ownersRoll: true };
  if (groupRewardTurn(story, slot)) return { reward: true, sacrifice: "none" };
  if (sacrificeRewardLine(story, slot) === NONE_THIS_TURN) return { reward: false, sacrifice: "none" };
  return { reward: false, sacrifice: chapterSacrifices(story, slot) > 0 ? "strongReason" : "fits" };
}

/** The players in a challenge or contest thread on a group's chapter step, in seat order; none on any other turn, and none for a single player (B6 is theirs). */
export function groupLeverSlots(story: Story): string[] {
  if (!story.isMultiplayer() || story.getCurrentBeatType() !== "thread") return [];
  const threads = story.getCurrentThreadAnalysis()?.threads ?? [];
  return story.getPlayerSlots().filter((slot) => {
    const thread = threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
    return thread !== undefined && getThreadType(thread) !== "exploration";
  });
}

/** Whether a turn takes the group's lever parts: a group's chapter step with a player in a challenge or contest thread. */
export function takesGroupLeverRules(story: Story): boolean {
  return groupLeverSlots(story).length > 0;
}

/*
 * A group's levers and the owner's roll (the review of 2026-10-01). On one
 * player's own outcome, with that owner in the thread, only the owner's roll
 * decides a challenge or contest step (ThreadResolutionService.rollingOwner;
 * the owner's decision of that morning, "Yes, only count the owner's roll.").
 * The group-levers stage, later that day, gave every rolled player B6's rate
 * line all the same, so the other players in that thread were invited to a
 * lever whose points land on a roll the game discards: a reward a free stat
 * gain, a sacrifice a stat paid for nothing (the payment is charged whatever
 * the roll). Their line now says none this turn, the measured line's own
 * wording for none (groupLeversB's replies offered no lever where it said
 * none); they keep the lever fields, whose question then answers "None". A
 * logged delta on groupLeversB, unmeasured: the stage's one case of that shape
 * (the estate agents' turn 20, both agents on Nia's own protégé outcome) drew
 * no lever in any arm.
 */

/**
 * A rolled group player's line (since the group-options stage, the owner's rules per player and chapter, in a single
 * player's words): the reward turn's, a sacrifice that fits, a second only for a strong reason, or none; none where
 * their roll doesn't count (another player's own outcome, that owner in the thread). B6's rate line (sacrificeRewardLine)
 * before.
 */
export function groupLeverLine(story: Story, slot: string): string {
  const rule = groupLeverRule(story, slot);
  if (rule.reward) return REWARD_TURN;
  if (rule.sacrifice === "none") return NONE_THIS_TURN;
  return rule.sacrifice === "fits" ? SACRIFICE_FITS : strongReasonLine(story, slot);
}

/** The lines after the "0 or 1 sacrifice/reward option" rule on a group's rolled step: each rolled player's computed line, the group sentence, no second sacrifice. */
export function groupSacrificeRewardLines(story: Story): string {
  const lines = groupLeverSlots(story).map((slot) => {
    const name = story.getPlayer(slot)?.name;
    const line = groupLeverLine(story, slot).replace("Sacrifice or reward: ", "");
    return `----- ${slot}${name ? ` (${name})` : ""}: ${line}\n`;
  });
  return `--- Sacrifice or reward, for each player in a Challenge or Contest thread (each player's own options):\n${lines.join("")}--- ${GROUP_SHARED_AND_OWN}\n--- ${NO_DOUBLE_SACRIFICE}\n`;
}

function asObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`Option rules: ${label} is not an object schema`);
  return schema;
}

function asArray(schema: unknown, label: string): z.ZodArray<z.ZodTypeAny> {
  if (!(schema instanceof z.ZodArray)) throw new Error(`Option rules: ${label} is not an array schema`);
  return schema;
}

/** Today's option kinds with B6's fields: the base-point scale and at most two bonuses. */
function optionsWithRules(options: z.ZodArray<z.ZodTypeAny>): z.ZodTypeAny {
  const union = options.element;
  if (!(union instanceof z.ZodDiscriminatedUnion)) throw new Error("Option rules: options are not a discriminated union");
  const [exploration, challenge] = (union.options as z.AnyZodObject[]).map((o, i) => asObject(o, `option kind ${i + 1}`));
  const modifiers = asArray(challenge.shape.modifiersToSuccessRate, "modifiersToSuccessRate");
  const edited = z.discriminatedUnion("optionType", [
    exploration,
    challenge.extend({
      optionType: challenge.shape.optionType,
      basePoints: challenge.shape.basePoints.describe(BASE_POINTS),
      modifiersToSuccessRate: z.array(modifiers.element).max(2).describe(BONUSES),
    }),
  ]);
  return z.array(edited).describe(OPTIONS_FIELD_WITH_REWARD);
}

/** The plan's option considerations without "(Many beats are better…)": the lever line says when one fits. */
function planWithRules(plan: z.AnyZodObject): z.AnyZodObject {
  const considerations = plan.shape.optionConsiderations;
  if (!(considerations instanceof z.ZodUnion)) throw new Error("Option rules: optionConsiderations is not a union");
  const [asText, detailed] = considerations.options as [z.ZodTypeAny, z.AnyZodObject];
  const object = asObject(detailed, "optionConsiderations object");
  const lever = object.shape.upToOneSacrificeOrRewardOption;
  const union = z.union([asText, object.extend({ upToOneSacrificeOrRewardOption: lever.describe((lever.description ?? "").replace(MANY_BEATS, "")) })]);
  return plan.extend({ optionConsiderations: considerations.description === undefined ? union : union.describe(considerations.description) });
}

/** A single player's beat schema with B6's field texts on player1's plan and options. */
export function beatSchemaWithOptionRules(root: z.AnyZodObject): z.AnyZodObject {
  const player = asObject(root.shape.player1, "player1");
  if (asArray(player.shape.options, "options").description !== OPTIONS_FIELD) throw new Error("Option rules: the options field's description changed");
  const player1 = player.extend({ plan: planWithRules(asObject(player.shape.plan, "plan")), options: optionsWithRules(asArray(player.shape.options, "options")) });
  return root.extend({ player1 });
}

/** A group player's plan with the lever question asked from the player's line (GROUP_LEVER_QUESTION). */
function planWithGroupQuestion(plan: z.AnyZodObject): z.AnyZodObject {
  const considerations = plan.shape.optionConsiderations;
  if (!(considerations instanceof z.ZodUnion)) throw new Error("Option rules: optionConsiderations is not a union");
  const [asText, detailed] = considerations.options as [z.ZodTypeAny, z.AnyZodObject];
  const object = asObject(detailed, "optionConsiderations object");
  const lever = object.shape.upToOneSacrificeOrRewardOption;
  const union = z.union([asText, object.extend({ upToOneSacrificeOrRewardOption: lever.describe(GROUP_LEVER_QUESTION) })]);
  return plan.extend({ optionConsiderations: considerations.description === undefined ? union : union.describe(considerations.description) });
}

/**
 * A group's beat schema with the lever fields for each player in a challenge or contest thread: the options field's
 * reward exception and the plan's lever question asked from the player's line; slots sharing one instance keep sharing
 * one, as the schema builds them; the other players' fields unchanged.
 */
export function beatSchemaWithGroupLevers(root: z.AnyZodObject, story: Story): z.AnyZodObject {
  const editedOf = new Map<unknown, z.AnyZodObject>();
  const players = Object.fromEntries(
    groupLeverSlots(story).map((slot) => {
      const player = asObject(root.shape[slot], slot);
      const known = editedOf.get(player);
      if (known) return [slot, known];
      const options = asArray(player.shape.options, "options");
      if (options.description !== OPTIONS_FIELD) throw new Error("Option rules: the options field's description changed");
      const edited = player.extend({ plan: planWithGroupQuestion(asObject(player.shape.plan, "plan")), options: options.describe(OPTIONS_FIELD_WITH_REWARD) });
      editedOf.set(player, edited);
      return [slot, edited];
    })
  );
  return root.extend(players);
}
