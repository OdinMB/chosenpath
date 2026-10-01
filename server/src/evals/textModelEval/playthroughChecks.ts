import { Story } from "core/models/Story.js";
import { kidAgesFrom, kidAgesFromPremise, kidsBandOf, type KidAges, type KidsBand, type SetOfBeatGenerationSchema, type Stat, type StoryState, type Switch, type SwitchAnalysis, type Thread, type ThreadAnalysis } from "core/types/index.js";
import { getThreadType, type ThreadType } from "core/types/thread.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import type { OutcomeState } from "../../game/services/endingStates.js";
import { outcomeIdsNamed } from "../../game/services/outcomeIds.js";
import { chaptersThatFit } from "../../game/services/pacing.js";
import { scoreboardOf } from "../../game/services/scoreboards.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { percentile } from "./armStats.js";
import { KIDS_BAND_LIMITS, readabilityOf, readsForBand } from "./kidsReadability.js";
import { readLatePacing } from "./latePacingPlay.js";
import type { LeverReading, LeverStatus } from "./ratingMechanics.js";
import { playRunId, playthroughArm, turnCalls, type JudgedItem, type PlayCallLog, type PlayPlan, type PlayRun, type PlayTurn } from "./playthroughs.js";
import { replayRun } from "./playthroughReplay.js";
import { allowanceFor, type TurnKind } from "./turnWaits.js";

/*
 * What the code checks on a whole played story (playthroughs.ts), beside
 * reading it by hand: the story ends on its turn count; each chapter's length
 * is one PACING allows, and the milestone its switch turn (or the ending)
 * writes lands on its outcome, one per chapter, stage by stage; each switch's
 * late pacing (binding once fewer threads fit than milestones are still
 * needed, the threads that fit by production's count from the turns left:
 * every direction on an outcome that still needs milestones, those no
 * chapter has pushed first); in group chapters, whose choice decided each
 * step and whether each player's switch pick was followed (both since the
 * review of 2026-09-30); sacrifices and rewards per chapter against the
 * owner's rule ("At most one reward is good. Several sacrifices can sometimes
 * make sense, but should have a strong justification starting at the second
 * one": a second reward or sacrifice offered is flagged, and whether a second
 * sacrifice has its reason is read by hand); every lever the player took,
 * paid or not on the next turn, one shared change paying several players'
 * levers counted once; stat changes that don't fit their stat; whether each
 * player's own stats moved; each contest scoreboard's move against the result
 * it follows (both since round 2); what production's repairs, retries,
 * re-sends and resends of a failed turn did, and which of its fixes fired;
 * the turn design checks that failed; the judged options and results checks;
 * the ending's outcomes as its milestones leave them, with the judged checks;
 * waits per turn kind against their allowances, and the turns left out of
 * them; cost. Since round 3 (2026-10-01): whether a group challenge or contest
 * step on one player's own outcome went the owner's roll's way (the owner's
 * decision of that day), a single player's reward after a chapter's first step
 * and rewards in consecutive chapters (O2c's placement), the story's pacing as
 * the pacing-clues stage read it (readLatePacing), and a story read with a
 * child against its age band's limits, turn by turn (kidsReadability.ts).
 */

export type ThreadReading = {
  title: string;
  question?: string;
  kindOfMilestone?: string;
  outcomeId: string;
  sideA: string[];
  sideB: string[];
  /** The stage it settles, k of n, from the outcome's milestones when it was planned; none once complete (an aftermath) */
  stage?: number;
  of: number;
  recorded: number;
  lastStage: boolean;
  aftermath: boolean;
  /** The chapter's result, and the milestone the game picked for it */
  resolution?: string | null;
  plannedMilestone?: string | null;
  /** The milestone the turn after the chapter wrote on its outcome */
  milestoneTurn?: number;
  milestoneText?: string;
  milestoneLanded: boolean;
  /** The judged stage check (staysWithinStage), where it applies */
  judge?: { verdict?: boolean; evidence?: string };
};

export type LeverTally = {
  slot: string;
  /** Option sets the player saw in the chapter */
  sets: number;
  sacrificeSets: number;
  rewardSets: number;
  sacrificeTurns: number[];
  rewardTurns: number[];
  taken: { turn: number; kind: "sacrifice" | "reward" }[];
};

export type ChapterReading = {
  index: number;
  firstTurn: number;
  lastTurn: number;
  duration: number;
  allowedLengths: number[];
  lengthAllowed: boolean;
  lastChapter: boolean;
  /** The turn after the chapter's last step: the switch turn or the ending */
  endedAt: number;
  threads: ThreadReading[];
  levers: LeverTally[];
};

/**
 * A chapter's levers against the owner's rule: a second reward or sacrifice offered (the reason a second sacrifice states
 * is read by hand); since round 3 a single player's reward after the chapter's first step (O2c places it on the reward turn,
 * the chapter's first step, since 2026-10-01) and a reward in a chapter right after one that offered one (O2c's "never two
 * chapters running"; a group's B6 rate line doesn't hold it, so for groups it reads the gap the review found)
 */
export type LeverFlag = {
  chapter: number;
  slot: string;
  rule: "second reward" | "second sacrifice" | "reward after the chapter's first step" | "reward in consecutive chapters";
  turns: number[];
};

export type OutcomeTrack = {
  id: string;
  owner: string;
  question: string;
  intended: number;
  milestones: { turn: number; text: string; chapter?: number }[];
  complete: boolean;
  chapters: number[];
  problems: string[];
};

export type PacingReading = {
  turn: number;
  /** Threads that fit, from the turns left by production's count (pacing.ts, chaptersThatFit) */
  threadsFit: number;
  /** The count production's request told the planner, where it differs (a run recorded before the count's fix of 2026-09-30) */
  toldFit?: number;
  /** The most milestones any seat still needs, the chapter that just ended counted as pending */
  stillNeeded: number;
  binding: boolean;
  /** The switch design checks on it (lateDirectionsOnNeeded, lateOffersUntouched, noCompleteOutcomeOffered) */
  checks: Record<string, boolean>;
  /** The outcomes the next chapter pushed, and whether each still needed milestones */
  nextOutcomes: string[];
  nextNeeded?: boolean;
};

export type WaitReading = { kind: TurnKind; turns: number; p50S?: number; p95S?: number; maxS?: number; allowanceS: number; over: number[] };

/**
 * One step of a group chapter's thread (two or more players): each player's
 * choice with the result its own option leads to, and the step's result the
 * game used for everyone in the thread. An exploration step is a choice, so
 * the reading flags one where the outcome's owner is in the thread and the
 * game used another result than theirs (production before 2026-09-30 took the
 * first player's). A challenge or contest step combines everyone's rolls by
 * design on a shared outcome; on one player's own outcome, with the owner in
 * the thread, production reads the owner's roll alone since 2026-10-01 (the
 * owner's decision, ThreadResolutionService.rollingSides): `ownersRoll` says
 * whether the step's result is the one the owner's roll alone gives.
 */
export type GroupStepReading = {
  turn: number;
  chapter: number;
  /** 1-based */
  step: number;
  thread: string;
  outcomeId: string;
  /** "shared", or the slot whose own outcome it is */
  owner: string;
  kind: ThreadType;
  picks: { slot: string; option: number; resolution: string | null }[];
  result: string | null;
  ownerOverridden: boolean;
  /**
   * A challenge or contest step on one player's own outcome, the owner in the thread and their roll made: whether the
   * step's result is the one the owner's roll alone gives (a challenge: the owner's own result; a contest: the owner's side
   * on a favorable roll, the other on an unfavorable one, mixed on mixed); undefined elsewhere (rolls pool)
   */
  ownersRoll?: "counted" | "not counted";
};

/**
 * A group player's switch pick against the chapter planned after it: the
 * outcome the pick named, the one of the thread the plan put them in, and the
 * threads production's plan check dropped that held them. The story's first
 * chapter groups every player by rule, so it is not read.
 */
export type SwitchPickReading = {
  /** The chapter opening */
  turn: number;
  slot: string;
  option: number;
  /** The harness re-picked the switch here (a stuck chapter), to this option */
  repickedTo?: number;
  pickedOutcome?: string;
  thread?: string;
  placedOn?: string;
  /** The plan went where the pick named (or the pick named no outcome) */
  kept: boolean;
  /** Threads the plan check dropped once it took this player out of them (a player in two threads) */
  droppedThreads: string[];
};

/** Levers one shared stat's single change paid for several players: the first counts as paid, the rest as riding on it. */
export type SharedLeverReading = { turn: number; stat: string; slots: string[] };

/** A lever charged again on the turn after the one that paid it: the turn, and production's repair line ("player1/player_personal_reserve: -15, the sacrifice the previous turn paid"). */
export type ChargedAgain = { turn: number; detail: string };

export type LeverCount = LeverStatus | "sharedOnce";

/** A turn production sent again (since 2026-09-30): the sends that failed, the one that wrote it (none: the story stopped there), and whether the players had to press Try again. */
export type ResentTurn = { turn: number; kind: TurnKind; failed: string[]; sentBy?: string; tryAgain: boolean; failures: string[] };

/** A player's own stat over the story: its value at the start and the end, and the turns that changed it. */
export type OwnStatReading = { slot: string; stat: string; name: string; start: unknown; end: unknown; changedAt: number[] };

