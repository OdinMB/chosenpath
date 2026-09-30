import { Story } from "core/models/Story.js";
import { MAX_STAT_MODIFIER_POINTS, MAX_STAT_MODIFIERS_PER_OPTION } from "core/config.js";
import {
  GameModes,
  type BeatOption,
  type BeatType,
  type GameMode,
  type PlayerCount,
  type PlayerSlot,
  type ResolutionDetails,
  type SetOfBeatGenerationSchema,
  type StatValueEntry,
  type StoryState,
  type Switch,
  type SwitchAnalysis,
  type ThreadAnalysis,
} from "core/types/index.js";
import { isContestedOutcome, storyStateStartProblem } from "core/utils/outcomeReadiness.js";
import { checkStoryStateBackgrounds, describeBackgroundFixes } from "core/utils/statValueCheck.js";
import { resolveTextModelConfig, settingsFor } from "shared/llm/textModelSettings.js";
import { BeatResolutionService } from "../../game/services/BeatResolutionService.js";
import { ChangeService } from "../../game/services/ChangeService.js";
import { ThreadResolutionService } from "../../game/services/ThreadResolutionService.js";
import { beatReplyProblem, checkedBeatReply } from "../../game/services/beatChecks.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { outcomeStatesAtEnding, type OutcomeState } from "../../game/services/endingStates.js";
import { allowedLengths, chaptersThatFit, isLastChapter, lastChapterAfterSwitch, outcomeNeeds, pickedOutcome, stageOf, turnsLeft } from "../../game/services/pacing.js";
import { checkSwitchPlan, checkThreadPlan, checkedSwitchPlan, checkedThreadPlan } from "../../game/services/planChecks.js";
import { UnusableResultError, withOneRetry } from "../../game/services/retryOnce.js";
import { analysisBefore, beatStep, switchStep, threadStep, type TextRequest } from "../../game/services/storyTextSteps.js";
import type { Repair } from "../../game/services/textRepairs.js";
import { makeArm, productionRole, type Arm, type EvalRole } from "./arms.js";
import { selectCharacters } from "./caseBuilder.js";
import { endingJudgeRequest } from "./endingJudge.js";
import { sha256 } from "./executor.js";
import type { ContextLine } from "./ratingContext.js";
import { turnMechanics, type LeverReading } from "./ratingMechanics.js";
import { storyFromSetup } from "./setupChain.js";
import { checkSetupDesign } from "./setupDesignChecks.js";
import { SETUP_PREMISES, buildMergedPrompt } from "./setupPremises.js";
import { judgedThread, stageJudgeRequest } from "./stageJudge.js";
import { checkSetup, merge, type CheckResult, type SetupShape } from "./textChecks.js";
import { checkBeatDesign, checkSwitchDesign, checkThreadDesign } from "./turnDesignChecks.js";
import type { TurnKind } from "./turnWaits.js";
import { isSplitRequest, requestFor, type EvalRequest, type SetupInput } from "./variants.js";

/*
 * Whole-story playthroughs on production's own code and models (the
 * coordinator's brief of 2026-09-30, after the owner's "do whatever additional
 * tests you think are useful"): a new custom-story setup, character
 * selection, then every turn as the game plays it, to the ending.
 *
 * Production's own code where the game has it: the setup request and the
 * start rule's one retry (StoryCreationService), the background values'
 * check, the switch and chapter planners with production's plan check and its
 * one retry told the problem (checkedSwitchPlan, checkedThreadPlan, which
 * carry the PACING block and the stage a chapter settles), the turn with its
 * one retry on a one-paragraph text or a beat without options outside the
 * ending (checkedBeatReply), the beat repairs, the
 * stat changes (ChangeService), each choice's resolution
 * (BeatResolutionService) and the chapter's (ThreadResolutionService), and
 * the ending. Every request is production's (the adopted variant, with
 * production's timeout and output cap), on production's settings for the
 * role and player count with no env set (its code defaults, as they apply at
 * merge). COPIES where production's code is private or reaches a database:
 * the story a setup starts (storyFromSetup, AIStoryGenerator.createInitialState)
 * and the order of StoryProgressionService.handleProgression (resolve the
 * chapter, plan, turn, apply the changes). No images, no pregeneration, no
 * content filter.
 *
 * The player is a fixed, varied policy (pickOption): a sacrifice or reward
 * whenever one is offered but never twice in a row, otherwise stat-backed,
 * riskiest and sensible in turn over the challenge picks; exploration choices
 * rotate by position; each seat starts at its own place in the rotation. The
 * game's dice (Math.random in the two resolution services) roll on a source
 * seeded by the story, turn and seat (withSeededDice), so a story played
 * again sends the same requests and an interrupted run resumes.
 *
 * The calls go through `call` (playthroughMode.ts: prep jobs in
 * prep-calls.jsonl, stage playthroughs); this module plays and records, and
 * never calls a model itself. The judged checks on its chapters and ending
 * are handed back as targets, run after the story.
 */

// ---------------------------------------------------------------- the stories

