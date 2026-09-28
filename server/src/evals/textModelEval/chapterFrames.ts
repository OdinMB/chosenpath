import { z } from "zod";
import { Story } from "core/models/Story.js";
import type { Outcome, StoryPhase, StoryState, Thread, ThreadAnalysis } from "core/types/index.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
// The chapter planner's view as production built it at the round0 prompt state, so the backfill requests stay as they ran
import { round0ThreadStep as threadStep } from "../../game/services/storyTextRound0/round0Steps.js";
import type { Arm } from "./arms.js";
import { caseStory, type ChapterFrame, type EvalCase } from "./cases.js";
import { sha256 } from "./executor.js";
import { finishedPrepRecord, prepJob } from "./prepCalls.js";
import { keyOf, type CallRecord, type Job } from "./runner.js";

/*
 * The chapter backfill (turn doc section 4, "Before round 1", item 5): the
 * stored chapter plans were written on today's form, so they have no chapter
 * question and no chapter plan (A3), and B2's chapter block would read in its
 * fallback form. One cheap call per stored chapter asks for those two fields
 * only, with the chapter's steps shown as fixed, and the answers become
 * chapter-frames.json. When the cases are read, each case that reads a
 * chapter carries that chapter's frame (chapterFrames) and the tag
 * chapterFrame "backfilled", or "fallback" when its chapter has none, so a
 * round reports the two apart.
 *
 * A chapter is the thread plan a case reads: its fixed thread analysis (a
 * chapter-opening turn) or the latest thread plan in its state (a step, the
 * switch after it, the ending, a planner after it). Chapters are keyed by
 * story and plan as planned (no step results), so the cases that share one
 * share its frame. The backfill call sees the story as the chapter planner
 * saw it: exactly, when a case's fixed analysis is the chapter; otherwise the
 * earliest case state holding it, cut back to the chapter's start (its turns
 * and later plans removed, milestones and thread-type history recomputed;
 * stats, facts and elements stay as that case has them).
 */

/** Where the chapter planner's view of the story starts (ThreadPromptService). */
export const STATE_MARKER = "\n\n======= CURRENT GAME STATE =======\n";

/** A thread as its plan was written: no step results, no milestone. */
export type PlannedThread = Pick<
  Thread,
  "id" | "title" | "outcomeId" | "playersSideA" | "playersSideB" | "typeOfThread" | "typeOfMilestone" | "possibleMilestones"
> & { progression: Pick<Thread["progression"][number], "title" | "question" | "possibleResolutions">[] };

