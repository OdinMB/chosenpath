import type { SetOfBeatGenerationSchema, Thread, ThreadAnalysis } from "core/types/index.js";
import type { OutcomeState } from "../../game/services/endingStates.js";
import { percentile } from "./armStats.js";
import type { LeverStatus } from "./ratingMechanics.js";
import { playRunId, playthroughArm, type JudgedItem, type PlayCallLog, type PlayRun } from "./playthroughs.js";
import { allowanceFor, type TurnKind } from "./turnWaits.js";

/*
 * What the code checks on a whole played story (playthroughs.ts), beside
 * reading it by hand: the story ends on its turn count; each chapter's length
 * is one PACING allows, and the milestone its switch turn (or the ending)
 * writes lands on its outcome, one per chapter, stage by stage; each switch's
 * late pacing (binding once fewer threads fit than milestones are still
 * needed: every direction on an outcome that still needs milestones, those no
 * chapter has pushed first); sacrifices and rewards per chapter against the
 * owner's rule ("At most one reward is good. Several sacrifices can sometimes
 * make sense, but should have a strong justification starting at the second
 * one": a second reward or sacrifice offered is flagged, and whether a second
 * sacrifice has its reason is read by hand); every lever the player took,
 * paid or not on the next turn; stat changes that don't fit their stat; what
 * production's repairs, retries and re-sends did; the turn design checks that
 * failed; the ending's outcomes as its milestones leave them, with the judged
 * checks; waits per turn kind against their allowances; cost.
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

export type LeverFlag = { chapter: number; slot: string; rule: "second reward" | "second sacrifice"; turns: number[] };

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
  threadsFit: number;
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
  leverFlags: LeverFlag[];
  leversPaid: { counts: Record<LeverStatus, number>; missed: { turn: number; slot: string; kind: string; stat?: string; status: LeverStatus }[] };
  unfit: { turn: number; group: string; name: string; kinds: string[] }[];
  repairs: {
    setupRetries: number;
    backgroundFixes?: string;
    planRetries: { turn: number; kind: string; problem?: string; lengthProblem?: string }[];
    planRepairs: Record<string, number>;
    beatRepairs: Record<string, number>;
    shortTextRetries: number[];
    resends: { turn: number; caseId: string; outcomes: string[] }[];
    failedCalls: string[];
    /** Turns production could not get past (a plan unusable twice fails the turn; nothing sends it again), where the harness asked the planner again */
    stuckTurns: { turn: number; kind: string; failure: string; rounds: number; repicks?: { slot: string; from: number; to: number; outcomeId: string }[] }[];
  };
  /** Turn design checks that failed, with the turns */
  checkFailures: Record<string, number[]>;
  /** Switch and chapter plan design checks that failed (turnDesignChecks.ts), with the turn each plan opened */
  planCheckFailures: Record<string, number[]>;
  ending?: { turn: number; states: OutcomeState[]; judged: JudgedItem[] };
  waits: WaitReading[];
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
    const allowed = planned.pacing.allowedLengths ?? [];
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
    const threadsFit = planned.pacing.threadsFit ?? 0;
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
        stillNeeded,
        binding: threadsFit < stillNeeded,
        checks,
        nextOutcomes,
        ...(nextOutcomes.length ? { nextNeeded: nextOutcomes.every((id) => neededIds.has(id)) } : {}),
      },
    ];
  });
}

const kindOf = (line: string) => line.replace(/^note /, "").split(":")[0];