export type PlaythroughSpec = {
  id: string;
  /** A frozen setup premise (setupPremises.ts) */
  premiseId?: string;
  /** A new premise in the same spirit: one of the site's own suggestions, merged as the client merges it */
  premise?: { text: string; playerCount: PlayerCount; gameMode: GameMode; source: string };
  maxTurns: number;
  tests: string;
};

export const PLAYTHROUGHS: PlaythroughSpec[] = [
  { id: "play-lemonade", premiseId: "setup-learn-lemonade", maxTurns: 10, tests: "a short single-player story (10 turns, the lemonade stand for middle school students)" },
  { id: "play-avalon", premiseId: "setup-custom-avalon", maxTurns: 25, tests: "a full-length single-player story (25 turns, the magical heart of New Avalon)" },
  {
    id: "play-food-trucks",
    premise: {
      text: "We're competing food truck owners in a city where each district has completely different physics...",
      playerCount: 2,
      gameMode: GameModes.Competitive,
      source: "the site's suggestions, flexible, competitive #2 (client/src/page/data/suggestionData.ts)",
    },
    maxTurns: 25,
    tests: "a two-player competitive story (25 turns): a contest on a scoreboard",
  },
  {
    id: "play-space-pirates",
    premise: {
      text: "We're space pirates with a shared ship but individual treasure quotas...",
      playerCount: 3,
      gameMode: GameModes.CooperativeCompetitive,
      source: "the site's suggestions, flexible, cooperative-competitive #2 (client/src/page/data/suggestionData.ts)",
    },
    maxTurns: 25,
    tests: "a three-player cooperative-competitive story (25 turns): two camps",
  },
];

/** A playthrough's setup input: the frozen premise's text, or the new one as the client merges a flexible suggestion (its text), at the story's length. */
export function playthroughSetupInput(spec: PlaythroughSpec, premises = SETUP_PREMISES): SetupInput {
  if (spec.premiseId) {
    const frozen = premises.find((p) => p.id === spec.premiseId);
    if (!frozen) throw new Error(`Playthrough ${spec.id}: no frozen premise ${spec.premiseId}`);
    return { premise: frozen.premise, playerCount: frozen.playerCount, gameMode: frozen.gameMode, maxTurns: spec.maxTurns, ...(frozen.tags.kids ? { kids: true } : {}) };
  }
  if (!spec.premise) throw new Error(`Playthrough ${spec.id}: no premise`);
  const { text, playerCount, gameMode } = spec.premise;
  return { premise: buildMergedPrompt("flexible", {}, text), playerCount, gameMode, maxTurns: spec.maxTurns };
}

/** Production's text settings with no env set: its code defaults, which apply once the text-model variables are deleted at merge. */
const PRODUCTION_SETTINGS = resolveTextModelConfig({}, () => undefined);

/** Production's own model and effort for a role at a player count, on production's own code (adopted: its requests and limits). */
export function playthroughArm(role: EvalRole, players: number): Arm {
  const { model, reasoningEffort } = settingsFor(PRODUCTION_SETTINGS, productionRole(role), { multiplayer: players > 1 });
  return makeArm({ model, reasoningEffort }, "adopted");
}

// ---------------------------------------------------------------- the player

export type PickRule = "lever" | "stat-backed" | "riskiest" | "sensible" | "exploration";

/** Where a seat stands in the policy's rotation. */
export type PolicyState = { challengePicks: number; explorationPicks: number; lastLever: boolean };
export const START_POLICY: PolicyState = { challengePicks: 0, explorationPicks: 0, lastLever: false };

export type PolicyPick = { option: number; rule: PickRule; why: string };

const ROTATION = ["stat-backed", "riskiest", "sensible"] as const;

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const isLever = (option: BeatOption) => option.resourceType === "sacrifice" || option.resourceType === "reward";
const basePointsOf = (option: BeatOption) => (option.optionType === "challenge" && typeof option.basePoints === "number" ? option.basePoints : 0);

/** A challenge option's stat bonus as the game counts it (BeatResolutionService): the first two, each within ±15. */
export function countedBonus(option: BeatOption): number {
  if (option.optionType !== "challenge") return 0;
  return (option.modifiersToSuccessRate ?? [])
    .slice(0, MAX_STAT_MODIFIERS_PER_OPTION)
    .reduce((sum, m) => sum + Math.max(-MAX_STAT_MODIFIER_POINTS, Math.min(MAX_STAT_MODIFIER_POINTS, Number(m.effect) || 0)), 0);
}

const pointsOf = (option: BeatOption) => basePointsOf(option) + countedBonus(option);

/** The index whose scores are greatest, compared in order; the first on a tie. */
function best(indices: number[], scores: (i: number) => number[]): number {
  return indices.reduce((top, i) => {
    const [a, b] = [scores(i), scores(top)];
    const at = a.findIndex((value, k) => value !== b[k]);
    return at >= 0 && a[at] > b[at] ? i : top;
  });
}

/** The stats a challenge option's counted bonuses come from, by id. */
const bonusStats = (option: BeatOption) =>
  option.optionType === "challenge" ? (option.modifiersToSuccessRate ?? []).slice(0, MAX_STAT_MODIFIERS_PER_OPTION).map((m) => m.statId) : [];