export type Chapter = {
  chapterKey: string;
  storyId: string;
  firstBeatIndex: number;
  threads: PlannedThread[];
  /** The case whose state gives the planner's view */
  sourceCaseId: string;
  /** The source is the planner's own input (a chapter-opening case), not a later state cut back */
  exactInput: boolean;
  /** The story as the chapter planner saw it, before the chapter's first turn */
  story: Story;
  players: number;
  /** Every case that reads this chapter */
  readBy: string[];
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isThreadPhase = (phase: StoryPhase): phase is ThreadAnalysis => "threads" in phase;

export function plannedThread(thread: Thread): PlannedThread {
  return {
    id: thread.id,
    title: thread.title,
    outcomeId: thread.outcomeId,
    playersSideA: thread.playersSideA,
    playersSideB: thread.playersSideB,
    typeOfThread: thread.typeOfThread,
    typeOfMilestone: thread.typeOfMilestone,
    possibleMilestones: thread.possibleMilestones,
    progression: thread.progression.map((step) => ({ title: step.title, question: step.question, possibleResolutions: step.possibleResolutions })),
  };
}

/** Story and plan as planned: the same chapter in every case that reads it, whatever its steps' results. */
export function chapterKeyOf(storyId: string, phase: ThreadAnalysis): string {
  return sha256(JSON.stringify({ storyId, firstBeatIndex: phase.firstBeatIndex, threads: phase.threads.map(plannedThread) })).slice(0, 12);
}

type Read = { phase: ThreadAnalysis; exact?: Story; index?: number };

/** The chapter a turn or planning case reads, if any: its fixed thread analysis, else its state's latest thread plan. */
function chapterRead(evalCase: EvalCase): Read | undefined {
  if (!evalCase.state || !["beat", "switch", "thread"].includes(evalCase.role)) return undefined;
  if (evalCase.fixedAnalysis?.kind === "thread") return { phase: evalCase.fixedAnalysis.phase, exact: caseStory(evalCase, false) };
  const phases = evalCase.state.storyPhases;
  for (let index = phases.length - 1; index >= 0; index--) {
    const phase = phases[index];
    if (isThreadPhase(phase)) return { phase, index };
  }
  return undefined;
}

/** The chapter key a case reads, if any. */
export function chapterKeyRead(evalCase: EvalCase): { chapterKey: string; threadIds: string[] } | undefined {
  const read = chapterRead(evalCase);
  if (!read || !evalCase.state) return undefined;
  return { chapterKey: chapterKeyOf(evalCase.state.id, read.phase), threadIds: read.phase.threads.map((t) => t.id) };
}

/**
 * A state cut back to the start of the chapter at this phase index: the
 * phases before it, each player's turns before its first beat, the milestones
 * the earlier chapters recorded and the thread types they set. Stats, facts
 * and story elements stay as they are.
 */
export function stateAtChapterStart(state: StoryState, phaseIndex: number): StoryState {
  const phase = state.storyPhases[phaseIndex];
  if (!phase || !isThreadPhase(phase)) throw new Error(`Phase ${phaseIndex} is not a thread plan`);
  const earlier = state.storyPhases.slice(0, phaseIndex);
  const earlierThreads = earlier.filter(isThreadPhase).flatMap((p) => p.threads);
  const recorded = (outcome: Outcome): Outcome => ({
    ...outcome,
    milestones: (outcome.milestones ?? []).slice(0, earlierThreads.filter((t) => t.outcomeId === outcome.id && t.resolution).length),
  });
  const start = clone(state);
  start.storyPhases = earlier;
  start.sharedOutcomes = (start.sharedOutcomes ?? []).map(recorded);
  for (const player of Object.values(start.players)) {
    player.beatHistory = player.beatHistory.slice(0, phase.firstBeatIndex);
    player.outcomes = (player.outcomes ?? []).map(recorded);
    player.previousTypesOfThreads = [];
  }
  // The thread types the earlier chapters set, newest first, as the game keeps them
  let story = Story.create(start);
  for (const p of earlier.filter(isThreadPhase)) story = story.updatePlayerPreviousThreadTypes(p.threads);
  return story.getState();
}

/**
 * Every chapter the turn and planning cases read, once each, with the best
 * view of its start: a chapter-opening case's own input when one exists,
 * else the earliest case state that holds the chapter, cut back.
 */
export function collectChapters(cases: EvalCase[]): Chapter[] {
  const chapters = new Map<string, Chapter>();
  /** The turn of each chapter's source state, to keep the earliest */
  const sourceTurn = new Map<string, number>();
  for (const evalCase of cases) {
    const read = chapterRead(evalCase);
    const state = evalCase.state;
    if (!read || !state) continue;
    const chapterKey = chapterKeyOf(state.id, read.phase);
    const turn = Story.create(state).getCurrentTurn();
    const source = () => ({
      sourceCaseId: evalCase.id,
      exactInput: read.exact !== undefined,
      story: read.exact ?? Story.create(stateAtChapterStart(state, read.index as number)),
    });
    const known = chapters.get(chapterKey);
    if (known) {
      known.readBy.push(evalCase.id);
      // Prefer the planner's own input, then the earliest state holding the chapter
      const better = !known.exactInput && (read.exact !== undefined || turn < (sourceTurn.get(chapterKey) ?? Infinity));
      if (better) {
        Object.assign(known, source());
        sourceTurn.set(chapterKey, turn);
      }
      continue;
    }
    chapters.set(chapterKey, {
      chapterKey,
      storyId: state.id,
      firstBeatIndex: read.phase.firstBeatIndex,
      threads: read.phase.threads.map(plannedThread),
      ...source(),
      players: Object.keys(state.players).length,
      readBy: [evalCase.id],
    });
    sourceTurn.set(chapterKey, turn);
  }
  return [...chapters.values()];
}

/** The two fields, worded as turn doc A3 proposes them for the chapter planner's reply. */
export const QUESTION_DESCRIPTION =
  "The one question this chapter decides about its outcome, in the story's own names; its three possible milestones are the answers. After a flavor switch: the switch's question, sharpened for this chapter. After a topic switch: the chosen direction, asked as a question. Weak: 'Will Rikkit succeed?' Good: 'Will Sir Bram suspend the Guild's bounty on goblins?'";
export const PLAN_DESCRIPTION =
  "The plan for the storyteller who writes this chapter's turns; they read it at every step. Two or three sentences: the one situation the chapter stays in and who pushes back, how it rises to its last step, and what the player can win or lose. In multiplayer, also what each player does. No ids.";

const INSTRUCTIONS = `YOUR JOB: COMPLETE A CHAPTER PLAN

A chapter (a thread of 2 to 4 turns) of this interactive story has been planned: its outcome, its possible milestones and its steps are fixed below and stay as they are. Write the two things its plan still lacks, for each chapter listed:
- question: ${QUESTION_DESCRIPTION}
- plan: ${PLAN_DESCRIPTION}

Write them as they stood when the chapter was planned: the game state below is the story as the chapter planner saw it, before the chapter's first turn. The steps keep their own questions; the chapter question is the one they all work toward, and the plan tells the storyteller how the steps build to the last one.`;

function outcomeLine(story: Story, id: string): string {
  const outcome = story.getOutcomeById(id);
  return outcome ? `${outcome.question} (${id})` : `${id} (not among the story's outcomes)`;
}

function playerLine(story: Story, thread: PlannedThread): string {
  const name = (slot: string) => `${story.getPlayer(slot)?.name ?? slot} (${slot})`;
  return thread.playersSideB.length > 0
    ? `Side A: ${thread.playersSideA.map(name).join(", ")}; Side B: ${thread.playersSideB.map(name).join(", ")}`
    : thread.playersSideA.map(name).join(", ");
}

const results = (value: object) =>
  Object.entries(value)
    .map(([key, text]) => `${key}: ${String(text)}`)
    .join("; ");

/** The chapter as its plan was written, for the backfill prompt. */
export function renderChapter(chapter: Chapter): string {
  return chapter.threads
    .map((thread) =>
      [
        `Chapter ${thread.id}: ${thread.title}`,
        `Players: ${playerLine(chapter.story, thread)}`,
        `Outcome: ${outcomeLine(chapter.story, thread.outcomeId)}`,
        `Type of thread: ${thread.typeOfThread}`,
        `Kind of milestone: ${thread.typeOfMilestone}`,
        `Possible milestones (one is added to the outcome when the chapter ends): ${results(thread.possibleMilestones)}`,
        `Steps (${thread.progression.length}):`,
        ...thread.progression.map((step, i) => `${i + 1}. ${step.title}: ${step.question}\n   Possible results: ${results(step.possibleResolutions)}`),
      ].join("\n")
    )
    .join("\n\n");
}

/** One entry per chapter, keyed by the chapter's id. */
export function frameSchema(threadIds: string[]) {
  const [first, ...rest] = threadIds;
  if (first === undefined) throw new Error("A chapter plan holds no thread");
  return z.object({
    chapters: z
      .array(
        z.object({
          id: z.enum([first, ...rest]).describe("The chapter's id, as listed above"),
          question: z.string().describe(QUESTION_DESCRIPTION),
          plan: z.string().describe(PLAN_DESCRIPTION),
        })
      )
      .describe("One entry for each chapter listed above, in the same order"),
  });
}

/** The backfill request: the instructions, the fixed chapter, and the chapter planner's own view of the story. */
export function backfillRequest(chapter: Chapter): TextRequest {
  const plannerPrompt = threadStep.request(chapter.story).prompt;
  const at = plannerPrompt.indexOf(STATE_MARKER);
  if (at < 0 || plannerPrompt.indexOf(STATE_MARKER, at + 1) >= 0) {
    throw new Error("The chapter planner's prompt no longer holds its state marker exactly once: fix STATE_MARKER, not the prompt");
  }
  const prompt = [
    INSTRUCTIONS,
    "======= THE CHAPTER, AS PLANNED (FIXED) =======",
    renderChapter(chapter),
    "======= CURRENT GAME STATE =======",
    plannerPrompt.slice(at + STATE_MARKER.length),
  ].join("\n\n");
  return { prompt, schema: frameSchema(chapter.threads.map((t) => t.id)) };
}

export type FrameReply = { frames: Record<string, { question: string; plan: string }>; problem?: string };

/** The reply's question and plan per chapter; a missing or empty field is a problem. */
export function framesFromReply(chapter: Chapter, parsed: unknown): FrameReply {
  const entries = Array.isArray((parsed as { chapters?: unknown })?.chapters) ? (parsed as { chapters: unknown[] }).chapters : [];
  const frames: FrameReply["frames"] = {};
  for (const entry of entries) {
    const { id, question, plan } = (entry ?? {}) as Record<string, unknown>;
    if (typeof id === "string" && typeof question === "string" && typeof plan === "string" && question.trim() && plan.trim()) {
      frames[id] = { question: question.trim(), plan: plan.trim() };
    }
  }
  const missing = chapter.threads.map((t) => t.id).filter((id) => !frames[id]);
  return missing.length ? { frames, problem: `no question or plan for ${missing.join(", ")}` } : { frames };
}

/** A Luna low reply: reasoning plus two short fields per chapter */
const BACKFILL_OUTPUT_TOKENS = 1_500;

export const backfillCaseId = (chapter: Pick<Chapter, "chapterKey">) => `frame-${chapter.chapterKey}`;

/** One backfill call per chapter, in the turn rounds' stage. */
export function backfillJobs(chapters: Chapter[], arm: Arm, promptState: string): Job[] {
  return chapters.map((chapter) =>
    prepJob({
      kind: "backfill",
      stage: "turn-rounds",
      promptState,
      caseId: backfillCaseId(chapter),
      sample: 1,
      arm,
      role: "thread",
      players: chapter.players,
      build: () => backfillRequest(chapter),
      outputTokens: BACKFILL_OUTPUT_TOKENS,
    })
  );
}

export type ChapterFrameRecord = {
  chapterKey: string;
  storyId: string;
  firstBeatIndex: number;
  threadIds: string[];
  sourceCaseId: string;
  exactInput: boolean;
  readBy: string[];
  armKey: string;
  jobKey: string;
  outputFile: string;
  frames: Record<string, { question: string; plan: string }>;
};

export type ChapterFramesFile = {
  generatedAt: string;
  chapters: ChapterFrameRecord[];
  /** Chapters with no usable reply, and why */
  missing: { chapterKey: string; readBy: string[]; reason: string }[];
};

/** chapter-frames.json from the chapters and their backfill calls. */
export function chapterFramesFile(
  chapters: Chapter[],
  jobs: Job[],
  records: CallRecord[],
  load: (record: CallRecord) => unknown,
  generatedAt: Date
): ChapterFramesFile {
  const file: ChapterFramesFile = { generatedAt: generatedAt.toISOString(), chapters: [], missing: [] };
  chapters.forEach((chapter, i) => {
    const jobKey = keyOf(jobs[i]);
    const record = finishedPrepRecord(records, jobKey);
    const parsed = record ? load(record) : undefined;
    const reply = parsed === undefined ? undefined : framesFromReply(chapter, parsed);
    if (!record || !reply || reply.problem) {
      file.missing.push({ chapterKey: chapter.chapterKey, readBy: chapter.readBy, reason: reply?.problem ?? "no usable reply" });
      return;
    }
    file.chapters.push({
      chapterKey: chapter.chapterKey,
      storyId: chapter.storyId,
      firstBeatIndex: chapter.firstBeatIndex,
      threadIds: chapter.threads.map((t) => t.id),
      sourceCaseId: chapter.sourceCaseId,
      exactInput: chapter.exactInput,
      readBy: chapter.readBy,
      armKey: record.callArmKey,
      jobKey,
      outputFile: record.outputFile as string,
      frames: reply.frames,
    });
  });
  return file;
}

/**
 * The cases with their chapter's frame attached: chapterFrames per thread id
 * and the tag chapterFrame "backfilled", or "fallback" when the chapter they
 * read has none. Cases that read no chapter are left as they are.
 */
export function withChapterFrames(cases: EvalCase[], file: ChapterFramesFile): EvalCase[] {
  const byKey = new Map(file.chapters.map((c) => [c.chapterKey, c]));
  return cases.map((evalCase) => {
    const read = chapterKeyRead(evalCase);
    if (!read) return evalCase;
    const record = byKey.get(read.chapterKey);
    if (!record) return { ...evalCase, tags: { ...evalCase.tags, chapterFrame: "fallback" } };
    const chapterFrames: Record<string, ChapterFrame> = Object.fromEntries(
      read.threadIds.flatMap((id) => (record.frames[id] ? [[id, { ...record.frames[id], chapterKey: read.chapterKey }]] : []))
    );
    return { ...evalCase, chapterFrames, tags: { ...evalCase.tags, chapterFrame: "backfilled" } };
  });
}
