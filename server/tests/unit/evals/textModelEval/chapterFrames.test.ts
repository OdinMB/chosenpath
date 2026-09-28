import { jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { StoryState, ThreadAnalysis } from "core/types/index.js";
import {
  STATE_MARKER,
  backfillCaseId,
  backfillJobs,
  backfillRequest,
  chapterFrameChecks,
  chapterFramesFile,
  chapterKeyOf,
  collectChapters,
  framesFromReply,
  stateAtChapterStart,
  withChapterFrames,
  type ChapterFramesFile,
} from "../../../../src/evals/textModelEval/chapterFrames.js";
import { caseStory, type EvalCase } from "../../../../src/evals/textModelEval/cases.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { keyOf } from "../../../../src/evals/textModelEval/runner.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { round0ThreadStep as threadStep } from "../../../../src/game/services/storyTextRound0/round0Steps.js";
import { firstSwitchBeat, firstThreadAnalysis, resolvedThread } from "../../../helpers/promptStories.js";
import { outcome, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { LUNA, evalCase, record, tags } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The second chapter (turns 4 to 6) of a story whose first chapter (turns 1 and 2) pushed outcome_1. */
function secondChapter(stepsDone: number): { state: StoryState; phase: ThreadAnalysis } {
  const base = firstThreadAnalysis(1, { maxTurns: 20 }).getState();
  const phase = threadAnalysis("challenge", 3, 4);
  phase.threads[0].id = "second_chapter";
  phase.threads[0].typeOfThread = "Heist";
  const played: ThreadAnalysis = {
    ...phase,
    threads: phase.threads.map((t) => ({ ...t, progression: t.progression.map((s, i) => ({ ...s, resolution: i < stepsDone ? ("favorable" as const) : null })) })),
  };
  const first = resolvedThread(2, 1, 1, "First Chapter");
  first.threads[0].typeOfThread = "Chase";
  const history = Array.from({ length: 4 + stepsDone }, (_, i) => ({ ...base.players.player1.beatHistory[0], text: `turn ${i}`, choice: 0, resolution: "favorable" as const }));
  const state: StoryState = {
    ...base,
    storyPhases: [switchAnalysis(["player1"], 0), first, switchAnalysis(["player1"], 3), played],
    players: {
      player1: {
        ...base.players.player1,
        beatHistory: history,
        outcomes: [outcome("outcome_1", { milestones: ["first milestone", "second milestone"] })],
        previousTypesOfThreads: ["Heist", "Chase"],
      },
    },
  };
  return { state, phase };
}

describe("chapterKeyOf", () => {
  it("keys a chapter by its story and plan as planned, whatever its steps' results", () => {
    const { state: early, phase } = secondChapter(0);
    const { state: late } = secondChapter(2);
    const planned = (s: StoryState) => s.storyPhases[3] as ThreadAnalysis;
    expect(chapterKeyOf(early.id, planned(early))).toBe(chapterKeyOf(late.id, planned(late)));
    expect(chapterKeyOf(early.id, phase)).toBe(chapterKeyOf(late.id, planned(late)));
    expect(chapterKeyOf("another-story", phase)).not.toBe(chapterKeyOf(early.id, phase));
    const renamed = structuredClone(phase);
    renamed.threads[0].progression[1].question = "Another question?";
    expect(chapterKeyOf(early.id, renamed)).not.toBe(chapterKeyOf(early.id, phase));
  });
});

describe("stateAtChapterStart", () => {
  it("cuts a later state back to the chapter's start: earlier phases, earlier turns, earlier milestones and thread types", () => {
    const { state } = secondChapter(2);
    const start = stateAtChapterStart(state, 3);
    expect(start.storyPhases).toHaveLength(3);
    expect(start.players.player1.beatHistory.map((b) => b.text)).toEqual(["turn 0", "turn 1", "turn 2", "turn 3"]);
    // The first chapter recorded one milestone on outcome_1; the second was recorded later
    expect(start.players.player1.outcomes[0].milestones).toEqual(["first milestone"]);
    expect(start.players.player1.previousTypesOfThreads).toEqual(["Chase"]);
    // The chapter planner runs here: the last turn is the switch, and a thread comes next
    expect(Story.create(start).determineNextBeatType()).toBe("thread");
    expect(state.storyPhases).toHaveLength(4);
  });

  it("refuses a phase that is not a thread plan", () => {
    expect(() => stateAtChapterStart(secondChapter(1).state, 2)).toThrow("not a thread plan");
  });
});

describe("collectChapters", () => {
  const { state: opening, phase } = (() => {
    const { state, phase: planned } = secondChapter(0);
    return { state: { ...state, storyPhases: state.storyPhases.slice(0, 3) }, phase: planned };
  })();
  const openingCase = evalCase("cont-open-t4", "beat", { state: opening, fixedAnalysis: { kind: "thread", phase }, tags: tags({ analysisTurn: true }) });
  const step2 = evalCase("cont-step-t5", "beat", { state: secondChapter(1).state });
  const step3 = evalCase("cont-step-t6", "beat", { state: secondChapter(2).state });
  const switchCase = evalCase("switch-first-t0", "switch", { state: firstSwitchBeat(1).getState() });

  it("finds each chapter once, from the planner's own input when a chapter-opening case holds it", () => {
    const chapters = collectChapters([step3, openingCase, step2, switchCase]);
    expect(chapters).toHaveLength(1);
    const [chapter] = chapters;
    expect(chapter).toMatchObject({ sourceCaseId: "cont-open-t4", exactInput: true, firstBeatIndex: 4, players: 1 });
    expect(chapter.readBy).toEqual(["cont-step-t6", "cont-open-t4", "cont-step-t5"]);
    expect(chapter.threads[0].progression.every((s) => !("resolution" in s))).toBe(true);
    expect(chapter.story.getState()).toEqual(caseStory(openingCase, false).getState());
  });

  it("otherwise cuts back the earliest state that holds the chapter", () => {
    const [chapter] = collectChapters([step3, step2]);
    expect(chapter).toMatchObject({ sourceCaseId: "cont-step-t5", exactInput: false });
    expect(chapter.story.getCurrentTurn()).toBe(4);
  });

  it("builds a request with the fixed chapter and the chapter planner's own view of the story", () => {
    const [chapter] = collectChapters([openingCase]);
    const { prompt, schema } = backfillRequest(chapter);
    const planner = threadStep.request(chapter.story).prompt;
    expect(planner.split(STATE_MARKER)).toHaveLength(2);
    expect(prompt.endsWith(planner.split(STATE_MARKER)[1])).toBe(true);
    expect(prompt).toContain("Chapter second_chapter: A Thread");
    expect(prompt).toContain("Steps (3):");
    expect(prompt).toContain("Will Sir Bram suspend the Guild's bounty on goblins?");
    expect(schema.safeParse({ chapters: [{ id: "second_chapter", question: "Q?", plan: "P." }] }).success).toBe(true);
    expect(schema.safeParse({ chapters: [{ id: "another", question: "Q?", plan: "P." }] }).success).toBe(false);
  });

  it("plans one backfill call per chapter in the turn rounds' stage, keyed by the chapter", () => {
    const chapters = collectChapters([openingCase, step2]);
    const [job] = backfillJobs(chapters, LUNA, "round0");
    expect(job).toMatchObject({ stage: "turn-rounds", group: "prep", caseId: backfillCaseId(chapters[0]), armKey: `backfill>${LUNA.key}` });
    expect(job.first.role).toBe("thread");
  });
});

describe("the backfilled frames", () => {
  const { state, phase } = secondChapter(1);
  const step = evalCase("cont-step-t5", "beat", { state });
  const first = evalCase("first-t0", "beat", { state: firstSwitchBeat(1).getState(), tags: tags({ firstBeat: true }) });
  const other = evalCase("cont-other-t2", "beat", {
    state: { ...firstThreadAnalysis(1).getState(), id: "other-story", storyPhases: [switchAnalysis(["player1"], 0), threadAnalysis("challenge", 2, 1)] },
  });
  const reply = { chapters: [{ id: "second_chapter", question: "  Will the crew crack the vault?  ", plan: "The crew stays in the vault." }] };
  // Planned in each test, after the console spy: building a request logs the mock story's missing elements
  let chapters: ReturnType<typeof collectChapters>;
  let jobs: ReturnType<typeof backfillJobs>;
  beforeEach(() => {
    chapters = collectChapters([step, other]);
    jobs = backfillJobs(chapters, LUNA, "round0");
  });

  it("reads each chapter's question and plan, and names a chapter the reply left out", () => {
    expect(framesFromReply(chapters[0], reply)).toEqual({ frames: { second_chapter: { question: "Will the crew crack the vault?", plan: "The crew stays in the vault." } } });
    expect(framesFromReply(chapters[0], { chapters: [{ id: "second_chapter", question: "", plan: "P." }] }).problem).toContain("second_chapter");
    expect(framesFromReply(chapters[0], undefined).problem).toContain("second_chapter");
  });

  it("writes chapter-frames.json from the backfill records, listing the chapters without a usable reply", () => {
    const records = [record({ jobKey: keyOf(jobs[0]), outputFile: "outputs/frame.json", callArmKey: LUNA.key, stage: "turn-rounds" })];
    const file = chapterFramesFile(chapters, jobs, records, () => reply, new Date("2026-09-27T00:00:00Z"));
    expect(file.chapters).toHaveLength(1);
    expect(file.chapters[0]).toMatchObject({ chapterKey: chapterKeyOf(state.id, phase), threadIds: ["second_chapter"], outputFile: "outputs/frame.json", readBy: ["cont-step-t5"] });
    expect(file.missing.map((m) => m.readBy)).toEqual([["cont-other-t2"]]);
  });

  it("attaches the frame to every case that reads the chapter, tags the others' chapters fallback, and leaves first beats alone", () => {
    const file: ChapterFramesFile = {
      generatedAt: "",
      missing: [],
      chapters: [{ ...chapterFramesFile(chapters, jobs, [record({ jobKey: keyOf(jobs[0]) })], () => reply, new Date()).chapters[0] }],
    };
    const [framed, fallback, untouched] = withChapterFrames([step, other, first], file);
    expect(framed.tags.chapterFrame).toBe("backfilled");
    expect(framed.chapterFrames?.second_chapter).toEqual({ question: "Will the crew crack the vault?", plan: "The crew stays in the vault.", chapterKey: chapters[0].chapterKey });
    expect(fallback.tags.chapterFrame).toBe("fallback");
    expect(fallback.chapterFrames).toBeUndefined();
    expect(untouched).toBe(first);
    // No production request reads the frames
    const prod = (c: EvalCase) => requestText(requestFor("prod", requestInputFor(c)));
    expect(prod(framed)).toBe(prod(step));
  });

  it("reads each stored chapter once on its frame's question and its plan's kind of milestone (the owner's feedback of 2026-09-28)", () => {
    const withFrame = (question: string, typeOfMilestone: string) => {
      const planned = structuredClone(state);
      (planned.storyPhases[3] as ThreadAnalysis).threads[0].typeOfMilestone = typeOfMilestone;
      const stepCase = evalCase("cont-step-t5", "beat", { state: planned });
      const later = evalCase("cont-step-t6", "beat", { state: { ...planned, players: { player1: { ...planned.players.player1, beatHistory: [...planned.players.player1.beatHistory, planned.players.player1.beatHistory[0]] } } } });
      const [chapter] = collectChapters([stepCase]);
      const file: ChapterFramesFile = {
        generatedAt: "",
        missing: [],
        chapters: [{ ...chapterFramesFile([chapter], backfillJobs([chapter], LUNA, "round0"), [record({ jobKey: keyOf(backfillJobs([chapter], LUNA, "round0")[0]) })], () => ({ chapters: [{ id: "second_chapter", question, plan: "P." }] }), new Date()).chapters[0] }],
      };
      return chapterFrameChecks(withChapterFrames([stepCase, later, first], file));
    };
    // The fixture's outcome asks "Question of outcome_1?"
    const restated = withFrame("Question of outcome_1?", "Milestone marking progress on outcome_1");
    expect(restated).toEqual([{ chapterKey: expect.any(String), storyId: state.id, threadId: "second_chapter", checks: { questionNearerThanOutcome: false, milestoneKindConcrete: false } }]);
    const nearer = withFrame("Will the crew crack the vault before dawn?", "whether the vault opens");
    expect(nearer.map((r) => r.checks)).toEqual([{ questionNearerThanOutcome: true, milestoneKindConcrete: true }]);
    // A chapter without a frame reads on its kind of milestone only
    expect(chapterFrameChecks([step]).map((r) => r.checks)).toEqual([{ milestoneKindConcrete: false }]);
  });
});