/**
 * A scoreboard's move on a turn. The setup's rule moves a scoreboard after a
 * thread about its contest, so a step's win that leaves it where it was is
 * fine ("held after a step win"), while a chapter's win that does
 * ("held after a chapter win", on the switch turn or ending after it) is not.
 */
export type ScoreboardReadingKind =
  | "toward the winner"
  | "the wrong way"
  | "held"
  | "held after a step win"
  | "held after a chapter win"
  | "moved without a winner"
  | "moved with no contest result";

/**
 * A contest scoreboard on a turn that follows a contest result on it, or
 * moves it: its value before and after the turn, the results, the side that
 * won (every result the same side's, with player1 on side A, as production's
 * scoreboardWinners reads it), and whether production's repair turned a move
 * around (scoreboardDirection).
 */
export type ScoreboardMove = {
  turn: number;
  stat: string;
  name: string;
  before?: number;
  after?: number;
  results: (string | null)[];
  winner?: "sideA" | "sideB";
  reading: ScoreboardReadingKind;
  repaired: boolean;
};

/** Production's fixes that show in its repairs (those of 2026-09-30, and since round 3 those of 2026-10-01), by kind: the turns each fired at. */
export const FIX_LABELS = {
  lastStepRepeated: "last step written twice, the copy dropped",
  lastStepRepeatedKept: "last step written twice, kept (dropping it would break the plan)",
  contestOneSided: "a contest with one side's players made their challenge",
  contestInCooperative: "a contest in a cooperative story made the group's shared challenge",
  threadKeptOnPick: "a player written into two threads kept in the one they picked",
  scoreboardDirection: "a scoreboard move turned toward the side that won",
  sharedLeverRepeated: "a shared sacrifice or reward kept to one player",
  leverChargedAgain: "a sacrifice or reward charged again on the turn after its payment, dropped",
  milestoneNotPlayed: "a milestone on an outcome no chapter that just ended pushed, dropped",
} as const;
export type FixKind = keyof typeof FIX_LABELS;

/** A judged check on an option set (a player at an exploration step) or a chapter plan's results. */
export type ChoiceJudged = { turn: number; slot: string; verdict?: boolean; evidence?: string; lines: string[] };

/** A switch plan read against PACING (switchPacingReading), and whether production asked once more over the pacing. */
export type SwitchPacing = { turn: number; fit: number; completeWhileNeeded: boolean; spare: boolean; keepsLast?: boolean; retried: boolean };

/**
 * The story's pacing as the pacing-clues stage read its short playthroughs (readLatePacing): whether the last chapter keeps
 * a milestone to settle (undefined where it was never planned), the chapters before it whose every thread is an aftermath,
 * the milestones left unfinished once it settles its stages, and each switch against PACING.
 */
export type PacingSummary = { lastChapterSettles?: boolean; aftermathsBeforeLast: number; leftUnfinished: number; switches: SwitchPacing[] };

/** One player's turn read with a child: its length and plainness (readabilityOf), and whether it is within its band's limits (readsForBand). */
export type KidsTurnReading = { turn: number; slot: string; words: number; paragraphs: number; wordsPerSentence: number; grade: number; passes: boolean };

/**
 * A story read with a child: the children's ages as the story records them (its read-with-kids setting; a run stored
 * before it, the premise's age line; none: production's 6-8 band), the band, every turn the child hears, the ending's too.
 */
export type KidsReading = { ages: string | undefined; band: KidsBand; turns: KidsTurnReading[]; passed: number };

export type StoryReadings = {
  id: string;
  title: string;
  players: number;
  maxTurns: number;
  complete: boolean;
  stopped: string;
  endsOnTurnCount: { ok: boolean; turnsBeforeEnding: number; maxTurns: number; endingTurn?: number };
  chapters: ChapterReading[];
  outcomes: OutcomeTrack[];
  latePacing: PacingReading[];
  groupSteps: GroupStepReading[];
  switchPicks: SwitchPickReading[];
  leverFlags: LeverFlag[];
  leversPaid: {
    counts: Record<LeverCount, number>;
    missed: { turn: number; slot: string; kind: string; stat?: string; status: LeverStatus }[];
    sharedOnce: SharedLeverReading[];
    /** Levers charged again on the turn after the one that paid them, where production's current repairs drop a change from the reply the run kept (none read: the replay failed) */
    chargedAgain?: ChargedAgain[];
  };
  unfit: { turn: number; group: string; name: string; kinds: string[] }[];
  /** Each player's own stats, start to end */
  ownStats: OwnStatReading[];
  /** Each contest scoreboard's moves against the results they follow */
  scoreboard: ScoreboardMove[];
  /** Production's fixes that fired, by kind */
  fixes: Record<FixKind, number[]>;
  /** The story's pacing (undefined: the run could not be replayed) */
  pacing?: PacingSummary;
  /** A story read with a child, turn by turn against its age band */
  kids?: KidsReading;
  /** The judged options check per player at an exploration step, and the results check per chapter plan (label: the plan's outcomes) */
  choices: { options: ChoiceJudged[]; results: ChoiceJudged[] };
  repairs: {
    setupRetries: number;
    backgroundFixes?: string;
    planRetries: { turn: number; kind: string; problem?: string; lengthProblem?: string }[];
    planRepairs: Record<string, number>;
    beatRepairs: Record<string, number>;
    shortTextRetries: number[];
    /** Of those, the turns whose retry was one paragraph too, and was used (production uses a second short reply) */
    shortTextUsedAsIs: number[];
    /** Turns retried for a beat without options (production's retry since 2026-09-30; a second reply without options fails the turn) */
    optionsRetries: number[];
    resends: { turn: number; caseId: string; outcomes: string[] }[];
    failedCalls: string[];
    /** Round 1: turns production could not get past (a plan unusable twice failed the turn and nothing sent it again), where the harness asked the planner again */
    stuckTurns: { turn: number; kind: string; failure: string; rounds: number; repicks?: { slot: string; from: number; to: number; outcomeId: string }[] }[];
    /** Since round 2: turns production sent again (the queue's resend, the player's Try again) */
    resentTurns: ResentTurn[];
  };
  /** Turn design checks that failed, with the turns */
  checkFailures: Record<string, number[]>;
  /** Switch and chapter plan design checks that failed (turnDesignChecks.ts), with the turn each plan opened */
  planCheckFailures: Record<string, number[]>;
  ending?: { turn: number; states: OutcomeState[]; judged: JudgedItem[] };
  waits: WaitReading[];
  /** Turns whose wait no count holds: the players were told the turn failed (its resend failed too), or production could not get past it (round 1's harness rounds) */
  waitsLeftOut: number[];
  cost: { storyUsd: number; judgeUsd: number; calls: number };
};

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const round1 = (ms: number | undefined) => (ms === undefined ? undefined : Math.round(ms / 100) / 10);

const KINDS: TurnKind[] = ["first turn", "chapter opening", "chapter step", "switch turn", "ending"];

/** The options a turn offered a seat, as the game kept them. */
function optionsOf(reply: SetOfBeatGenerationSchema | undefined, slot: string): { resourceType?: unknown }[] {
  return asArray<{ resourceType?: unknown }>(asObject(asObject(reply)[slot]).options);
}

/** The milestones a turn wrote, as the game kept them. */
function milestonesOf(reply: SetOfBeatGenerationSchema | undefined): { outcome: string; group: string; text: string }[] {
  return asArray(asObject(reply).newMilestones)
    .map(asObject)
    .filter((m) => m.type === "newMilestone")
    .map((m) => ({ outcome: asString(m.outcome), group: asString(m.outcomeGroup), text: asString(m.newMilestone) }));
}

/** The stored chapter phase that began at this turn, after it resolved (the end state). */
function resolvedPhase(run: PlayRun, firstTurn: number): ThreadAnalysis | undefined {
  return (run.end?.storyPhases ?? []).find((phase): phase is ThreadAnalysis => "threads" in phase && phase.firstBeatIndex === firstTurn - 1);
}

