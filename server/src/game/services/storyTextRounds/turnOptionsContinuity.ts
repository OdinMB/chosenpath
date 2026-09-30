import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { getThreadType, type Beat, type Thread } from "core/types/index.js";
import type { TextRequest } from "../storyTextSteps.js";
import { StoryStatePromptService } from "../prompts/StoryStatePromptService.js";
import { replaceOnce, splitAtState } from "./roundEdits.js";
import { sacrificeRewardLine, todaysFormWithB6Request } from "./turnRound2.js";

/*
 * The owner's feedback of 2026-09-30 on the turns (eval only): option designs
 * that differ only in risk, sacrifices too common and rewards rare, and a turn
 * that opened as the one before it did. Three arms on production's
 * single-player turn form (the adopted form, built here from the frozen
 * round0 copy: today's form with the option rules, B6, on rolled chapter
 * steps, turn round 2's turnB6, and no chapter rules on a switch turn, the
 * owner's feedback of 2026-09-28), so no later production change moves them;
 * a test holds the base to production's request byte for byte.
 * - Arm O (options), on the turns B6 changes (a single player's challenge and
 *   contest chapter steps): each option draws on a different stat (no two
 *   take their main stat bonus from the same stat, at most one has none) and
 *   risk alone tells none apart, one line inside B6's three ways with a weak
 *   example; and the game's lever line counted per chapter (thread) from its
 *   history, on top of today's rate and never looser: at most one reward a
 *   chapter, the first sacrifice as today's rate allows, and from the second
 *   on (where the rate allows one) the line says one was offered and whether
 *   it was taken, so another comes only for a strong reason the option's text
 *   makes clear.
 * - Arm C (continuity), on every turn after the first: a chapter's first step
 *   gets the switch's full text (the one turn whose previous beat the state
 *   shows only as a summary), and one instruction replaces the narrow "continue
 *   exactly where" lines of the prompt and the text field: pick up where the
 *   previous beat ended and move the story forward.
 * - Arm OC: both.
 * Edits are anchored on production's wording, each exactly once (roundEdits.ts).
 * Model-facing text says "thread" and "beat".
 */

const LABEL = "Options and continuity turn";

export type OptionsContinuityArm = { options: boolean; continuity: boolean };

// ---------------------------------------------------------------- the base: production's form

/** The chapter rules as the measured switch turn printed them last (the story's thread types and switch/thread instructions). */
const chapterRulesTail = (story: Story) => `\n${StoryStatePromptService.createStoryStatePrompt(story, { switchAndThreadInstructions: true })}`;

/**
 * Production's single-player turn as the eval measured it: turn round 2's
 * turnB6 (today's form with the option rules on rolled chapter steps) without
 * the chapter rules on a switch turn, the planners' only since the owner's
 * feedback of 2026-09-28. Single player: a contest's scoreboard ending rule,
 * production's other turn delta, needs two players.
 */
export function productionTurnForm(story: Story): TextRequest {
  const measured = todaysFormWithB6Request(story);
  if (story.getCurrentBeatType() !== "switch") return measured;
  const tail = chapterRulesTail(story);
  if (!measured.prompt.endsWith(tail)) throw new Error(`${LABEL}: the measured switch turn no longer ends with its chapter rules`);
  return { ...measured, prompt: measured.prompt.slice(0, -tail.length) };
}

// ---------------------------------------------------------------- arm O: the options

/** B6's third way, after which the stats line goes. */
const THIRD_WAY =
  "--- one costs or risks something the others don't (a sacrifice, a chased reward, a relationship put on the line), or serves a different stake of the character's.\n";
/** B6's weak example, after which the risk-only weak example goes. */
const WEAK_ONE_APPROACH = '--- Weak: "Use your speech skill to…" / "Use your charm to…" / "Use your knowledge of law to…" (one approach three times)\n';

// "a different stat", not "strength": the second way above is the one that plays to the character's strength
const DRAWS_ON_STATS =
  "--- Each option also draws on a different stat: no two take their main stat bonus from the same stat, and at most one has no stat bonus (as far as the stats' current values give bonuses). Risk alone never tells two options apart.";
const RISK_ONLY_WEAK = "--- Weak: three options that each earn +10 from Nerve and differ only in how risky they are.";

function threadOf(story: Story, slot: string): Thread | undefined {
  return story.getCurrentThreadAnalysis()?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
}