function countKinds(lines: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of lines) counts[kindOf(line)] = (counts[kindOf(line)] ?? 0) + 1;
  return counts;
}

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
    const plan = turn.plan;
    if (plan) {
      for (const calls of [...(plan.failedRounds ?? []).map((r) => r.calls), plan.calls]) {
        calls.forEach((call, i) => {
          const previous = calls[i - 1];
          if (call.retry && previous) planRetries.push({ turn: turn.turn, kind: plan.kind, ...(previous.problem ? { problem: previous.problem } : {}), ...(previous.lengthProblem ? { lengthProblem: previous.lengthProblem } : {}) });
        });
        read(turn.turn, calls);
      }
    }
    read(turn.turn, turn.calls);
  }
  return {
    setupRetries: Math.max(0, setupCalls.length - 1),
    ...(run.setup?.backgroundFixes ? { backgroundFixes: run.setup.backgroundFixes } : {}),
    planRetries,
    planRepairs: countKinds(run.turns.flatMap((t) => t.plan?.calls.flatMap((c) => c.repairs) ?? [])),
    beatRepairs: countKinds(run.turns.flatMap((t) => t.repairs)),
    shortTextRetries: run.turns.filter((t) => t.calls[0]?.problem !== undefined && t.calls.length > 1).map((t) => t.turn),
    resends,
    failedCalls,
    stuckTurns: run.turns.flatMap((t) => {
      const rounds = t.plan?.failedRounds ?? [];
      const repicks = t.repicks?.map(({ slot, from, to, outcomeId }) => ({ slot, from, to, outcomeId }));
      return rounds.length && t.plan ? [{ turn: t.turn, kind: t.plan.kind, failure: rounds[0].failure, rounds: rounds.length, ...(repicks?.length ? { repicks } : {}) }] : [];
    }),
  };
}