function chapterReadings(run: PlayRun): ChapterReading[] {
  const id = playRunId(run.spec, run.sample);
  const byTurn = new Map(run.turns.map((t) => [t.turn, t]));
  const slots = Object.keys(run.start?.players ?? {});
  const chapters: ChapterReading[] = [];
  for (const turn of run.turns) {
    const planned = turn.plan;
    if (planned?.kind !== "chapter plan" || !planned.plan) continue;
    const plan = planned.plan as ThreadAnalysis;
    const duration = plan.duration;
    const firstTurn = turn.turn;
    const lastTurn = firstTurn + duration - 1;
    const endedAt = lastTurn + 1;
    const after = byTurn.get(endedAt);
    // The lengths the plan's PACING printed and its check read: production's paced ones where the run recorded them (since
    // 2026-10-01), else the allowed ones
    const allowed = planned.pacing.pacedLengths ?? planned.pacing.allowedLengths ?? [];
    const phase = resolvedPhase(run, firstTurn);
    const threads = plan.threads.map((thread: Thread, i): ThreadReading => {
      const stage = planned.stages?.[i];
      const resolved = phase?.threads.find((t) => t.id === thread.id) ?? phase?.threads[i];
      const written = milestonesOf(after?.reply).find((m) => m.outcome === thread.outcomeId);
      const judged = run.judged?.find((j) => j.kind === "stage" && j.key === `${id}-t${firstTurn}-${i}`);
      const recorded = stage?.recorded ?? 0;
      const framed = thread as Thread & { question?: unknown };
      return {
        title: thread.title,
        ...(typeof framed.question === "string" && framed.question ? { question: framed.question } : {}),
        ...(thread.typeOfMilestone ? { kindOfMilestone: thread.typeOfMilestone } : {}),
        outcomeId: thread.outcomeId,
        sideA: thread.playersSideA,
        sideB: thread.playersSideB,
        ...(stage?.stage !== undefined ? { stage: stage.stage } : {}),
        of: stage?.intended ?? 0,
        recorded,
        lastStage: stage?.last === true,
        aftermath: stage !== undefined && stage.stage === undefined,
        ...(resolved ? { resolution: resolved.resolution, plannedMilestone: resolved.milestone } : {}),
        ...(written && after ? { milestoneTurn: after.turn, milestoneText: written.text } : {}),
        milestoneLanded: after !== undefined && (after.milestones[thread.outcomeId] ?? 0) > recorded,
        ...(judged ? { judge: { verdict: judged.verdict, evidence: judged.evidence } } : {}),
      };
    });
    const inChapter = run.turns.filter((t) => t.turn >= firstTurn && t.turn <= lastTurn);
    const levers = slots.map((slot): LeverTally => {
      const tally: LeverTally = { slot, sets: 0, sacrificeSets: 0, rewardSets: 0, sacrificeTurns: [], rewardTurns: [], taken: [] };
      for (const t of inChapter) {
        const offered = optionsOf(t.reply, slot);
        if (offered.length === 0) continue;
        tally.sets++;
        if (offered.some((o) => o.resourceType === "sacrifice")) {
          tally.sacrificeSets++;
          tally.sacrificeTurns.push(t.turn);
        }
        if (offered.some((o) => o.resourceType === "reward")) {
          tally.rewardSets++;
          tally.rewardTurns.push(t.turn);
        }
        const pick = t.picks.find((p) => p.slot === slot);
        if (pick && (pick.resourceType === "sacrifice" || pick.resourceType === "reward")) tally.taken.push({ turn: t.turn, kind: pick.resourceType });
      }
      return tally;
    });
    chapters.push({
      index: chapters.length + 1,
      firstTurn,
      lastTurn,
      duration,
      allowedLengths: allowed,
      lengthAllowed: allowed.length === 0 || allowed.includes(duration),
      lastChapter: planned.pacing.lastChapter,
      endedAt,
      threads,
      levers,
    });
  }
  return chapters;
}

function outcomeTracks(run: PlayRun, chapters: ChapterReading[]): OutcomeTrack[] {
  const state = run.end ?? run.start;
  if (!state) return [];
  const tracks = new Map<string, OutcomeTrack>();
  const add = (owner: string, outcome: { id: string; question: string; intendedNumberOfMilestones: number }) => {
    if (!tracks.has(outcome.id)) tracks.set(outcome.id, { id: outcome.id, owner, question: outcome.question, intended: outcome.intendedNumberOfMilestones, milestones: [], complete: false, chapters: [], problems: [] });
  };
  for (const outcome of state.sharedOutcomes ?? []) add("shared", outcome);
  for (const [slot, player] of Object.entries(state.players)) for (const outcome of player.outcomes ?? []) add(slot, outcome);
  for (const chapter of chapters) for (const thread of chapter.threads) tracks.get(thread.outcomeId)?.chapters.push(chapter.index);
  for (const turn of run.turns) {
    for (const m of milestonesOf(turn.reply)) {
      const track = tracks.get(m.outcome);
      if (!track) continue;
      const chapter = chapters.find((c) => c.endedAt === turn.turn && c.threads.some((t) => t.outcomeId === m.outcome));
      track.milestones.push({ turn: turn.turn, text: m.text, ...(chapter ? { chapter: chapter.index } : {}) });
      if (!chapter) track.problems.push(`turn ${turn.turn}: a milestone no chapter that just ended pushed`);
    }
  }
  for (const chapter of chapters) {
    for (const thread of chapter.threads) {
      const ended = run.turns.some((t) => t.turn === chapter.endedAt);
      if (ended && !thread.milestoneLanded) tracks.get(thread.outcomeId)?.problems.push(`chapter ${chapter.index}: its milestone did not land`);
    }
  }
  for (const track of tracks.values()) {
    track.complete = track.milestones.length >= track.intended;
    if (track.milestones.length > track.intended) track.problems.push(`${track.milestones.length} milestones against ${track.intended} intended`);
  }
  return [...tracks.values()];
}

function pacingReadings(run: PlayRun): PacingReading[] {
  const byTurn = new Map(run.turns.map((t) => [t.turn, t]));
  return run.turns.flatMap((turn): PacingReading[] => {
    const planned = turn.plan;
    if (planned?.kind !== "switch plan") return [];
    const needs = planned.pacing.needs;
    const bySlot = new Map<string, number>();
    for (const need of needs) bySlot.set(need.slot, (bySlot.get(need.slot) ?? 0) + need.stillNeeded);
    const stillNeeded = Math.max(0, ...bySlot.values());
    // Production's count from the turns left: a run recorded before its fix told the planner ÷ 4 alone
    const threadsFit = chaptersThatFit(planned.pacing.turnsLeft);
    const told = planned.pacing.threadsFit;
    const checks = Object.fromEntries(
      Object.entries(planned.checks?.checks ?? {}).filter(([name]) => ["lateDirectionsOnNeeded", "lateOffersUntouched", "noCompleteOutcomeOffered"].includes(name))
    );
    const nextPlan = byTurn.get(turn.turn + 1)?.plan;
    const nextOutcomes = nextPlan?.kind === "chapter plan" && nextPlan.plan ? [...new Set((nextPlan.plan as ThreadAnalysis).threads.map((t) => t.outcomeId))] : [];
    const neededIds = new Set(needs.filter((n) => n.stillNeeded > 0).map((n) => n.id));
    return [
      {
        turn: turn.turn,
        threadsFit,
        ...(told !== undefined && told !== threadsFit ? { toldFit: told } : {}),
        stillNeeded,
        binding: threadsFit < stillNeeded,
        checks,
        nextOutcomes,
        ...(nextOutcomes.length ? { nextNeeded: nextOutcomes.every((id) => neededIds.has(id)) } : {}),
      },
    ];
  });
}

/** Whose outcome this is: "shared", or the slot that holds it (the first, for an id held twice). */
function ownerOf(state: StoryState | undefined, outcomeId: string): string {
  if (!state || state.sharedOutcomes?.some((o) => o.id === outcomeId)) return "shared";
  return Object.entries(state.players).find(([, player]) => (player.outcomes ?? []).some((o) => o.id === outcomeId))?.[0] ?? "shared";
}

/**
 * The result the owner's roll alone gives a challenge or contest step (ThreadResolutionService with the owner as the only
 * roller): a challenge, the owner's own result; a contest, the owner's side on a favorable roll, the other side on an
 * unfavorable one, mixed on mixed.
 */
export function ownersRollResult(kind: ThreadType, ownersResult: string, ownerOnSideA: boolean): string {
  if (kind !== "contest") return ownersResult;
  if (ownersResult === "mixed") return "mixed";
  const ownSideWins = ownersResult === "favorable";
  return ownSideWins === ownerOnSideA ? "sideAWins" : "sideBWins";
}

/** Every step of each group chapter's threads that hold two or more players: each choice, and the result the game used. */
function groupStepReadings(run: PlayRun, chapters: ChapterReading[]): GroupStepReading[] {
  const byTurn = new Map(run.turns.map((t) => [t.turn, t]));
  return chapters.flatMap((chapter) => {
    const plan = byTurn.get(chapter.firstTurn)?.plan?.plan as ThreadAnalysis | undefined;
    const phase = resolvedPhase(run, chapter.firstTurn);
    return (plan?.threads ?? []).flatMap((thread, i) => {
      const players = [...thread.playersSideA, ...thread.playersSideB];
      if (players.length < 2) return [];
      const resolved = phase?.threads.find((t) => t.id === thread.id) ?? phase?.threads[i];
      const owner = ownerOf(run.start, thread.outcomeId);
      const kind = getThreadType(resolved ?? thread);
      return Array.from({ length: chapter.duration }, (_, k): GroupStepReading => {
        const turn = chapter.firstTurn + k;
        const picks = (byTurn.get(turn)?.picks ?? []).filter((p) => players.includes(p.slot)).map((p) => ({ slot: p.slot, option: p.option, resolution: p.resolution }));
        const result = resolved?.progression[k]?.resolution ?? null;
        const ownersPick = picks.find((p) => p.slot === owner);
        // On one player's own outcome, the owner in the thread and rolled: the owner's roll alone decides (since 2026-10-01)
        const rolled = (kind === "challenge" || kind === "contest") && ownersPick?.resolution && result !== null;
        const ownersRoll =
          rolled && ownersPick?.resolution ? (ownersRollResult(kind, ownersPick.resolution, thread.playersSideA.includes(owner)) === result ? ("counted" as const) : ("not counted" as const)) : undefined;
        return {
          turn,
          chapter: chapter.index,
          step: k + 1,
          thread: thread.title,
          outcomeId: thread.outcomeId,
          owner,
          kind,
          picks,
          result,
          ownerOverridden: kind === "exploration" && ownersPick !== undefined && result !== null && ownersPick.resolution !== result,
          ...(ownersRoll ? { ownersRoll } : {}),
        };
      });
    });
  });
}