/** Whether arm O applies: a single player's challenge or contest chapter step, the turns B6 changes. */
function rollsOptions(story: Story): boolean {
  if (story.getCurrentBeatType() !== "thread") return false;
  const thread = threadOf(story, "player1");
  return thread !== undefined && getThreadType(thread) !== "exploration";
}

export type ChapterLevers = { rewards: number; sacrifices: number; sacrificesTaken: number };

/**
 * The levers this player's options offered in the current chapter (thread)
 * so far, offered and not chosen alike, and the sacrifices the player took:
 * the chapter's beats in the player's history, from its first beat on.
 */
export function chapterLevers(story: Story, slot: string): ChapterLevers {
  const thread = story.getCurrentBeatType() === "thread" ? threadOf(story, slot) : undefined;
  const beats = thread ? (story.getThreadBeatTexts(thread)[slot] ?? []) : [];
  const offered = (beat: Beat, kind: string) => (beat.options ?? []).filter((o) => o.resourceType === kind).length;
  return {
    rewards: beats.reduce((sum, beat) => sum + offered(beat, "reward"), 0),
    sacrifices: beats.reduce((sum, beat) => sum + offered(beat, "sacrifice"), 0),
    sacrificesTaken: beats.filter((beat) => beat.choice >= 0 && beat.options?.[beat.choice]?.resourceType === "sacrifice").length,
  };
}

/** What the chapter's lever line allows: a reward or not, and a sacrifice that fits, none, or one only for a strong reason. */
export type ChapterLeverRule = { reward: boolean; sacrifice: "fits" | "none" | "strongReason" };

const NONE_THIS_TURN = "Sacrifice or reward: none this turn.";

/**
 * Today's rate (B6) with the chapter's own counts on top, never looser: where
 * today's line gives none, none; where one fits, no second reward in a
 * chapter, and a sacrifice after the chapter's first only for a strong reason.
 * (A second sacrifice under a looser gate than a first would contradict the
 * rate the first one meets.)
 */
export function chapterLeverRule(story: Story, slot: string): ChapterLeverRule {
  if (sacrificeRewardLine(story, slot) === NONE_THIS_TURN) return { reward: false, sacrifice: "none" };
  const { rewards, sacrifices } = chapterLevers(story, slot);
  return { reward: rewards === 0, sacrifice: sacrifices > 0 ? "strongReason" : "fits" };
}

const WORDS = ["no", "one", "two", "three", "four", "five"];
const inWords = (n: number) => WORDS[n] ?? String(n);

function sacrificesSoFar({ sacrifices, sacrificesTaken }: ChapterLevers): string {
  if (sacrifices === 1) return `a sacrifice, which the player ${sacrificesTaken > 0 ? "took" : "didn't take"}`;
  const took = sacrificesTaken === 0 ? "none of them" : sacrificesTaken === sacrifices ? (sacrifices === 2 ? "both" : "all of them") : `${inWords(sacrificesTaken)} of them`;
  return `${inWords(sacrifices)} sacrifices, and the player took ${took}`;
}

const STRONG_REASON = "so offer another only if the scene gives a strong reason to pay again, and make that reason clear in the option's text";

/**
 * Arm O's lever line: today's line (B6's rate, from the player's last two
 * rolled turns) where it gives none or the chapter has offered no lever; else
 * the chapter's own counts in words: no reward once the chapter offered one,
 * and from the second sacrifice on, what was offered and taken, and another
 * only for a strong reason in the scene. It never asks for a lever.
 */
export function chapterLeverLine(story: Story, slot: string): string {
  const today = sacrificeRewardLine(story, slot);
  const levers = chapterLevers(story, slot);
  const rule = chapterLeverRule(story, slot);
  if (rule.sacrifice === "none" || (levers.rewards === 0 && levers.sacrifices === 0)) return today;
  const sacrifice = rule.sacrifice === "strongReason" ? `this thread already offered ${sacrificesSoFar(levers)}, ${STRONG_REASON}.` : "a sacrifice fits this turn if a stat allows it.";
  const reward = rule.reward ? "A reward fits this turn if a stat allows it." : "No reward: this thread already offered one.";
  return `Sacrifice or reward: ${sacrifice} ${reward}`;
}