/**
 * The automated player's pick, fixed and varied. Exploration choices (a
 * switch, an exploration chapter) rotate by position. Among challenge
 * options: a sacrifice or reward whenever one is offered, never twice in a
 * row; otherwise, in turn, the stat-backed option (the largest counted stat
 * bonus), the riskiest (a risky one with the lowest points, else the lowest
 * points) and the sensible one (the highest base points). `offset` starts each
 * seat at its own place in both rotations.
 */
export function pickOption(options: BeatOption[], state: PolicyState, offset = 0): PolicyPick {
  if (options.length === 0) throw new Error("No options to pick from");
  const all = options.map((_, i) => i);
  if (!options.some((o) => o.optionType === "challenge")) {
    const option = (state.explorationPicks + offset) % options.length;
    return { option, rule: "exploration", why: `exploration choices rotate by position: choice ${option + 1} of ${options.length}` };
  }
  const levers = all.filter((i) => isLever(options[i]));
  const normal = all.filter((i) => !isLever(options[i]));
  if (levers.length > 0 && (!state.lastLever || normal.length === 0)) {
    const option = levers[0];
    const why = state.lastLever
      ? "only sacrifices or rewards were offered"
      : `a ${options[option].resourceType} is offered: the player takes one whenever offered, never twice in a row`;
    return { option, rule: "lever", why };
  }
  const rule = ROTATION[(state.challengePicks + offset) % ROTATION.length];
  if (rule === "stat-backed") {
    const option = best(normal, (i) => [countedBonus(options[i]), basePointsOf(options[i])]);
    const stats = bonusStats(options[option]);
    return { option, rule, why: `the largest stat bonus: ${signed(countedBonus(options[option]))}${stats.length ? ` (${stats.join(", ")})` : ""}` };
  }
  if (rule === "riskiest") {
    const risky = normal.filter((i) => options[i].optionType === "challenge" && (options[i] as Extract<BeatOption, { optionType: "challenge" }>).riskType === "risky");
    const pool = risky.length > 0 ? risky : normal;
    const option = best(pool, (i) => [-pointsOf(options[i])]);
    const why = risky.length > 0 ? `the risky option with the lowest points (${signed(pointsOf(options[option]))})` : `no risky option: the lowest points (${signed(pointsOf(options[option]))})`;
    return { option, rule, why };
  }
  const option = best(normal, (i) => [basePointsOf(options[i]), countedBonus(options[i])]);
  return { option, rule, why: `the most sensible approach: base points ${signed(basePointsOf(options[option]))}` };
}

/** The seat's place in the rotation after a pick: a lever pick holds the challenge rotation where it was. */
export function nextPolicy(state: PolicyState, options: BeatOption[], pick: PolicyPick): PolicyState {
  if (pick.rule === "exploration") return { ...state, explorationPicks: state.explorationPicks + 1 };
  if (pick.rule === "lever" && isLever(options[pick.option])) return { ...state, lastLever: true };
  return { ...state, challengePicks: state.challengePicks + 1, lastLever: false };
}

// ---------------------------------------------------------------- the dice