/** The outcome a switch pick names: a flavor switch's, else the chosen direction's by position (its structured outcome, or the first id its text names). */
function outcomeOfPick(sw: Switch | undefined, option: number, known: string[]): string | undefined {
  if (!sw) return undefined;
  if (sw.type === "flavor") return sw.outcomeId || undefined;
  const structured = (sw as Switch & { topicDirections?: { outcomeId?: unknown }[] }).topicDirections;
  if (Array.isArray(structured)) {
    const id = structured[option]?.outcomeId;
    return typeof id === "string" && known.includes(id) ? id : undefined;
  }
  const text = sw.topicChoices?.[option] ?? "";
  return outcomeIdsNamed(text, known).known.sort((a, b) => text.indexOf(a) - text.indexOf(b))[0];
}

/** Each group player's switch pick against the chapter planned after it, for every chapter but the story's first. */
function switchPickReadings(run: PlayRun, chapters: ChapterReading[]): SwitchPickReading[] {
  if (run.input.playerCount < 2) return [];
  const byTurn = new Map(run.turns.map((t) => [t.turn, t]));
  const state = run.start;
  const known = [...(state?.sharedOutcomes ?? []), ...Object.values(state?.players ?? {}).flatMap((p) => p.outcomes ?? [])].map((o) => o.id);
  return chapters.slice(1).flatMap((chapter) => {
    const opening = byTurn.get(chapter.firstTurn);
    const switchTurn = byTurn.get(chapter.firstTurn - 1);
    const plan = opening?.plan?.plan as ThreadAnalysis | undefined;
    const switches = (switchTurn?.plan?.plan as SwitchAnalysis | undefined)?.switches ?? [];
    if (!plan || !switchTurn) return [];
    const repairs = opening?.plan?.calls.at(-1)?.repairs ?? [];
    const dropped = repairs.filter((r) => r.startsWith("threadDropped: ")).map((r) => r.slice("threadDropped: ".length));
    return switchTurn.picks.map((pick): SwitchPickReading => {
      const sw = switches.find((s) => s.players.includes(pick.slot));
      const pickedOutcome = outcomeOfPick(sw, pick.option, known);
      const thread = plan.threads.find((t) => t.playersSideA.includes(pick.slot) || t.playersSideB.includes(pick.slot));
      const removedFrom = repairs.filter((r) => r.startsWith("threadPlayerRepeated: ") && r.endsWith(`: ${pick.slot}`)).map((r) => r.slice("threadPlayerRepeated: ".length, -`: ${pick.slot}`.length));
      return {
        turn: chapter.firstTurn,
        slot: pick.slot,
        option: pick.option,
        ...(pick.repickedTo !== undefined ? { repickedTo: pick.repickedTo } : {}),
        ...(pickedOutcome ? { pickedOutcome } : {}),
        ...(thread ? { thread: thread.title, placedOn: thread.outcomeId } : {}),
        kept: pickedOutcome === undefined || thread?.outcomeId === pickedOutcome,
        droppedThreads: removedFrom.filter((id) => dropped.includes(id)),
      };
    });
  });
}

/** How many levers of its size one lever's change pays: items removed or added, or the change over the amount its text names; at least one. */
function timesPaid(lever: LeverReading): number {
  const { before, after } = lever;
  if (Array.isArray(before) && Array.isArray(after)) {
    const moved = lever.kind === "sacrifice" ? before.filter((v) => !after.includes(v)).length : after.filter((v) => !before.includes(v)).length;
    return Math.max(1, moved);
  }
  if (typeof before === "number" && typeof after === "number") {
    const amount = Number(/\d+/.exec(lever.text)?.[0] ?? 0);
    return amount > 0 ? Math.max(1, Math.floor(Math.abs(after - before) / amount)) : 1;
  }
  return 1;
}

/**
 * Every lever taken, paid or not on the next turn; where several players took
 * a lever on one shared stat and its one change pays fewer of them than took
 * it (one favor called in by two), the rest ride on it (`sharedOnce`).
 */
function leverReadings(run: PlayRun): StoryReadings["leversPaid"] {
  const counts: Record<LeverCount, number> = { applied: 0, notApplied: 0, otherWay: 0, noChange: 0, unnamed: 0, sharedOnce: 0 };
  const missed: StoryReadings["leversPaid"]["missed"] = [];
  const sharedOnce: SharedLeverReading[] = [];
  const shared = new Set((run.start?.sharedStats ?? []).map((s) => s.id));
  for (const turn of run.turns) {
    const onShared = new Map<string, LeverReading[]>();
    for (const lever of turn.levers) {
      if (lever.status === "applied" && lever.stat && shared.has(lever.stat.id)) {
        onShared.set(lever.stat.id, [...(onShared.get(lever.stat.id) ?? []), lever]);
        continue;
      }
      counts[lever.status]++;
      if (lever.status !== "applied") missed.push({ turn: turn.turn, slot: lever.slot, kind: lever.kind, ...(lever.stat ? { stat: lever.stat.name } : {}), status: lever.status });
    }
    for (const levers of onShared.values()) {
      const paid = Math.min(levers.length, timesPaid(levers[0]));
      counts.applied += paid;
      counts.sharedOnce += levers.length - paid;
      if (levers.length > paid) sharedOnce.push({ turn: turn.turn, stat: levers[0].stat?.name ?? "", slots: levers.map((l) => l.slot) });
    }
  }
  const chargedAgain = chargedAgainReadings(run);
  return { counts, missed, sharedOnce, ...(chargedAgain ? { chargedAgain } : {}) };
}

/**
 * Levers charged again on the turn after the one that paid it (production's
 * `leverChargedAgain`, since the review of round 2): each turn's kept reply
 * replayed through production's current beat repairs on the state the turn
 * saw (playthroughReplay.ts), where they now drop a change. A run played
 * with the repair shows none here (its kept replies lack the change) and
 * lists the turns it fired in the fixes. Undefined where the run can't be
 * replayed. A round 1 group story replays differently from the step the
 * owner rule now decides, so its later turns read that state, not the played one.
 */
function chargedAgainReadings(run: PlayRun): ChargedAgain[] | undefined {
  try {
    return replayRun(run).flatMap((r) =>
      r.played.reply
        ? repairBeatReply(r.before, r.played.reply)
            .repairs.filter((repair) => repair.kind === "leverChargedAgain")
            .map((repair) => ({ turn: r.turn, detail: repair.detail ?? "" }))
        : []
    );
  } catch {
    return undefined;
  }
}

const kindOf = (line: string) => line.replace(/^note /, "").split(":")[0];

function countKinds(lines: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of lines) counts[kindOf(line)] = (counts[kindOf(line)] ?? 0) + 1;
  return counts;
}

/** A beat call's recorded problem (beatReplyProblem) names a one-paragraph text, or a beat without options. */
const isShort = (problem: string | undefined) => problem !== undefined && problem.includes("a single paragraph");
const hasNoOptions = (problem: string | undefined) => problem !== undefined && problem.includes("no options");

function repairReadings(run: PlayRun): StoryReadings["repairs"] {
  const setupCalls = run.setup?.calls ?? [];
  const planRetries: StoryReadings["repairs"]["planRetries"] = [];
  const resends: StoryReadings["repairs"]["resends"] = [];
  const failedCalls: string[] = [];
  const read = (turn: number, calls: PlayCallLog[]) => {
    for (const call of calls) {
      if (call.sends.length > 1) resends.push({ turn, caseId: call.caseId, outcomes: call.sends.map((s) => (s.finishReason && s.finishReason !== "stop" ? `${s.outcome} (${s.finishReason})` : s.outcome)) });
      if (call.failed) failedCalls.push(call.caseId);
    }
  };
  read(0, setupCalls);
  for (const turn of run.turns) {
    // Every send's plan: the failed sends' (their retries were production's too) and the one the turn kept
    const plans = [...(turn.failedSends ?? []).map((s) => s.plan), turn.plan].filter((p): p is PlayPlan => p !== undefined);
    for (const plan of plans) {
      for (const calls of [...(plan.failedRounds ?? []).map((r) => r.calls), plan.calls]) {
        calls.forEach((call, i) => {
          const previous = calls[i - 1];
          if (call.retry && previous) planRetries.push({ turn: turn.turn, kind: plan.kind, ...(previous.problem ? { problem: previous.problem } : {}), ...(previous.lengthProblem ? { lengthProblem: previous.lengthProblem } : {}) });
        });
        read(turn.turn, calls);
      }
    }
    for (const send of turn.failedSends ?? []) read(turn.turn, send.calls);
    read(turn.turn, turn.calls);
  }
  return {
    setupRetries: Math.max(0, setupCalls.length - 1),
    ...(run.setup?.backgroundFixes ? { backgroundFixes: run.setup.backgroundFixes } : {}),
    planRetries,
    planRepairs: countKinds(run.turns.flatMap((t) => t.plan?.calls.flatMap((c) => c.repairs) ?? [])),
    beatRepairs: countKinds(run.turns.flatMap((t) => t.repairs)),
    shortTextRetries: run.turns.filter((t) => isShort(t.calls[0]?.problem) && t.calls.length > 1).map((t) => t.turn),
    shortTextUsedAsIs: run.turns.filter((t) => isShort(t.calls[0]?.problem) && isShort(t.calls[1]?.problem)).map((t) => t.turn),
    optionsRetries: run.turns.filter((t) => hasNoOptions(t.calls[0]?.problem) && t.calls.length > 1).map((t) => t.turn),
    resends,
    failedCalls,
    stuckTurns: run.turns.flatMap((t) => {
      const rounds = t.plan?.failedRounds ?? [];
      const repicks = t.repicks?.map(({ slot, from, to, outcomeId }) => ({ slot, from, to, outcomeId }));
      return rounds.length && t.plan ? [{ turn: t.turn, kind: t.plan.kind, failure: rounds[0].failure, rounds: rounds.length, ...(repicks?.length ? { repicks } : {}) }] : [];
    }),
    resentTurns: run.turns.flatMap((t): ResentTurn[] => {
      const failed = t.failedSends ?? [];
      if (failed.length === 0) return [];
      const sends = failed.map((s) => s.send);
      return [
        {
          turn: t.turn,
          kind: t.kind,
          failed: sends,
          ...(t.reply && t.sentBy ? { sentBy: t.sentBy } : {}),
          tryAgain: [...sends, t.sentBy ?? ""].some((s) => s.startsWith("try again")),
          failures: failed.map((s) => s.failure),
        },
      ];
    }),
  };
}