function waitReadings(run: PlayRun): WaitReading[] {
  const beatArm = playthroughArm("beat", run.input.playerCount).key;
  return KINDS.flatMap((kind): WaitReading[] => {
    // A turn production could not get past is no wait a player would have seen (the repairs list it)
    const turns = run.turns.filter((t) => t.kind === kind && t.calls.length > 0 && !t.plan?.failedRounds?.length);
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

/** Every reading the code takes on one played story. */
export function readStory(run: PlayRun): StoryReadings {
  const chapters = chapterReadings(run);
  const ending = run.turns.find((t) => t.kind === "ending");
  const endingTurn = run.complete ? ending?.turn : undefined;
  const leverFlags = chapters.flatMap((chapter) =>
    chapter.levers.flatMap((tally): LeverFlag[] => [
      ...(tally.rewardSets > 1 ? [{ chapter: chapter.index, slot: tally.slot, rule: "second reward" as const, turns: tally.rewardTurns.slice(1) }] : []),
      ...(tally.sacrificeSets > 1 ? [{ chapter: chapter.index, slot: tally.slot, rule: "second sacrifice" as const, turns: tally.sacrificeTurns.slice(1) }] : []),
    ])
  );
  const counts: Record<LeverStatus, number> = { applied: 0, notApplied: 0, otherWay: 0, noChange: 0, unnamed: 0 };
  const missed: StoryReadings["leversPaid"]["missed"] = [];
  for (const turn of run.turns) {
    for (const lever of turn.levers) {
      counts[lever.status]++;
      if (lever.status !== "applied") missed.push({ turn: turn.turn, slot: lever.slot, kind: lever.kind, ...(lever.stat ? { stat: lever.stat.name } : {}), status: lever.status });
    }
  }
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
    leverFlags,
    leversPaid: { counts, missed },
    unfit: run.turns.flatMap((t) => t.unfit.map((u) => ({ turn: t.turn, ...u }))),
    repairs: repairReadings(run),
    checkFailures,
    planCheckFailures,
    ...(ending ? { ending: { turn: ending.turn, states: ending.endingStates ?? [], judged: (run.judged ?? []).filter((j) => j.kind === "ending") } } : {}),
    waits: waitReadings(run),
    cost: {
      storyUsd: sum(setupCalls.map((c) => c.costUsd)) + sum(run.turns.map((t) => t.costUsd)),
      judgeUsd: sum((run.judged ?? []).map((j) => j.costUsd)),
      calls: setupCalls.length + sum(run.turns.map((t) => sum((t.plan?.failedRounds ?? []).map((r) => r.calls.length)) + (t.plan?.calls.length ?? 0) + t.calls.length)),
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
  lines.push("", "### Late pacing", "", "| Switch turn | Threads fit | Still needed | Binds | Checks | Next chapter's outcome | Still needed then |", "|---|---|---|---|---|---|---|");
  for (const p of r.latePacing) {
    const checks = Object.entries(p.checks).map(([name, ok]) => `${name} ${yes(ok)}`);
    lines.push(`| ${p.turn} | ${p.threadsFit} | ${p.stillNeeded} | ${yes(p.binding)} | ${list(checks)} | ${list(p.nextOutcomes)} | ${yes(p.nextNeeded)} |`);
  }
  lines.push("", "### Sacrifices and rewards", "", "| Chapter | Seat | Sets | Sacrifice sets (turns) | Reward sets (turns) | Taken |", "|---|---|---|---|---|---|");
  for (const c of r.chapters) {
    for (const l of c.levers) {
      lines.push(`| ${c.index} | ${l.slot} | ${l.sets} | ${l.sacrificeSets} (${list(l.sacrificeTurns)}) | ${l.rewardSets} (${list(l.rewardTurns)}) | ${list(l.taken.map((t) => `${t.kind} at ${t.turn}`))} |`);
    }
  }
  lines.push("", `Against the owner's rule: ${r.leverFlags.length ? r.leverFlags.map((f) => `chapter ${f.chapter}, ${f.slot}: ${f.rule} offered at turn ${list(f.turns)}`).join("; ") : "no second reward or sacrifice offered in any chapter"}.`);
  const paid = r.leversPaid.counts;
  lines.push(
    "",
    `Levers taken and paid on the next turn: applied ${paid.applied}, not applied ${paid.notApplied}, the other way ${paid.otherWay}, written without effect ${paid.noChange}, stat unnamed ${paid.unnamed}.`,
    ...r.leversPaid.missed.map((m) => `- turn ${m.turn}, ${m.slot}: the previous ${m.kind}${m.stat ? ` of ${m.stat}` : ""}: ${m.status}`),
    "",
    `Stat changes that don't fit their stat: ${r.unfit.length ? "" : "none"}`,
    ...r.unfit.map((u) => `- turn ${u.turn}, ${u.group}: ${u.name}: ${u.kinds.join("; ")}`),
    "",
    "### Repairs and retries",
    "",
    `- setup asked again (the story couldn't start): ${r.repairs.setupRetries}${r.repairs.backgroundFixes ? `; background values fixed: ${r.repairs.backgroundFixes}` : ""}`,
    `- plans retried: ${r.repairs.planRetries.length ? r.repairs.planRetries.map((p) => `turn ${p.turn} ${p.kind} (${[p.problem, p.lengthProblem].filter(Boolean).join("; ")})`).join("; ") : "none"}`,
    `- plan repairs: ${counted(r.repairs.planRepairs)}`,
    `- beat repairs: ${counted(r.repairs.beatRepairs)}`,
    `- one-paragraph turns retried: ${list(r.repairs.shortTextRetries)}`,
    `- calls re-sent by the runner: ${r.repairs.resends.length ? r.repairs.resends.map((s) => `turn ${s.turn} ${s.caseId} (${s.outcomes.join(", ")})`).join("; ") : "none"}`,
    `- calls with no usable reply: ${list(r.repairs.failedCalls)}`,
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
    "### Waits",
    "",
    "| Turn kind | Turns | p50 | p95 | Longest | Allowance | Over it (turns) |",
    "|---|---|---|---|---|---|---|",
    ...r.waits.map((w) => `| ${w.kind} | ${w.turns} | ${w.p50S ?? "–"} s | ${w.p95S ?? "–"} s | ${w.maxS ?? "–"} s | ${w.allowanceS} s | ${list(w.over)} |`),
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

/** playthroughs.md: a table over the stories, then each story's readings. */
export function renderPlaythroughReadings(runs: PlayRun[], generatedAt: Date): string {
  const readings = runs.map(readStory);
  const lines = [
    "# Whole-story playthroughs on production's own code",
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