/** A seeded source in [0, 1) (mulberry32 on the seed's hash). */
export function seededRandom(seed: string): () => number {
  let a = parseInt(sha256(seed).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs `play` (the game's own resolution code) with Math.random seeded, and restores it. Synchronous, so no other play sees the seeded source. */
export function withSeededDice<T>(seed: string, play: () => T): T {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    return play();
  } finally {
    Math.random = original;
  }
}

// ---------------------------------------------------------------- the calls

export type PlayCallSpec = { caseId: string; role: EvalRole; arm: Arm; players: number; request: EvalRequest };

/** One attempt the runner sent for a call: production's own re-sends (a reply its parse rejects, one cut at its output cap) and transport retries. */
export type PlaySend = { outcome: string; latencyMs: number; costUsd: number; finishReason?: string; outputTokens: number; reasoningTokens: number };

/** A call's answer: the reply as the game keeps it (undefined when nothing usable came back), with every attempt's wait and cost; `notSent` where a limit kept it from being sent. */
export type PlayCallResult = { parsed?: unknown; outputFile?: string; latencyMs: number; costUsd: number; sends: PlaySend[]; notSent?: string };

/** One model call; undefined when it was not sent (the budget) or brought nothing back. */
export type PlayCall = (spec: PlayCallSpec) => Promise<PlayCallResult | undefined>;

/** One call production makes (a model invoke): its attempts, and what production's check found in its reply. */
export type PlayCallLog = {
  caseId: string;
  /** Production's one retry, told the problem (a plan, a one-paragraph turn, a setup the story can't start from) */
  retry: boolean;
  outputFile?: string;
  latencyMs: number;
  costUsd: number;
  sends: PlaySend[];
  /** Nothing usable came back after the runner's attempts (production's model throws) */
  failed?: true;
  /** Not sent: a spend limit or cap */
  notSent?: string;
  /** Why production's check can't use the reply as it is */
  problem?: string;
  /** A chapter length PACING does not allow (production retries once, and never fails the turn on it) */
  lengthProblem?: string;
  /** What production's check repaired, "kind: detail" */
  repairs: string[];
};

class PlayCallFailed extends Error {
  constructor(
    readonly caseId: string,
    readonly notSent?: string
  ) {
    super(notSent ? `not sent: ${notSent}` : `no usable reply (${caseId})`);
    this.name = "PlayCallFailed";
  }
}

// ---------------------------------------------------------------- the record

export type PlanPacing = {
  turnsLeft: number;
  /** The chapter planned (a thread plan), or the one the switch opens, is the story's last */
  lastChapter: boolean;
  /** A switch plan: threads that fit, and the length of the chapter it opens when that is the last */
  threadsFit?: number;
  lastChapterLength?: number;
  /** A thread plan: the lengths PACING allows */
  allowedLengths?: number[];
  /** Each seat's outcomes as PACING counts them */
  needs: { slot: string; id: string; recorded: number; intended: number; pending: number; stillNeeded: number; noChapterYet: boolean }[];
};

export type PlayPlan = {
  kind: "switch plan" | "chapter plan";
  calls: PlayCallLog[];
  /** The plan as production stores it: checked and repaired */
  plan?: SwitchAnalysis | ThreadAnalysis;
  checks?: CheckResult;
  pacing: PlanPacing;
  /** A chapter plan: the stage each thread settles (stage k of n, from its outcome's milestones so far) */
  stages?: { outcomeId: string; recorded: number; intended: number; stage?: number; last?: boolean }[];
  /** Why production would fail the turn here */
  failure?: string;
  /**
   * Rounds production could not get past: its checked planner failed twice
   * (a plan unusable twice), which fails the turn and leaves the story waiting
   * (nothing sends the progression again). The harness then asked the checked
   * planner again, not production's behaviour (retryFailedTurns).
   */
  failedRounds?: { calls: PlayCallLog[]; failure: string }[];
};

export type PlayPick = {
  slot: string;
  option: number;
  rule: PickRule;
  why: string;
  text: string;
  optionType: BeatOption["optionType"];
  resourceType: BeatOption["resourceType"];
  riskType?: string;
  basePoints?: number;
  bonus?: number;
  /** The game's resolution: favorable/mixed/unfavorable for a challenge, resolution1-3 for an exploration choice */
  resolution: string | null;
  /** A challenge's odds, roll and points */
  details?: ResolutionDetails;
  /** The harness changed this switch pick where the group's chapter could not be planned from it (the next turn's repicks) */
  repickedTo?: number;
};

/** A switch pick the harness changed at a stuck group chapter plan: from the option taken to the direction on the outcome another player took. */
export type Repick = { slot: string; from: number; to: number; text: string; outcomeId: string };

export type PlayTurn = {
  /** 1-based */
  turn: number;
  kind: TurnKind;
  plan?: PlayPlan;
  /** The turn's calls: the first, and production's retry on a one-paragraph text */
  calls: PlayCallLog[];
  /** The reply as the game keeps it, after the repairs */
  reply?: SetOfBeatGenerationSchema;
  /** The beat repairs, "kind: detail" */
  repairs: string[];
  /** Production's own log lines for this turn (retries, repairs), counts only */
  notes: string[];
  /** Each player's choices as the game plays them, and what the turn changes (ratingMechanics.ts) */
  mechanics?: { choices: Record<string, ContextLine[]>; changes: ContextLine[] };
  /** The previous choice's sacrifice or reward, and whether this turn paid it */
  levers: LeverReading[];
  /** Stat changes that don't fit their stat */
  unfit: { group: string; name: string; kinds: string[] }[];
  checks?: CheckResult;
  picks: PlayPick[];
  /** The ending: each outcome's standing after its milestones, as production's ending reads it */
  endingStates?: OutcomeState[];
  /**
   * A group chapter production could not plan from the players' switch picks
   * (every round unusable): the picks the harness changed before planning
   * once more (repickStuckSwitches), not production's behaviour
   */
  repicks?: Repick[];
  /** The player's wait: the planner's calls and the turn's, each attempt */
  waitMs: number;
  costUsd: number;
  statValues: { shared: StatValueEntry[]; players: Record<string, StatValueEntry[]> };
  /** Milestones per outcome id after the turn */
  milestones: Record<string, number>;
};

/** A judged check's reading on a chapter or an ending (playthroughMode.ts runs them after the story). */
export type JudgedItem = { key: string; kind: "stage" | "ending"; turn: number; label: string; verdict?: boolean; evidence?: string; lines: string[]; costUsd: number };

export type PlayRun = {
  spec: PlaythroughSpec;
  sample: number;
  input: SetupInput;
  setup?: { calls: PlayCallLog[]; output?: unknown; checks?: CheckResult; backgroundFixes?: string };
  /** After character selection */
  start?: StoryState;
  /** After the last turn played */
  end?: StoryState;
  turns: PlayTurn[];
  stopped: string;
  /** The story reached its ending */
  complete: boolean;
  judged?: JudgedItem[];
};

/** A judged check to run after the story: the stage check on a chapter thread not at its outcome's last stage, the ending check per player. */
export type JudgeTarget = { key: string; kind: "stage" | "ending"; turn: number; label: string; request: TextRequest };

export type PlayResult = { run: PlayRun; judgeTargets: JudgeTarget[] };

export const playRunId = (spec: Pick<PlaythroughSpec, "id">, sample: number) => `${spec.id}-s${sample}`;

/** A story this many turns past its length without an ending stops (production has no such stop; a story that never ends would play on). */
const OVERRUN_TURNS = 8;

const repairLine = (repair: Repair) => `${repair.note ? "note " : ""}${repair.kind}${repair.detail ? `: ${repair.detail}` : ""}`;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const describe = (error: unknown) => (error instanceof UnusableResultError ? `${error.message}: ${error.problem}` : error instanceof Error ? error.message : String(error));

/**
 * The turn the next beat is, before any planner runs. The ending is read off
 * the story as production's beat prompt reads it (getCurrentBeatType, once
 * the last chapter has resolved at the story's length): determineNextBeatType
 * then returns "intro", and no planner runs.
 */
function turnKind(story: Story, next: BeatType, analysis: "switch" | "thread" | undefined): TurnKind {
  if (story.getCurrentBeatType() === "ending" || next === "ending") return "ending";
  if (analysis === "switch") return story.isFirstBeat() ? "first turn" : "switch turn";
  if (analysis === "thread") return "chapter opening";
  return "chapter step";
}

function planPacing(story: Story, kind: "switch" | "thread"): PlanPacing {
  const left = turnsLeft(story);
  const needs = story.getPlayerSlots().flatMap((slot) =>
    outcomeNeeds(story, slot, kind === "switch").map((n) => ({
      slot,
      id: n.id,
      recorded: n.recorded,
      intended: n.intended,
      pending: n.pending,
      stillNeeded: n.stillNeeded,
      noChapterYet: n.noChapterYet,
    }))
  );
  if (kind === "switch") {
    const last = lastChapterAfterSwitch(left);
    return { turnsLeft: left, lastChapter: last !== undefined, threadsFit: chaptersThatFit(left), ...(last !== undefined ? { lastChapterLength: last } : {}), needs };
  }
  return { turnsLeft: left, lastChapter: isLastChapter(left), allowedLengths: allowedLengths(left), needs };
}

/** The option of a topic switch whose direction pushes the outcome: its structured direction, else the direction text naming the id. */
function directionIndex(sw: Switch, outcomeId: string): number {
  const structured = (sw as Switch & { topicDirections?: { outcomeId?: unknown }[] }).topicDirections;
  if (Array.isArray(structured)) return structured.findIndex((d) => d?.outcomeId === outcomeId);
  return (sw.topicChoices ?? []).findIndex((text) => text.includes(outcomeId));
}

/**
 * At a group chapter production could not plan from the players' switch
 * picks: the shared outcome one of them picked (a contested one first, else
 * the one most picked), and each other player whose own topic switch offers
 * it moved to that direction. Undefined when no player picked a shared
 * outcome or nobody can move.
 */
export function coordinatedRepick(story: Story): Repick[] | undefined {
  const plan = story.getCurrentSwitchAnalysis();
  if (!plan || !story.isMultiplayer()) return undefined;
  const shared = story.getSharedOutcomes();
  const picks = story.getPlayerSlots().map((slot) => ({ slot, outcomeId: pickedOutcome(story, slot)?.outcomeId }));
  const pickedShared = picks.map((p) => p.outcomeId).filter((id): id is string => id !== undefined && shared.some((o) => o.id === id));
  if (pickedShared.length === 0) return undefined;
  const contested = pickedShared.find((id) => shared.some((o) => o.id === id && isContestedOutcome(o)));
  const most = [...new Set(pickedShared)].sort((a, b) => pickedShared.filter((id) => id === b).length - pickedShared.filter((id) => id === a).length)[0];
  const target = contested ?? most;
  const changes = picks.flatMap(({ slot, outcomeId }): Repick[] => {
    if (outcomeId === target) return [];
    const sw = plan.switches.find((s) => s.players.includes(slot));
    const beat = story.getCurrentBeat(slot);
    if (!sw || sw.type !== "topic" || !beat) return [];
    const to = directionIndex(sw, target);
    const option = beat.options[to];
    return to >= 0 && option ? [{ slot, from: beat.choice, to, text: option.text, outcomeId: target }] : [];
  });
  return changes.length ? changes : undefined;
}

function statValuesOf(story: Story): PlayTurn["statValues"] {
  const state = story.getState();
  return { shared: state.sharedStatValues ?? [], players: Object.fromEntries(story.getPlayerSlots().map((slot) => [slot, state.players[slot]?.statValues ?? []])) };
}

/** Milestones per outcome id: the shared outcomes, then each player's (an id listed twice counts once, at its most). */
function milestoneCounts(story: Story): Record<string, number> {
  const counts: Record<string, number> = {};
  const outcomes = [...story.getSharedOutcomes(), ...story.getPlayerSlots().flatMap((slot) => story.getPlayer(slot)?.outcomes ?? [])];
  for (const outcome of outcomes) counts[outcome.id] = Math.max(counts[outcome.id] ?? 0, outcome.milestones?.length ?? 0);
  return counts;
}

const newTurn = (turn: number, kind: TurnKind, story: Story): PlayTurn => ({
  turn,
  kind,
  calls: [],
  repairs: [],
  notes: [],
  levers: [],
  unfit: [],
  picks: [],
  waitMs: 0,
  costUsd: 0,
  statValues: statValuesOf(story),
  milestones: milestoneCounts(story),
});

/** A turn's wait and cost: its planner's calls (its failed rounds too) and its own, every attempt. */
function settle(turn: PlayTurn): void {
  const calls = [...(turn.plan?.failedRounds ?? []).flatMap((r) => r.calls), ...(turn.plan?.calls ?? []), ...turn.calls];
  turn.waitMs = sum(calls.map((c) => c.latencyMs));
  turn.costUsd = sum(calls.map((c) => c.costUsd));
}

/** The prompt of production's one-message request. */
function promptOf(request: EvalRequest): string {
  if (isSplitRequest(request)) throw new Error("A playthrough sends production's one-message requests");
  return request.prompt;
}

/**
 * Plays one story from its setup to its ending as the game plays it (the
 * module comment). Stops at the ending, after `turnLimit` turns (a smoke),
 * where production would fail a turn (a plan unusable twice, a call that
 * brings nothing back), at a turn that leaves a player nothing to choose, or
 * where the budget stops a call. With `retryFailedTurns`, a plan unusable
 * twice is asked for again that many more times, each time production's
 * checked planner in full (the harness's own step: production fails the
 * turn and nothing sends it again), so a whole story can still be read; the
 * turn keeps its failed rounds.
 */
export async function playStory(
  spec: PlaythroughSpec,
  input: SetupInput,
  call: PlayCall,
  options: { sample: number; turnLimit?: number; retryFailedTurns?: number; repickStuckSwitches?: boolean }
): Promise<PlayResult> {
  const id = playRunId(spec, options.sample);
  const players = input.playerCount;
  const run: PlayRun = { spec, sample: options.sample, input, turns: [], stopped: "", complete: false };
  const judgeTargets: JudgeTarget[] = [];
  let index = 0;
  const nextCaseId = (kind: string) => `${id}-${String(index++).padStart(3, "0")}-${kind.replace(/\s+/g, "-")}`;

  /** Production's invoke for one call site: each call through `call`, logged; nothing usable throws, as production's model does after its re-sends. */
  const invoker = (kind: string, role: EvalRole, base: EvalRequest, logs: PlayCallLog[], read?: (log: PlayCallLog, parsed: unknown) => void) => {
    const arm = playthroughArm(role, players);
    return async (prompt: string): Promise<unknown> => {
      const retry = logs.length > 0;
      const log: PlayCallLog = { caseId: nextCaseId(retry ? `${kind} retry` : kind), retry, latencyMs: 0, costUsd: 0, sends: [], repairs: [] };
      logs.push(log);
      const result = await call({ caseId: log.caseId, role, arm, players, request: { ...base, prompt } as EvalRequest });
      if (result) Object.assign(log, { latencyMs: result.latencyMs, costUsd: result.costUsd, sends: result.sends, ...(result.outputFile ? { outputFile: result.outputFile } : {}), ...(result.notSent ? { notSent: result.notSent } : {}) });
      if (!result || result.parsed === undefined) {
        log.failed = true;
        throw new PlayCallFailed(log.caseId, result?.notSent);
      }
      read?.(log, result.parsed);
      return result.parsed;
    };
  };

  // The setup, asked once more when the story can't start from it (StoryCreationService)
  const setupRequest = requestFor("adopted", { role: "setup", setup: input });
  const setupLogs: PlayCallLog[] = [];
  const invokeSetup = invoker("setup", "setup", setupRequest, setupLogs);
  let setupReply: unknown;
  let made: StoryState;
  try {
    made = await withOneRetry(
      async () => {
        setupReply = await invokeSetup(promptOf(setupRequest));
        return storyFromSetup(setupReply, input, id);
      },
      (state) => {
        const problem = storyStateStartProblem(state, players);
        if (problem) setupLogs[setupLogs.length - 1].problem = problem;
        return problem;
      },
      "story setup"
    );
  } catch (error) {
    run.setup = { calls: setupLogs };
    run.stopped = `the setup: ${describe(error)}`;
    return { run, judgeTargets };
  }
  const { state: checked, fixed } = checkStoryStateBackgrounds(made);
  run.setup = {
    calls: setupLogs,
    output: setupReply,
    checks: merge([checkSetup(setupReply as SetupShape, input), checkSetupDesign(setupReply, input)]),
    ...(fixed.length ? { backgroundFixes: describeBackgroundFixes(fixed) } : {}),
  };
  let story = selectCharacters(Story.create(checked), id);
  run.start = story.getState();
  const difficulty = story.getState().difficultyLevel || { title: "Balanced", modifier: -10 };
  const policies = new Map(story.getPlayerSlots().map((slot) => [slot, START_POLICY]));

  /** A planner's call, checked and retried as production does; the story with the plan, or why the turn fails (`unusable`: a plan unusable twice). */
  const plan = async (kind: "switch" | "thread", before: Story, turn: PlayTurn, suffix = ""): Promise<Story | { stopped: string; unusable: boolean }> => {
    const label = kind === "switch" ? "switch plan" : "chapter plan";
    const callLabel = `${label}${suffix}`;
    const request = requestFor("adopted", { role: kind, story: before });
    const record: PlayPlan = { kind: label, calls: [], pacing: planPacing(before, kind) };
    turn.plan = record;
    const read = (log: PlayCallLog, parsed: unknown) => {
      const result = kind === "switch" ? checkSwitchPlan(before, parsed as SwitchAnalysis) : checkThreadPlan(before, parsed as ThreadAnalysis, { lengths: true });
      if (result.problem) log.problem = result.problem;
      if (result.lengthProblem) log.lengthProblem = result.lengthProblem;
      log.repairs = result.repairs.map(repairLine);
    };
    const note = (line: string) => turn.notes.push(line);
    const retries = options.retryFailedTurns ?? 0;
    for (let round = 0; ; round++) {
      // Each round is production's checked planner in full: its first call and its one retry told the problem
      record.calls = [];
      const invoke = invoker(round ? `${callLabel} again ${round}` : callLabel, kind, request, record.calls, read);
      try {
        if (kind === "switch") {
          const stored = await checkedSwitchPlan(before, promptOf(request), async (prompt) => (await invoke(prompt)) as SwitchAnalysis, note);
          Object.assign(record, { plan: stored, checks: checkSwitchDesign(before, stored) });
          return switchStep.apply(before, stored);
        }
        const stored = await checkedThreadPlan(before, promptOf(request), async (prompt) => (await invoke(prompt)) as ThreadAnalysis, note);
        record.plan = stored;
        record.checks = checkThreadDesign(before, stored);
        record.stages = stored.threads.map((thread) => {
          const outcome = before.getOutcomeById(thread.outcomeId);
          const recorded = outcome?.milestones?.length ?? 0;
          const intended = outcome?.intendedNumberOfMilestones ?? 0;
          const stage = stageOf(recorded, intended);
          return { outcomeId: thread.outcomeId, recorded, intended, ...(stage ? { stage: stage.stage, last: stage.last } : {}) };
        });
        stored.threads.forEach((thread, i) => {
          const judge = stageJudgeRequest(before, judgedThread(thread));
          if (judge) judgeTargets.push({ key: `${id}-t${turn.turn}-${i}`, kind: "stage", turn: turn.turn, label: thread.outcomeId, request: judge });
        });
        return threadStep.apply(before, stored);
      } catch (error) {
        if (error instanceof UnusableResultError && round < retries) {
          (record.failedRounds ??= []).push({ calls: record.calls, failure: describe(error) });
          continue;
        }
        record.failure = describe(error);
        const why =
          error instanceof UnusableResultError
            ? "could not be used twice (production fails the turn)"
            : error instanceof PlayCallFailed && error.notSent
              ? `was not sent (${error.notSent})`
              : "brought no usable reply";
        return { stopped: `turn ${turn.turn}: the ${label} ${why}`, unusable: error instanceof UnusableResultError };
      }
    }
  };

  /**
   * A group chapter production could not plan from the players' switch picks:
   * the stuck players re-pick the shared direction another player took
   * (coordinatedRepick), then production's checked planner once more, the
   * failed rounds kept on the turn; the switch turn's picks say what changed.
   */
  const repickAndPlan = async (before: Story, turn: PlayTurn, failed: { stopped: string; unusable: boolean }): Promise<Story | { stopped: string; unusable: boolean }> => {
    const changes = failed.unusable && options.repickStuckSwitches ? coordinatedRepick(before) : undefined;
    const earlier = turn.plan;
    if (!changes || !earlier) return failed;
    let repicked = before;
    for (const change of changes) {
      const chosen = repicked.updateChoice(change.slot as PlayerSlot, change.to);
      repicked = withSeededDice(`${id}|t${turn.turn}|repick|${change.slot}`, () => BeatResolutionService.resolveChoice(chosen, change.slot as PlayerSlot, change.to, difficulty));
      const pick = run.turns.at(-1)?.picks.find((p) => p.slot === change.slot);
      if (pick) pick.repickedTo = change.to;
    }
    turn.repicks = changes;
    const planned = await plan("thread", repicked, turn, " after repick");
    const now = turn.plan as PlayPlan;
    now.failedRounds = [...(earlier.failedRounds ?? []), { calls: earlier.calls, failure: earlier.failure ?? failed.stopped }, ...(now.failedRounds ?? [])];
    return planned;
  };

  for (;;) {
    if (options.turnLimit !== undefined && run.turns.length >= options.turnLimit) {
      run.stopped = `after turn ${run.turns.length} (the turns asked for)`;
      break;
    }
    const written = story.getCurrentTurn();
    if (written >= story.getMaxTurns() + OVERRUN_TURNS) {
      run.stopped = `turn ${written + 1}: the story ran ${OVERRUN_TURNS} turns past its length without an ending`;
      break;
    }
    // Before the next beat: the chapter's latest steps resolved (StoryProgressionService.handleProgression)
    const resolving = story.clone();
    story = withSeededDice(`${id}|t${written + 1}|chapter`, () => ThreadResolutionService.resolveCurrentThreads(resolving));
    const next = story.determineNextBeatType();
    const analysis = analysisBefore(story, next);
    const turn = newTurn(written + 1, turnKind(story, next, analysis), story);
    if (analysis) {
      let planned = await plan(analysis, story, turn);
      if (!(planned instanceof Story) && analysis === "thread") planned = await repickAndPlan(story, turn, planned);
      if (!(planned instanceof Story)) {
        settle(turn);
        run.turns.push(turn);
        run.stopped = planned.stopped;
        break;
      }
      story = planned;
    }

    const before = story;
    const request = requestFor("adopted", { role: "beat", story: before });
    // As AIStoryGenerator checks a beat reply: the ending shows no options
    const beatCheck = { ending: before.getCurrentBeatType() === "ending" };
    const invoke = invoker(turn.kind, "beat", request, turn.calls, (log, parsed) => {
      const problem = beatReplyProblem(parsed as SetOfBeatGenerationSchema, beatCheck);
      if (problem) log.problem = problem;
    });
    if (turn.kind === "ending") turn.endingStates = outcomeStatesAtEnding(before);
    let reply: SetOfBeatGenerationSchema;
    try {
      const response = await checkedBeatReply(promptOf(request), async (prompt) => (await invoke(prompt)) as SetOfBeatGenerationSchema, (line) => turn.notes.push(line), beatCheck);
      const repaired = repairBeatReply(before, response);
      reply = repaired.reply;
      turn.reply = reply;
      turn.repairs = repaired.repairs.map(repairLine);
      const mechanics = turnMechanics(before, response);
      if (mechanics) {
        turn.mechanics = { choices: mechanics.choices, changes: mechanics.changes };
        turn.levers = mechanics.reading.levers;
        turn.unfit = mechanics.reading.statChanges
          .filter((c) => c.unfit.length > 0)
          .map((c) => ({ group: c.group, name: c.name, kinds: c.unfit.map((u) => (u.detail ? `${u.kind}: ${u.detail}` : u.kind)) }));
      }
      turn.checks = checkBeatDesign(before, reply, response);
    } catch (error) {
      settle(turn);
      run.turns.push(turn);
      run.stopped =
        error instanceof PlayCallFailed && error.notSent
          ? `turn ${turn.turn}: the ${turn.kind} was not sent (${error.notSent})`
          : `turn ${turn.turn}: the ${turn.kind} brought no usable reply (${describe(error)})`;
      break;
    }
    if (turn.kind === "ending") {
      for (const slot of before.getPlayerSlots()) {
        const judge = endingJudgeRequest(before, reply, slot);
        if (judge) judgeTargets.push({ key: `${id}-t${turn.turn}-${slot}`, kind: "ending", turn: turn.turn, label: slot, request: judge });
      }
    }
    try {
      const [withBeat, changes] = beatStep.apply(before, reply, true);
      story = new ChangeService().applyChanges(withBeat, changes);
    } catch (error) {
      settle(turn);
      run.turns.push(turn);
      run.stopped = `turn ${turn.turn}: the game could not apply the turn (${describe(error)})`;
      break;
    }
    turn.statValues = statValuesOf(story);
    turn.milestones = milestoneCounts(story);
    settle(turn);
    run.turns.push(turn);
    if (turn.kind === "ending") {
      run.complete = true;
      run.stopped = "the ending";
      break;
    }

    // Each player's choice, resolved as the game resolves it (ChoiceProcessingService)
    let stuck: string | undefined;
    for (const [seat, slot] of story.getPlayerSlots().entries()) {
      const offered = story.getCurrentBeat(slot)?.options ?? [];
      if (offered.length === 0) {
        stuck = `turn ${turn.turn}: the turn came back with no options for ${slot}, who could not go on`;
        break;
      }
      const policy = policies.get(slot) ?? START_POLICY;
      const pick = pickOption(offered, policy, seat);
      const chosen = story.updateChoice(slot, pick.option);
      story = withSeededDice(`${id}|t${turn.turn}|${slot}`, () => BeatResolutionService.resolveChoice(chosen, slot as PlayerSlot, pick.option, difficulty));
      const resolved = story.getCurrentBeat(slot);
      const option = offered[pick.option];
      turn.picks.push({
        slot,
        option: pick.option,
        rule: pick.rule,
        why: pick.why,
        text: option.text,
        optionType: option.optionType,
        resourceType: option.resourceType,
        ...(option.optionType === "challenge" ? { riskType: option.riskType, basePoints: option.basePoints, bonus: countedBonus(option) } : {}),
        resolution: resolved?.resolution ?? null,
        ...(resolved?.resolutionDetails ? { details: resolved.resolutionDetails } : {}),
      });
      policies.set(slot, nextPolicy(policy, offered, pick));
    }
    if (stuck) {
      run.stopped = stuck;
      break;
    }
  }
  run.end = story.getState();
  return { run, judgeTargets };
}