/** Whether the players were told the turn failed: its resend failed too (production then shows the notice), or round 1's harness asked the planner again. */
const toldFailed = (turn: PlayTurn) => Boolean(turn.plan?.failedRounds?.length) || (turn.failedSends ?? []).some((s) => s.send.includes("resend"));

function waitReadings(run: PlayRun): WaitReading[] {
  const beatArm = playthroughArm("beat", run.input.playerCount).key;
  return KINDS.flatMap((kind): WaitReading[] => {
    // A turn the players were told failed is no wait a player would have sat through (the repairs list it); one the queue's resend saved is, every send counted
    const turns = run.turns.filter((t) => t.kind === kind && t.calls.length > 0 && t.reply !== undefined && !toldFailed(t));
    if (turns.length === 0) return [];
    const waits = turns.map((t) => t.waitMs);
    const allowanceS = allowanceFor(beatArm, kind);
    return [
      {
        kind,
        turns: turns.length,
        p50S: round1(percentile(waits, 50)),
        p95S: round1(percentile(waits, 95)),
        maxS: round1(Math.max(...waits)),
        allowanceS,
        over: turns.filter((t) => t.waitMs / 1000 > allowanceS).map((t) => t.turn),
      },
    ];
  });
}

/** Each player's own stats from the start to the end, and the turns that changed each. */
function ownStatReadings(run: PlayRun): OwnStatReading[] {
  const start = run.start;
  if (!start) return [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return Object.keys(start.players).flatMap((slot) =>
    start.playerStats.map((stat): OwnStatReading => {
      const valueIn = (values: { statId: string; value: unknown }[] | undefined) => values?.find((v) => v.statId === stat.id)?.value;
      let before = valueIn(start.players[slot]?.statValues);
      const first = before;
      const changedAt: number[] = [];
      for (const turn of run.turns) {
        const after = valueIn(turn.statValues.players[slot]);
        if (!same(before, after)) changedAt.push(turn.turn);
        before = after;
      }
      return { slot, stat: stat.id, name: stat.name, start: first, end: before, changedAt };
    })
  );
}

/** The contest scoreboards the story's contested shared outcomes name (production's scoreboardOf). */
function scoreboardsOf(state: StoryState | undefined): Stat[] {
  if (!state) return [];
  const story = Story.create(state);
  const boards = (state.sharedOutcomes ?? []).filter(isContestedOutcome).map((o) => scoreboardOf(story, o.id)).filter((s): s is Stat => s !== undefined);
  return [...new Map(boards.map((b) => [b.id, b])).values()];
}

/** Each scoreboard on each turn that follows a contest result on it or moves it, against the side that won. */
function scoreboardReadings(run: PlayRun): ScoreboardMove[] {
  const boards = scoreboardsOf(run.start);
  const numberIn = (values: { statId: string; value: unknown }[] | undefined, id: string) => {
    const value = values?.find((v) => v.statId === id)?.value;
    return typeof value === "number" ? value : undefined;
  };
  const moves: ScoreboardMove[] = [];
  let previous = run.start?.sharedStatValues ?? [];
  for (const turn of run.turns) {
    const now = turn.statValues.shared;
    for (const board of boards) {
      const before = numberIn(previous, board.id);
      const after = numberIn(now, board.id);
      const followed = (turn.contestResults ?? []).filter((c) => c.board === board.id);
      const moved = before !== after;
      if (!followed.length && !moved) continue;
      const winners = followed.map((c) => (!c.oriented ? undefined : c.result === "sideAWins" ? "sideA" : c.result === "sideBWins" ? "sideB" : undefined));
      const winner = winners.length && winners.every((w) => w !== undefined && w === winners[0]) ? winners[0] : undefined;
      const up = (after ?? 0) > (before ?? 0);
      const reading: ScoreboardReadingKind = !followed.length
        ? "moved with no contest result"
        : !winner
          ? moved
            ? "moved without a winner"
            : "held"
          : !moved
            ? turn.kind === "chapter step"
              ? "held after a step win"
              : "held after a chapter win"
            : up === (winner === "sideA")
              ? "toward the winner"
              : "the wrong way";
      moves.push({
        turn: turn.turn,
        stat: board.id,
        name: board.name,
        ...(before !== undefined ? { before } : {}),
        ...(after !== undefined ? { after } : {}),
        results: followed.map((c) => c.result),
        ...(winner ? { winner } : {}),
        reading,
        repaired: turn.repairs.some((r) => r.startsWith(`scoreboardDirection: ${board.id}:`)),
      });
    }
    previous = now;
  }
  return moves;
}

/** The turns each of production's fixes fired at: the plan check's (the plan the turn kept) and the beat repairs'. */
function fixReadings(run: PlayRun): Record<FixKind, number[]> {
  const fixes = Object.fromEntries(Object.keys(FIX_LABELS).map((kind) => [kind, [] as number[]])) as Record<FixKind, number[]>;
  for (const turn of run.turns) {
    const lines = [...(turn.plan?.calls.at(-1)?.repairs ?? []), ...turn.repairs];
    for (const kind of new Set(lines.map(kindOf))) if (kind in fixes) fixes[kind as FixKind].push(turn.turn);
  }
  return fixes;
}

/** The judged options and results checks, in turn order. */
function choiceReadings(run: PlayRun): StoryReadings["choices"] {
  const of = (kind: "options" | "results") =>
    (run.judged ?? [])
      .filter((j) => j.kind === kind)
      .sort((a, b) => a.turn - b.turn)
      .map((j): ChoiceJudged => ({ turn: j.turn, slot: j.label, ...(j.verdict !== undefined ? { verdict: j.verdict } : {}), ...(j.evidence ? { evidence: j.evidence } : {}), lines: j.lines }));
  return { options: of("options"), results: of("results") };
}

/** Each chapter's levers against the owner's rule (LeverFlag); a reward after the chapter's first step reads a single player only. */
function leverFlagReadings(run: PlayRun, chapters: ChapterReading[]): LeverFlag[] {
  const single = run.input.playerCount === 1;
  return chapters.flatMap((chapter, i) =>
    chapter.levers.flatMap((tally): LeverFlag[] => {
      const flag = (rule: LeverFlag["rule"], turns: number[]): LeverFlag[] => [{ chapter: chapter.index, slot: tally.slot, rule, turns }];
      const late = tally.rewardTurns.filter((t) => t > chapter.firstTurn);
      const before = i > 0 ? chapters[i - 1].levers.find((l) => l.slot === tally.slot) : undefined;
      return [
        ...(tally.rewardSets > 1 ? flag("second reward", tally.rewardTurns.slice(1)) : []),
        ...(tally.sacrificeSets > 1 ? flag("second sacrifice", tally.sacrificeTurns.slice(1)) : []),
        ...(single && late.length ? flag("reward after the chapter's first step", late) : []),
        ...(tally.rewardSets > 0 && (before?.rewardSets ?? 0) > 0 ? flag("reward in consecutive chapters", tally.rewardTurns) : []),
      ];
    })
  );
}

/** The story's pacing as the pacing-clues stage read it (readLatePacing); undefined where the run can't be replayed. */
function pacingSummary(run: PlayRun): PacingSummary | undefined {
  try {
    const read = readLatePacing(run);
    return {
      ...(read.lastChapterSettles !== undefined ? { lastChapterSettles: read.lastChapterSettles } : {}),
      aftermathsBeforeLast: read.aftermathsBeforeLast,
      leftUnfinished: read.leftUnfinished,
      switches: read.switches.map(({ turn, reading, retried }) => ({
        turn,
        fit: reading.fit,
        completeWhileNeeded: reading.completeWhileNeeded,
        spare: reading.spare,
        ...(reading.keepsLast !== undefined ? { keepsLast: reading.keepsLast } : {}),
        retried,
      })),
    };
  } catch {
    return undefined;
  }
}

const agesText = (ages: KidAges) => (ages.min === ages.max ? `${ages.min}` : `${ages.min}-${ages.max}`);

/** A story read with a child, turn by turn against the band of the ages it records (its setting, else its premise's line, else production's 6-8). */
function kidsReadings(run: PlayRun): KidsReading | undefined {
  if (!run.input.kids && run.start?.category !== "read-with-kids") return undefined;
  const ages = kidAgesFrom(run.start?.kidAges) ?? kidAgesFrom(run.input.kidAges) ?? kidAgesFromPremise(run.input.premise);
  const band = ages ? kidsBandOf(ages) : "6-8";
  const slots = Object.keys(run.start?.players ?? {});
  const turns = run.turns.flatMap((turn) =>
    slots.flatMap((slot): KidsTurnReading[] => {
      const text = asString(asObject(asObject(turn.reply)[slot]).text);
      if (!turn.reply || !text) return [];
      const r = readabilityOf(text);
      return [{ turn: turn.turn, slot, words: r.words, paragraphs: r.paragraphs, wordsPerSentence: r.wordsPerSentence, grade: r.grade, passes: readsForBand(r, band) }];
    })
  );
  return { ages: ages ? agesText(ages) : undefined, band, turns, passed: turns.filter((t) => t.passes).length };
}

/** Every reading the code takes on one played story. */
export function readStory(run: PlayRun): StoryReadings {
  const chapters = chapterReadings(run);
  const ending = run.turns.find((t) => t.kind === "ending");
  const endingTurn = run.complete ? ending?.turn : undefined;
  const leverFlags = leverFlagReadings(run, chapters);
  const pacing = pacingSummary(run);
  const kids = kidsReadings(run);
  const checkFailures: Record<string, number[]> = {};
  const planCheckFailures: Record<string, number[]> = {};
  for (const turn of run.turns) {
    for (const [name, ok] of Object.entries(turn.checks?.checks ?? {})) if (!ok) (checkFailures[name] ??= []).push(turn.turn);
    for (const [name, ok] of Object.entries(turn.plan?.checks?.checks ?? {})) if (!ok) (planCheckFailures[name] ??= []).push(turn.turn);
  }
  const setupCalls = run.setup?.calls ?? [];
  return {
    id: playRunId(run.spec, run.sample),
    title: run.start?.title ?? "",
    players: run.input.playerCount,
    maxTurns: run.input.maxTurns,
    complete: run.complete,
    stopped: run.stopped,
    endsOnTurnCount: {
      ok: endingTurn !== undefined && endingTurn === run.input.maxTurns + 1,
      turnsBeforeEnding: endingTurn !== undefined ? endingTurn - 1 : run.turns.length,
      maxTurns: run.input.maxTurns,
      ...(endingTurn !== undefined ? { endingTurn } : {}),
    },
    chapters,
    outcomes: outcomeTracks(run, chapters),
    latePacing: pacingReadings(run),
    groupSteps: groupStepReadings(run, chapters),
    switchPicks: switchPickReadings(run, chapters),
    leverFlags,
    leversPaid: leverReadings(run),
    unfit: run.turns.flatMap((t) => t.unfit.map((u) => ({ turn: t.turn, ...u }))),
    ownStats: ownStatReadings(run),
    scoreboard: scoreboardReadings(run),
    fixes: fixReadings(run),
    ...(pacing ? { pacing } : {}),
    ...(kids ? { kids } : {}),
    choices: choiceReadings(run),
    repairs: repairReadings(run),
    checkFailures,
    planCheckFailures,
    ...(ending ? { ending: { turn: ending.turn, states: ending.endingStates ?? [], judged: (run.judged ?? []).filter((j) => j.kind === "ending") } } : {}),
    waits: waitReadings(run),
    waitsLeftOut: run.turns.filter(toldFailed).map((t) => t.turn),
    cost: {
      storyUsd: sum(setupCalls.map((c) => c.costUsd)) + sum(run.turns.map((t) => t.costUsd)),
      judgeUsd: sum((run.judged ?? []).map((j) => j.costUsd)),
      calls: setupCalls.length + sum(run.turns.map((t) => turnCalls(t).length)),
    },
  };
}

// ---------------------------------------------------------------- the report

const usd = (value: number) => `$${value.toFixed(4)}`;
const yes = (ok: boolean | undefined) => (ok === undefined ? "–" : ok ? "yes" : "no");
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const list = (values: (string | number)[]) => (values.length ? values.join(", ") : "none");
const counted = (counts: Record<string, number>) =>
  Object.keys(counts).length
    ? Object.entries(counts)
        .map(([kind, n]) => `${kind} ${n}`)
        .join(", ")
    : "none";

/** Which players' own stats moved from the start to the end, one line; those that moved and came back apart. */
export function ownStatsLine(r: StoryReadings): string {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const changed = r.ownStats.filter((s) => s.changedAt.length > 0);
  const moved = changed.filter((s) => !same(s.start, s.end));
  const back = changed.filter((s) => same(s.start, s.end));
  const stats = new Set(r.ownStats.map((s) => s.stat)).size;
  const seats = new Set(r.ownStats.map((s) => s.slot)).size;
  const of = `of ${stats} stat${stats === 1 ? "" : "s"} per player, ${seats} player${seats === 1 ? "" : "s"}`;
  const shown = (value: unknown) => (Array.isArray(value) ? `[${value.join(", ")}]` : String(value));
  const listed = (readings: OwnStatReading[]) =>
    readings.map((s) => `${s.name} (${s.slot}: ${shown(s.start)} → ${shown(s.end)}, ${s.changedAt.length} turn${s.changedAt.length === 1 ? "" : "s"})`).join("; ");
  const cameBack = back.length ? `; moved and back where they started: ${listed(back)}` : "";
  return `Players' own stats that moved: ${moved.length ? listed(moved) : "none"} (${of})${cameBack}.`;
}

/** The levers charged again on the turn after the one that paid them, one line. */
export function chargedAgainLine(r: StoryReadings): string {
  const found = r.leversPaid.chargedAgain;
  const label = "Levers charged again on the turn after the one that paid them (each kept reply through production's current repairs, leverChargedAgain)";
  if (found === undefined) return `${label}: not read (the run could not be replayed).`;
  return `${label}: ${found.length ? found.map((c) => `turn ${c.turn} (${c.detail})`).join("; ") : "none"}.`;
}

const SCOREBOARD_ORDER: { reading: ScoreboardReadingKind; label: string; problem: boolean }[] = [
  { reading: "toward the winner", label: "toward the winner", problem: false },
  { reading: "the wrong way", label: "the wrong way", problem: true },
  { reading: "held", label: "held after a mixed result", problem: false },
  { reading: "held after a step win", label: "held after a step win", problem: false },
  { reading: "held after a chapter win", label: "held after a chapter win", problem: true },
  { reading: "moved without a winner", label: "moved without a winner", problem: true },
  { reading: "moved with no contest result", label: "moved with no contest result", problem: true },
];

/** Each scoreboard's moves against the results they follow, one line. */
export function scoreboardLine(r: StoryReadings): string {
  if (r.scoreboard.length === 0) return "Scoreboard moves: none (no contest scoreboard moved or followed a contest result).";
  const boards = [...new Set(r.scoreboard.map((m) => m.name))];
  const parts = boards.map((name) => {
    const moves = r.scoreboard.filter((m) => m.name === name);
    const readings = SCOREBOARD_ORDER.flatMap(({ reading, label, problem }) => {
      const turns = moves.filter((m) => m.reading === reading).map((m) => m.turn);
      if (turns.length === 0) return [];
      return [problem ? `${label} at turn ${turns.join(", ")}` : `${label} ${turns.length}`];
    });
    const repaired = moves.filter((m) => m.repaired).map((m) => m.turn);
    const turned = repaired.length ? `production turned ${repaired.length} move${repaired.length === 1 ? "" : "s"} around (turn ${repaired.join(", ")})` : "production turned no move around";
    return `${name}: ${moves.length} turn${moves.length === 1 ? "" : "s"} after a contest result or with a move: ${readings.join(", ")}; ${turned}`;
  });
  return `Scoreboard moves: ${parts.join(". ")}.`;
}

/** A turn production sent again, in words. */
export function resentLine(t: ResentTurn): string {
  const failed = t.failed.map((send, i) => (i === 0 ? "the first send" : send.startsWith("try again") && !send.includes("resend") ? "the Try again" : "its resend"));
  const failedWords = failed.length > 1 ? `${failed.slice(0, -1).join(", ")} and ${failed.at(-1)}` : failed[0];
  const wrote =
    t.sentBy === undefined
      ? "no send wrote it: the story stopped here"
      : t.sentBy === "after repick"
        ? "the harness's re-pick and one more send wrote it"
        : t.sentBy.startsWith("try again")
          ? `${t.sentBy.includes("resend") ? "the Try again's resend" : "the Try again"} wrote it`
          : "the queue's resend wrote it";
  return `turn ${t.turn} (${failedWords} failed${t.tryAgain ? "; the players saw the failure notice and pressed Try again" : ""}; ${wrote})`;
}

/** The fixes that fired, one line. */
export function fixesLine(r: StoryReadings): string {
  const fired = (Object.keys(FIX_LABELS) as FixKind[]).filter((kind) => r.fixes[kind].length > 0);
  return fired.length ? fired.map((kind) => `${FIX_LABELS[kind]}: turn ${r.fixes[kind].join(", ")}`).join("; ") : "none";
}

/** Whether the owner's roll decided each group challenge or contest step on a player's own outcome, one line; none for a single player. */
export function ownersRollLine(r: StoryReadings): string | undefined {
  if (r.players < 2) return undefined;
  const label = "Group challenge and contest steps on one player's own outcome, the owner in the thread";
  const steps = r.groupSteps.filter((s) => s.ownersRoll !== undefined);
  if (steps.length === 0) return `${label}: none.`;
  const not = steps.filter((s) => s.ownersRoll === "not counted").map((s) => s.turn);
  return `${label}: the owner's roll decided ${steps.length - not.length} of ${steps.length}${not.length ? ` (not at turn ${not.join(", ")})` : ""}.`;
}

/** The story's pacing, one line. */
export function pacingLine(r: StoryReadings): string {
  const p = r.pacing;
  if (!p) return "Pacing: not read (the run could not be replayed).";
  const turns = (values: number[]) => (values.length ? `turn ${values.join(", ")}` : "none");
  const count = (n: number) => (n ? String(n) : "none");
  const last = p.lastChapterSettles === undefined ? "not planned" : p.lastChapterSettles ? "yes" : "no";
  return [
    `Pacing: the last chapter keeps a milestone to settle: ${last}`,
    `aftermath chapters before it: ${count(p.aftermathsBeforeLast)}`,
    `milestones left unfinished: ${count(p.leftUnfinished)}`,
    `switches where a complete outcome took a thread a player needed: ${turns(p.switches.filter((s) => s.completeWhileNeeded).map((s) => s.turn))}`,
    `switches whose spare thread left the last thread nothing to settle: ${turns(p.switches.filter((s) => s.keepsLast === false).map((s) => s.turn))}`,
    `switches production asked once more over the pacing: ${turns(p.switches.filter((s) => s.retried).map((s) => s.turn))}.`,
  ].join("; ");
}

/** A band's limits in words (KIDS_BAND_LIMITS). */
export function bandLimitsText(band: KidsBand): string {
  const l = KIDS_BAND_LIMITS[band];
  return `${l.minWords > 1 ? `${l.minWords}-${l.maxWords} words` : `at most ${l.maxWords} words`}, at most ${l.wordsPerSentence} words a sentence, grade ${l.grade} or below`;
}

/** Who the story is read with, in words: "a child aged 5 (the 3-5 band)", or no age recorded. */
export const kidsWho = (k: Pick<KidsReading, "ages" | "band">) => (k.ages ? `a child aged ${k.ages} (the ${k.band} band)` : `a child, no age recorded (production's ${k.band} band)`);

/** A story read with a child against its band, one line; none for other stories. */
export function kidsLine(r: StoryReadings): string | undefined {
  const k = r.kids;
  if (!k) return undefined;
  const median = (values: number[]) => (values.length ? percentile(values, 50) ?? 0 : 0);
  const words = Math.round(median(k.turns.map((t) => t.words)));
  const grade = median(k.turns.map((t) => t.grade)).toFixed(1);
  const who = kidsWho(k);
  return `Read with ${who}: ${k.passed} of ${k.turns.length} turns within the band's limits (${bandLimitsText(k.band)}); words a turn median ${words}, grade median ${grade}.`;
}

/** A judged check's tally, one line: the passes of those answered, and where it failed with the judge's evidence. */
export function choiceLine(label: string, items: ChoiceJudged[], where: (c: ChoiceJudged) => string): string {
  const answered = items.filter((c) => c.verdict !== undefined);
  const failed = answered.filter((c) => c.verdict === false);
  const unanswered = items.length - answered.length;
  const not = failed.length ? ` (not at ${failed.map((c) => `${where(c)}${c.evidence ? `: ${cell(c.evidence)}` : ""}`).join("; ")})` : "";
  return `${label}: ${answered.length - failed.length} of ${answered.length}${not}${unanswered ? `; ${unanswered} unanswered` : ""}`;
}

function storySection(run: PlayRun, r: StoryReadings): string[] {
  const lines: string[] = [
    `## ${run.spec.id} (sample ${run.sample})`,
    "",
    `${run.spec.tests}. "${r.title}", ${r.players} player(s), ${run.input.gameMode}, ${r.maxTurns} turns. Stopped: ${r.stopped}.`,
    "",
    `- ends on its turn count: ${r.endsOnTurnCount.ok ? "yes" : "no"} (${r.endsOnTurnCount.turnsBeforeEnding} turns${r.endsOnTurnCount.endingTurn ? `, then the ending at turn ${r.endsOnTurnCount.endingTurn}` : ", no ending"})`,
    `- cost ${usd(r.cost.storyUsd)} over ${r.cost.calls} calls; judged checks ${usd(r.cost.judgeUsd)}`,
    "",
    "### Chapters",
    "",
    "| # | Turns | Length (allowed) | Last | Thread | Outcome, stage | Result | Milestone written (turn) | Landed | Within stage (judged) |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const c of r.chapters) {
    for (const t of c.threads) {
      const stage = t.aftermath ? "complete: an aftermath" : t.stage !== undefined ? `stage ${t.stage} of ${t.of}${t.lastStage ? ", the last" : ""}` : "–";
      lines.push(
        `| ${c.index} | ${c.firstTurn}-${c.lastTurn} | ${c.duration} (${list(c.allowedLengths)})${c.lengthAllowed ? "" : " NOT ALLOWED"} | ${yes(c.lastChapter)} | ${cell(t.title)}${t.question ? `: ${cell(t.question)}` : ""} | ${t.outcomeId}, ${stage} | ${t.resolution ?? "–"} | ${t.milestoneText ? `${cell(t.milestoneText)} (${t.milestoneTurn})` : "none"} | ${yes(t.milestoneLanded)} | ${t.judge ? `${yes(t.judge.verdict)}${t.judge.evidence ? `: ${cell(t.judge.evidence)}` : ""}` : "–"} |`
      );
    }
  }
  lines.push("", "### Outcomes", "");
  for (const o of r.outcomes) {
    lines.push(`- ${o.id} (${o.owner}): ${o.milestones.length} of ${o.intended}, ${o.complete ? "complete" : "unfinished"}; chapters ${list(o.chapters)}${o.problems.length ? `; problems: ${o.problems.join("; ")}` : ""}`);
    for (const m of o.milestones) lines.push(`  - turn ${m.turn}${m.chapter ? ` (chapter ${m.chapter})` : ""}: ${cell(m.text)}`);
  }
  lines.push(
    "",
    "### Late pacing",
    "",
    "Threads fit by production's count from the turns left (never fewer than the length rule makes come; \"told\" where the planner's request said another, before that count's fix). The checks read the late rule as they were measured (turns left ÷ 4).",
    "",
    "| Switch turn | Threads fit | Still needed | Binds | Checks | Next chapter's outcome | Still needed then |",
    "|---|---|---|---|---|---|---|"
  );
  for (const p of r.latePacing) {
    const checks = Object.entries(p.checks).map(([name, ok]) => `${name} ${yes(ok)}`);
    lines.push(`| ${p.turn} | ${p.threadsFit}${p.toldFit !== undefined ? ` (told ${p.toldFit})` : ""} | ${p.stillNeeded} | ${yes(p.binding)} | ${list(checks)} | ${list(p.nextOutcomes)} | ${yes(p.nextNeeded)} |`);
  }
  lines.push("", pacingLine(r));
  if (r.groupSteps.length) {
    lines.push(
      "",
      "### Group chapters: whose choice decided each step",
      "",
      "Every step of a thread with two or more players: each player's choice and the result its own option leads to, and the result the game used for the thread. An exploration step is a choice: \"overridden\" where the outcome's owner is in the thread and the game used another result than theirs. A challenge or contest step combines the rolls, except on one player's own outcome with the owner in the thread, where only the owner's roll counts (since 2026-10-01): \"owner's roll counted\" says whether the result is the one the owner's roll alone gives.",
      "",
      "| Turn | Chapter | Step | Thread | Outcome (owner) | Kind | Choices | Result used | Owner's choice overridden | Owner's roll counted |",
      "|---|---|---|---|---|---|---|---|---|---|"
    );
    for (const s of r.groupSteps) {
      const choices = s.picks.map((p) => `${p.slot} ${p.option + 1} → ${p.resolution ?? "–"}`).join("; ");
      const ownersRoll = s.ownersRoll === undefined ? "–" : s.ownersRoll === "counted" ? "yes" : "no";
      lines.push(`| ${s.turn} | ${s.chapter} | ${s.step} | ${cell(s.thread)} | ${s.outcomeId} (${s.owner}) | ${s.kind} | ${choices || "–"} | ${s.result ?? "–"} | ${s.kind === "exploration" ? yes(s.ownerOverridden) : "–"} | ${ownersRoll} |`);
    }
    const ownersRoll = ownersRollLine(r);
    if (ownersRoll) lines.push("", ownersRoll);
  }
  if (r.players > 1) {
    const lost = r.switchPicks.filter((p) => !p.kept);
    const described = lost.map(
      (p) =>
        `turn ${p.turn}, ${p.slot} picked ${p.pickedOutcome}, planned on ${p.placedOn ?? "no thread"}${p.droppedThreads.length ? ` (the plan check dropped ${p.droppedThreads.join(", ")}, the thread it was also written into)` : ""}${p.repickedTo !== undefined ? ` (the harness re-picked it to direction ${p.repickedTo + 1})` : ""}`
    );
    lines.push("", `Switch picks not followed: ${described.length ? described.join("; ") : "none"} (of ${r.switchPicks.length} picks before chapters after the first).`);
  }
  lines.push("", "### Sacrifices and rewards", "", "| Chapter | Seat | Sets | Sacrifice sets (turns) | Reward sets (turns) | Taken |", "|---|---|---|---|---|---|");
  for (const c of r.chapters) {
    for (const l of c.levers) {
      lines.push(`| ${c.index} | ${l.slot} | ${l.sets} | ${l.sacrificeSets} (${list(l.sacrificeTurns)}) | ${l.rewardSets} (${list(l.rewardTurns)}) | ${list(l.taken.map((t) => `${t.kind} at ${t.turn}`))} |`);
    }
  }
  const noFlags = `no second reward or sacrifice offered in any chapter${r.players === 1 ? ", no reward after a chapter's first step" : ""}, no reward in consecutive chapters`;
  lines.push("", `Against the owner's rule: ${r.leverFlags.length ? r.leverFlags.map((f) => `chapter ${f.chapter}, ${f.slot}: ${f.rule} offered at turn ${list(f.turns)}`).join("; ") : noFlags}.`);
  const paid = r.leversPaid.counts;
  lines.push(
    "",
    `Levers taken and paid on the next turn: applied ${paid.applied}, not applied ${paid.notApplied}, the other way ${paid.otherWay}, written without effect ${paid.noChange}, stat unnamed ${paid.unnamed}, riding on another player's paid change of a shared stat ${paid.sharedOnce}.`,
    ...r.leversPaid.missed.map((m) => `- turn ${m.turn}, ${m.slot}: the previous ${m.kind}${m.stat ? ` of ${m.stat}` : ""}: ${m.status}`),
    ...r.leversPaid.sharedOnce.map((s) => `- turn ${s.turn}: one change of the shared ${s.stat} paid the levers of ${s.slots.join(", ")}`),
    "",
    chargedAgainLine(r),
    "",
    `Stat changes that don't fit their stat: ${r.unfit.length ? "" : "none"}`,
    ...r.unfit.map((u) => `- turn ${u.turn}, ${u.group}: ${u.name}: ${u.kinds.join("; ")}`),
    "",
    ownStatsLine(r),
    "",
    scoreboardLine(r),
    ...r.scoreboard.map((m) => `- turn ${m.turn}, ${m.name}: ${m.before ?? "–"} → ${m.after ?? "–"} after ${m.results.length ? m.results.map((x) => x ?? "no result").join(", ") : "no contest result"}: ${m.reading}${m.repaired ? " (production turned the model's move around)" : ""}`),
    "",
    "### Repairs and retries",
    "",
    `- setup asked again (the story couldn't start): ${r.repairs.setupRetries}${r.repairs.backgroundFixes ? `; background values fixed: ${r.repairs.backgroundFixes}` : ""}`,
    `- plans retried: ${r.repairs.planRetries.length ? r.repairs.planRetries.map((p) => `turn ${p.turn} ${p.kind} (${[p.problem, p.lengthProblem].filter(Boolean).join("; ")})`).join("; ") : "none"}`,
    `- plan repairs: ${counted(r.repairs.planRepairs)}`,
    `- beat repairs: ${counted(r.repairs.beatRepairs)}`,
    `- one-paragraph turns retried: ${list(r.repairs.shortTextRetries)}${r.repairs.shortTextUsedAsIs.length ? ` (the retry was one paragraph too, and was used: ${list(r.repairs.shortTextUsedAsIs)})` : r.repairs.shortTextRetries.length ? " (each retry came back in paragraphs)" : ""}`,
    `- turns without options retried: ${list(r.repairs.optionsRetries)}`,
    `- calls re-sent by the runner: ${r.repairs.resends.length ? r.repairs.resends.map((s) => `turn ${s.turn} ${s.caseId} (${s.outcomes.join(", ")})`).join("; ") : "none"}`,
    `- calls with no usable reply: ${list(r.repairs.failedCalls)}`,
    `- turns production sent again: ${r.repairs.resentTurns.length ? r.repairs.resentTurns.map(resentLine).join("; ") : "none"}`,
    ...r.repairs.resentTurns.flatMap((t) => t.failures.map((f, i) => `  - turn ${t.turn}, ${t.failed[i] === "first" ? "the first send" : `the ${t.failed[i]}`}: ${cell(f)}`)),
    `- production's fixes that fired: ${fixesLine(r)}`,
    `- production would have stopped at: ${r.repairs.stuckTurns.length ? r.repairs.stuckTurns
            .map(
              (s) =>
                `turn ${s.turn} (the ${s.kind} could not be used twice: ${cell(s.failure)}; ${s.rounds} round(s) failed${s.repicks ? `; the harness re-picked the switch: ${s.repicks.map((p) => `${p.slot} direction ${p.from + 1} → ${p.to + 1} (${p.outcomeId})`).join(", ")}` : ""})`
            )
            .join("; ") : "no turn"}`,
    "",
    "### Turn design checks that failed",
    "",
    ...(Object.keys(r.checkFailures).length ? Object.entries(r.checkFailures).map(([name, turns]) => `- ${name}: turns ${turns.join(", ")}`) : ["none"]),
    "",
    "### Plan design checks that failed",
    "",
    ...(Object.keys(r.planCheckFailures).length ? Object.entries(r.planCheckFailures).map(([name, turns]) => `- ${name}: turns ${turns.join(", ")}`) : ["none"]),
    "",
    "### Options and results (judged)",
    "",
    "The choice-result stage's calibrated checks, on Luna low: at each exploration step, does each of a player's options carry out the step's result at its own position (optionsFollowResults)? In each chapter plan, does every result fit its chapter's kind: a challenge or contest result says how the attempt turns out, an exploration result is the player's own choice (resultsFitKind)?",
    "",
    choiceLine("Option sets that carry out the result at each position", r.choices.options, (c) => `turn ${c.turn} ${c.slot}`),
    choiceLine("Chapter plans whose results fit their kind", r.choices.results, (c) => `turn ${c.turn}`),
    "",
    ...(r.kids
      ? [
          "### Read with a child",
          "",
          `${kidsLine(r)} The kids-ages stage's deterministic check (kidsReadability.ts), on the text the child hears.`,
          "",
          "| Turn | Seat | Words | Paragraphs | Words a sentence | Grade | Within the band |",
          "|---|---|---|---|---|---|---|",
          ...r.kids.turns.map((t) => `| ${t.turn} | ${t.slot} | ${t.words} | ${t.paragraphs} | ${t.wordsPerSentence.toFixed(1)} | ${t.grade.toFixed(1)} | ${yes(t.passes)} |`),
          "",
        ]
      : []),
    "### Waits",
    "",
    "| Turn kind | Turns | p50 | p95 | Longest | Allowance | Over it (turns) |",
    "|---|---|---|---|---|---|---|",
    ...r.waits.map((w) => `| ${w.kind} | ${w.turns} | ${w.p50S ?? "–"} s | ${w.p95S ?? "–"} s | ${w.maxS ?? "–"} s | ${w.allowanceS} s | ${list(w.over)} |`),
    "",
    `Turns left out of the waits (the players were told the turn failed, or production could not get past it): ${r.waitsLeftOut.length ? r.waitsLeftOut.map((t) => `turn ${t}`).join(", ") : "none"}.`,
    "",
    "### The ending",
    "",
  );
  if (!r.ending) lines.push("No ending was reached.");
  else {
    lines.push(`Turn ${r.ending.turn}. Each outcome as its milestones leave it (production's own reading):`);
    for (const s of r.ending.states) lines.push(`- ${s.id} (${s.owner}): ${s.milestones} of ${s.intended}, ${s.complete ? "complete" : "unfinished"}`);
    for (const j of r.ending.judged) lines.push(`- judged (${j.label}): ${yes(j.verdict)}${j.evidence ? `: ${cell(j.evidence)}` : ""}${j.lines.length ? ` [${j.lines.map(cell).join(" | ")}]` : ""}`);
  }
  lines.push("");
  return lines;
}

/** playthroughs.md (a later round's own file): a table over the stories, then each story's readings. */
export function renderPlaythroughReadings(runs: PlayRun[], generatedAt: Date, round = 1): string {
  const readings = runs.map(readStory);
  const lines = [
    `# Whole-story playthroughs on production's own code${round > 1 ? `, round ${round}` : ""}`,
    "",
    `Generated ${generatedAt.toISOString()}. Each story: a new setup, character selection and every turn to the ending on production's own code and models (playthroughs.ts); choices by the fixed policy, the game's own dice on a seeded source. Readings are the code's; the report reads the stories by hand too.`,
    "",
    "| Story | Players | Turns | Reached the ending | On its turn count | Chapters | Calls | Cost | Stopped |",
    "|---|---|---|---|---|---|---|---|---|",
    ...readings.map((r) => `| ${r.id} | ${r.players} | ${r.maxTurns} | ${yes(r.complete)} | ${yes(r.endsOnTurnCount.ok)} | ${r.chapters.length} | ${r.cost.calls} | ${usd(r.cost.storyUsd)} | ${cell(r.stopped)} |`),
    "",
  ];
  runs.forEach((run, i) => lines.push(...storySection(run, readings[i])));
  return `${lines.join("\n")}\n`;
}