function optionEdits(instructions: string, story: Story): string {
  let edited = replaceOnce(LABEL, instructions, THIRD_WAY, `${THIRD_WAY}${DRAWS_ON_STATS}\n`);
  edited = replaceOnce(LABEL, edited, WEAK_ONE_APPROACH, `${WEAK_ONE_APPROACH}${RISK_ONLY_WEAK}\n`);
  return replaceOnce(LABEL, edited, `--- ${sacrificeRewardLine(story, "player1")}\n`, `--- ${chapterLeverLine(story, "player1")}\n`);
}

// ---------------------------------------------------------------- arm C: continuity

const OLD_TEXT_START = "Text\n- The first paragraph must\n--- continue exactly where the previous beat for this player ended\n";
const OLD_CONTINUE = "--- continue exactly where the previous beat for this player ended";
const OLD_FIELD_START = "- Start exactly where the previous beat for this player ended.";

const PICK_UP =
  "- Pick up exactly where the previous beat for this player ended and move the story forward: every beat changes something (a consequence lands, the situation shifts, someone acts), and nothing already narrated is narrated again.";

const PREVIOUS_BEAT_HEADING = "PREVIOUS BEAT TEXT (the switch that led into this thread) for player1:";

/**
 * The switch turn's full text on a chapter's first step, where the state shows
 * the previous beat only as a summary (BEAT HISTORY); every later turn already
 * shows it in full (the chapter's beat texts, or the ended chapter's last
 * beat). Undefined elsewhere, and where the switch left no text.
 */
export function previousBeatBlock(story: Story): string | undefined {
  if (story.getCurrentBeatType() !== "thread" || story.getCurrentThreadBeatsCompleted() > 0) return undefined;
  const text = story.getCurrentBeat("player1")?.text?.trim();
  return text ? `\n\n${PREVIOUS_BEAT_HEADING}\n${story.getCurrentBeat("player1")?.text}` : undefined;
}

function continuityState(state: string, story: Story): string {
  const block = previousBeatBlock(story);
  if (!block) return state;
  const step = `\n\nCURRENT STEP IN THREAD PROGRESSION: Turn 1/${story.getCurrentThreadDuration()}\n`;
  return replaceOnce(LABEL, state, step, `${block}${step}`);
}

function asZodObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`${LABEL}: ${label} is not an object schema`);
  return schema;
}

/** The text field without its "Start exactly where…" line: the one instruction is in the prompt's text rules. */
function continuitySchema(schema: unknown): z.AnyZodObject {
  const root = asZodObject(schema, "reply");
  const player = asZodObject(root.shape.player1, "player1");
  const text = player.shape.text as z.ZodTypeAny;
  const description = text.description ?? "";
  if (description.split(`${OLD_FIELD_START}\n`).length !== 2) throw new Error(`${LABEL}: the text field's "${OLD_FIELD_START}" is not there exactly once`);
  return root.extend({ player1: player.extend({ text: text.describe(description.replace(`${OLD_FIELD_START}\n`, "")) }) });
}

// ---------------------------------------------------------------- the request

/** An arm's request for a single-player turn of any kind: production's form with arm O's and arm C's edits where they apply. */
export function optionsContinuityRequest(story: Story, arm: OptionsContinuityArm): TextRequest {
  if (story.isMultiplayer()) throw new Error(`${LABEL}: the arms are single-player (group turns stay on production's group form)`);
  const base = productionTurnForm(story);
  const options = arm.options && rollsOptions(story);
  const continuity = arm.continuity && !story.isFirstBeat();
  if (!options && !continuity) return base;
  const { instructions, state } = splitAtState(LABEL, base.prompt);
  let edited = options ? optionEdits(instructions, story) : instructions;
  if (continuity) edited = replaceOnce(LABEL, edited, OLD_TEXT_START, `Text\n${PICK_UP}\n- The first paragraph must\n`);
  return {
    prompt: edited + (continuity ? continuityState(state, story) : state),
    schema: continuity ? continuitySchema(base.schema) : base.schema,
  };
}

/** The passages the tests pin. */
export const OPTIONS_CONTINUITY_TEXT = {
  drawsOnStats: DRAWS_ON_STATS,
  riskOnlyWeak: RISK_ONLY_WEAK,
  pickUp: PICK_UP,
  previousBeatHeading: PREVIOUS_BEAT_HEADING,
  oldContinue: OLD_CONTINUE,
  oldFieldStart: OLD_FIELD_START,
};
