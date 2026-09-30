import { jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, type GameMode, type ThreadAnalysis } from "core/types/index.js";
import { exampleBlock } from "../../../../src/evals/textModelEval/setupDesignChecks.js";
import {
  ROUND1B_PARTS,
  ROUND1C_PARTS,
  ROUND3_PARTS,
  ROUND3C_PARTS,
  ROUND3D_PARTS,
  WORKED_EXAMPLE_HEADING,
  iterationRequestFromRound1,
  iterationRound1Request,
  setupRequestFromRound1,
  setupRound1Request,
} from "../../../../src/game/services/storyTextRounds/setupRound1.js";
import { ROUND2B_BASE_PARTS, iterationRound2Request, setupRound2Request, type Round2Order } from "../../../../src/game/services/storyTextRounds/setupRound2.js";
import { IDENTITY_CLAUSE_GROUPS_NAMELESS, IDENTITY_CLAUSE_NO_STAT_NAMES } from "../../../../src/game/services/storyTextRounds/setupRound3Text.js";
import { plannerV2SwitchRequest, plannerV2ThreadRequest } from "../../../../src/game/services/storyTextRounds/turnRound1Planners.js";
import { todaysFormWithB6Request } from "../../../../src/game/services/storyTextRounds/turnRound2.js";
import { MIN_MEASURED_RECORDS } from "../../../../src/evals/textModelEval/pricing.js";
import {
  CHOICE_RESULT_BUILT_CASES,
  CHOICE_RESULT_STORED_CASES,
  CHOICE_RESULT_STORED_PLAN_CASES,
  ENDING_STATE_BUILT_CASES,
  ENDING_STATE_STORED_CASES,
  FINAL_CHECK_SETUP_PREMISES,
  FINAL_CHECK_TEMPLATE_PREMISES,
  OPTIONS_O2_CASES,
  PARALLEL_THREADS_CASES,
  ROUND2_SWITCH_CHAIN_CASES,
  ROUND3_PROBLEM_TURN,
  ROUND3_REPLAY_CASES,
  ROUND3_REPLAY_SAMPLES,
  RUNAWAY_CASES,
  STAGE_SCOPING_NEW_CASES,
  STAGES,
  chainSides,
} from "../../../../src/evals/textModelEval/arms.js";
import { productionCallLimits } from "../../../../src/shared/llm/chatModel.js";
import { SWITCH_REMINDER } from "../../../../src/game/services/storyTextRounds/switchReminder.js";
import { CHOICE_RESULT_TEXT, productionTurnToday } from "../../../../src/game/services/storyTextRounds/choiceResult.js";
import { beatReplyProblem, missingOptionsProblem, shortTextProblem, withBeatProblem } from "../../../../src/game/services/beatChecks.js";
import { SETUP_PREMISES } from "../../../../src/evals/textModelEval/setupPremises.js";
import { setupStep } from "../../../../src/game/services/storyTextSteps.js";
import { planJobs, rebuiltToday, requestInputFor, sameRequestAs, storyAfterAnalysis, todaysRequestHash, type PlanOptions } from "../../../../src/evals/textModelEval/jobPlan.js";
import { keyOf, type CallRecord, type Job } from "../../../../src/evals/textModelEval/runner.js";
import { TRIGGER_THREAD_CASES } from "../../../../src/evals/textModelEval/triggerCases.js";
import { caseStory, type EvalCase } from "../../../../src/evals/textModelEval/cases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import {
  assembledReply,
  callLimitsOf,
  isSplitRequest,
  requestFor,
  requestText,
  retiredPromptStateProblem,
  type RequestInput,
  type VariantId,
} from "../../../../src/evals/textModelEval/variants.js";
import { NO_EMPTY_ITEMS } from "../../../../src/game/services/storyTextRewrite/common.js";
import type { Story } from "core/models/Story.js";
import {
  endingBeat,
  firstSwitchBeat,
  laterSwitchBeat,
  threadAnalysisAfterSwitch,
  threadBeat,
} from "../../../helpers/promptStories.js";
import { createMockMultiplayerStory, createMockStoryState } from "../../../helpers/testHelpers.js";
import { outcome, threadAnalysis } from "../../../helpers/textFixtures.js";
import { evalCase, record, tags } from "./fixtures.js";

beforeEach(() => {
  // Beat prompts log that the mock stories have no story elements
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("planJobs: --no-mp-continuations", () => {
  const multiplayerState = createMockMultiplayerStory(2).getState();
  const multiplayer = { multiplayer: true, players: 2 };
  const cases = [
    evalCase("sp-continuation", "beat", { state: createMockStoryState() }),
    evalCase("mp-first", "beat", { state: multiplayerState, tags: tags({ ...multiplayer, firstBeat: true }) }),
    evalCase("mp-ending", "beat", { state: multiplayerState, tags: tags({ ...multiplayer, ending: true }) }),
    evalCase("mp-continuation", "beat", { state: multiplayerState, tags: tags(multiplayer) }),
  ];
  const options = (skip: boolean): PlanOptions => ({
    stage: "0",
    promptState: "postfix",
    roles: ["beat"],
    mode: "isolated",
    samples: 1,
    subset15: false,
    skipMultiplayerContinuations: skip,
    records: [],
  });

  it("drops multiplayer continuation beats and keeps first beats, endings and single-player beats", () => {
    expect(new Set(planJobs(cases, options(true)).map((j) => j.caseId))).toEqual(new Set(["sp-continuation", "mp-first", "mp-ending"]));
  });

  it("keeps every beat case without the flag", () => {
    expect(new Set(planJobs(cases, options(false)).map((j) => j.caseId))).toEqual(new Set(cases.map((c) => c.id)));
  });
});

describe("requestInputFor: the chapter frames a beat case carries", () => {
  it("gives the reruns' framed turn (chapterFullB) the nearer frame and turn round 1's form the first one; production's form reads neither", () => {
    const state = threadBeat(1).getState();
    const threadId = (state.storyPhases[state.storyPhases.length - 1] as { threads: { id: string }[] }).threads[0].id;
    const frame = (question: string) => ({ [threadId]: { question, plan: "Stay in the vault.", chapterKey: "k" } });
    const plain = evalCase("sp", "beat", { state });
    const framed: EvalCase = { ...plain, chapterFrames: frame("First question?"), nearerFrames: frame("Nearer question?") };
    const prompt = (variant: VariantId, c: EvalCase = framed) => requestText(requestFor(variant, requestInputFor(c)));
    expect(prompt("chapterFullB")).toContain("It decides: Nearer question?");
    expect(prompt("chapterFull")).toContain("It decides: First question?");
    expect(prompt("chapterFull")).not.toContain("Nearer question?");
    expect(prompt("prod")).toBe(prompt("prod", plain));
  });
});

describe("planJobs: execution order and cache lines", () => {
  const baselineOnly = (roles: PlanOptions["roles"]): PlanOptions => ({
    stage: "0",
    promptState: "postfix",
    roles,
    mode: "isolated",
    samples: 1,
    subset15: false,
    records: [],
  });

  it("runs beat cases in story order, then turn order, whatever their ids", () => {
    const cases = [
      evalCase("a-thread-story-b", "beat", { state: threadBeat(1, { id: "story-b" }).getState() }),
      evalCase("b-later-story-a", "beat", { state: laterSwitchBeat(1, { id: "story-a" }).getState() }),
      evalCase("c-first-story-a", "beat", { state: firstSwitchBeat(1, { id: "story-a" }).getState() }),
    ];
    expect(planJobs(cases, baselineOnly(["beat"])).map((j) => j.caseId)).toEqual(["c-first-story-a", "b-later-story-a", "a-thread-story-b"]);
  });

  it("runs setup cases by player count", () => {
    const setup = (id: string, playerCount: 1 | 2 | 3) =>
      evalCase(id, "setup", {
        setup: { premise: "A premise", playerCount, gameMode: playerCount === 1 ? GameModes.SinglePlayer : GameModes.Cooperative, maxTurns: 25 },
      });
    const cases = [setup("setup-a", 3), setup("setup-b", 1), setup("setup-c", 2)];
    expect(planJobs(cases, baselineOnly(["setup"])).map((j) => j.caseId)).toEqual(["setup-b", "setup-c", "setup-a"]);
  });

  it("gives a production request no cache line", () => {
    const cases = [evalCase("sp", "beat", { state: createMockStoryState() })];
    expect(planJobs(cases, baselineOnly(["beat"])).map((j) => j.cacheLine)).toEqual([undefined]);
  });
});

describe("planJobs: Stage 4", () => {
  const stage4 = (overrides: Partial<PlanOptions> = {}): PlanOptions => ({
    stage: "4",
    promptState: "postfix",
    roles: ["beat"],
    mode: "isolated",
    subset15: false,
    records: [],
    ...overrides,
  });
  const candidates = (jobs: Job[]) => jobs.filter((j) => !j.baseline);
  const perArm = (jobs: Job[]) => jobs.reduce<Record<string, number>>((acc, j) => ((acc[j.armKey] = (acc[j.armKey] ?? 0) + 1), acc), {});
  const beatCase = (id: string, story: Story) => evalCase(id, "beat", { state: story.getState() });

  it("runs the beat arms on single-player cases and the setup arms on the Stage 3 premises, at the matrix's samples", () => {
    const setup = (id: string) =>
      evalCase(id, "setup", { setup: { premise: "A premise", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 } });
    const cases = [
      beatCase("sp", threadBeat(1)),
      evalCase("mp", "beat", { state: createMockMultiplayerStory(2).getState(), tags: tags({ multiplayer: true, players: 2 }) }),
      setup("setup-learn-lemonade"),
      setup("setup-vent-subscription"),
    ];
    const jobs = candidates(planJobs(cases, stage4({ roles: ["setup", "beat"] })));
    expect(new Set(jobs.filter((j) => j.group === "beat").map((j) => j.caseId))).toEqual(new Set(["sp"]));
    expect(new Set(jobs.filter((j) => j.group === "setup").map((j) => j.caseId))).toEqual(new Set(["setup-learn-lemonade"]));
    expect(perArm(jobs)).toEqual({
      "gpt-6-sol@low/rewrite": 1,
      "gpt-6-sol@low/rewriteZeroShot": 1,
      "gpt-4.1@t0.2/rewrite": 1,
      "gpt-4.1@t0.2/rewriteZeroShot": 1,
      "gpt-6-luna@medium/rewriteSlim": 2,
      "gpt-4.1-mini@t0.2/rewrite": 1,
      "gpt-6-luna@medium+vlow/rewriteSlim": 1,
      "gpt-6-luna@medium/rewrite": 1,
      // Stage 4b, the count fix
      "gpt-6-sol@low/rewrite2": 1,
      "gpt-6-sol@low/rewrite2ZeroShot": 1,
      "gpt-6-luna@medium/rewrite2Slim": 2,
    });
  });

  it("plans Stage 4b first in each role, so a cap stop cuts Stage 4's leftovers before it", () => {
    const setup = evalCase("setup-learn-lemonade", "setup", {
      setup: { premise: "A premise", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 },
    });
    const order = (role: "setup" | "beat") => [
      ...new Set(candidates(planJobs([setup, beatCase("sp", threadBeat(1))], stage4({ roles: [role] }))).map((j) => j.armKey)),
    ];
    expect(order("setup").slice(0, 2)).toEqual(["gpt-6-sol@low/rewrite2", "gpt-6-sol@low/rewrite2ZeroShot"]);
    expect(order("beat")[0]).toBe("gpt-6-luna@medium/rewrite2Slim");
  });

  it("sends the count fix's worded form, on its own cache lines", () => {
    const cases = [beatCase("thread-a", threadBeat(1, { id: "story-a" }))];
    const job = (armKey: string) => planJobs(cases, stage4({ armKeys: [armKey], samples: 1 }))[0];
    const worded = job("gpt-6-luna@medium/rewrite2Slim");
    const exact = job("gpt-6-luna@medium/rewriteSlim");
    const fixed = (j: Job) => {
      const request = j.first.request();
      return "fixed" in request ? request.fixed : "";
    };
    expect(fixed(worded)).toContain(NO_EMPTY_ITEMS);
    expect(fixed(exact)).not.toContain(NO_EMPTY_ITEMS);
    expect(worded.cacheLine).toMatch(/^[0-9a-f]{12}$/);
    expect(worded.cacheLine).not.toBe(exact.cacheLine);
  });

  it("puts split requests with the same schema and fixed text on one cache line, and an image-on case and an ending on their own", () => {
    const cases = [
      beatCase("thread-a", threadBeat(1, { id: "story-a" })),
      beatCase("thread-b", threadBeat(1, { id: "story-b" })),
      beatCase("thread-images", threadBeat(1, { id: "story-c", templateId: "tpl-1" })),
      beatCase("ending", endingBeat(1, { id: "story-d" })),
    ];
    const jobs = planJobs(cases, stage4({ armKeys: ["gpt-6-luna@medium/rewriteSlim"], samples: 1 }));
    const line = (caseId: string) => jobs.find((j) => j.caseId === caseId)?.cacheLine;
    expect(line("thread-a")).toMatch(/^[0-9a-f]{12}$/);
    expect(line("thread-b")).toBe(line("thread-a"));
    expect(new Set([line("thread-a"), line("thread-images"), line("ending")]).size).toBe(3);
    // Another arm with the same request is another line: verbosity lives only in the arm key
    const vlow = planJobs(cases, stage4({ armKeys: ["gpt-6-luna@medium+vlow/rewriteSlim"], samples: 1 }));
    const vlowJob = vlow.find((j) => j.caseId === "thread-a");
    const slimJob = jobs.find((j) => j.caseId === "thread-a");
    const sent = (j: Job | undefined) => {
      const request = j?.first.request();
      return request && { text: requestText(request), schema: JSON.stringify(toJsonSchema(request.schema)) };
    };
    expect(sent(vlowJob)).toEqual(sent(slimJob));
    expect(vlowJob?.cacheLine).toMatch(/^[0-9a-f]{12}$/);
    expect(vlowJob?.cacheLine).not.toBe(slimJob?.cacheLine);
  });

  it("estimates a Stage 4 arm from the first arm on its reference chain with enough measured outputs", () => {
    const cases = [beatCase("sp", threadBeat(1))];
    const outputs = (armKey: string, size: number): CallRecord[] =>
      Array.from({ length: MIN_MEASURED_RECORDS }, (_, i) => record({ jobKey: `${armKey}-${i}`, role: "beat", armKey, callArmKey: armKey, outputTokens: size }));
    const estimate = (armKey: string, records: CallRecord[]) =>
      planJobs(cases, stage4({ records, armKeys: [armKey], samples: 1 }))[0].first.estimate.outputTokens;
    const slim = outputs("gpt-6-luna@medium/slim", 1_500);
    expect(estimate("gpt-6-luna@medium/rewriteSlim", slim)).toBe(1_500);
    // The verbosity arm reads rewriteSlim's once it has enough, else slim's
    expect(estimate("gpt-6-luna@medium+vlow/rewriteSlim", slim)).toBe(1_500);
    expect(estimate("gpt-6-luna@medium+vlow/rewriteSlim", [...slim, ...outputs("gpt-6-luna@medium/rewriteSlim", 1_200)])).toBe(1_200);
    // Today's model on the rewrite reads the baseline's
    expect(estimate("gpt-4.1-mini@t0.2/rewrite", outputs("gpt-4.1-mini@t0.2/prod", 1_700))).toBe(1_700);
    // The count fix borrows its Stage 4 form's outputs before its reference's
    const rewriteSlim = outputs("gpt-6-luna@medium/rewriteSlim", 1_300);
    expect(estimate("gpt-6-luna@medium/rewrite2Slim", [...slim, ...rewriteSlim])).toBe(1_300);
    expect(estimate("gpt-6-luna@medium/rewrite2Slim", slim)).toBe(1_500);
    expect(estimate("gpt-6-luna@medium/rewrite2Slim", [...rewriteSlim, ...outputs("gpt-6-luna@medium/rewrite2Slim", 900)])).toBe(900);
  });

  it("estimates the count fix's setup arms from their Stage 4 forms", () => {
    const cases = [evalCase("setup-learn-lemonade", "setup", { setup: { premise: "A premise", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 } })];
    const outputs = (armKey: string, size: number): CallRecord[] =>
      Array.from({ length: MIN_MEASURED_RECORDS }, (_, i) => record({ jobKey: `${armKey}-${i}`, role: "setup", armKey, callArmKey: armKey, outputTokens: size }));
    const records = [...outputs("gpt-6-sol@low/prod", 6_000), ...outputs("gpt-6-sol@low/rewrite", 6_400), ...outputs("gpt-6-sol@low/rewriteZeroShot", 6_100)];
    const estimate = (armKey: string) =>
      planJobs(cases, stage4({ roles: ["setup"], records, armKeys: [armKey], samples: 1 }))[0].first.estimate.outputTokens;
    expect(estimate("gpt-6-sol@low/rewrite2")).toBe(6_400);
    expect(estimate("gpt-6-sol@low/rewrite2ZeroShot")).toBe(6_100);
  });
});

describe("planJobs: the round stages and the migration check", () => {
  const multiplayer = { multiplayer: true, players: 2 };
  const plan = (stage: PlanOptions["stage"], overrides: Partial<PlanOptions> = {}): Job[] =>
    planJobs(
      [
        evalCase("sp", "beat", { state: threadBeat(1).getState() }),
        evalCase("mp", "beat", { state: createMockMultiplayerStory(2).getState(), tags: tags(multiplayer) }),
        evalCase("round-sp", "beat", { state: threadBeat(1, { id: "story-round-sp" }).getState(), tags: tags({ source: "round" }) }),
        evalCase("round-mp", "beat", { state: createMockMultiplayerStory(2).getState(), tags: tags({ ...multiplayer, source: "round" }) }),
        evalCase("setup-learn-lemonade", "setup", { setup: { premise: "A premise", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 } }),
        evalCase("sp-switch", "switch", { state: createMockStoryState() }),
        evalCase("mp-switch", "switch", { state: createMockMultiplayerStory(2).getState(), tags: tags(multiplayer) }),
        evalCase("sp-thread", "thread", { state: threadAnalysisAfterSwitch(1, { id: "story-sp-thread" }).getState() }),
        evalCase("mp-thread", "thread", { state: threadAnalysisAfterSwitch(2, { id: "story-mp-thread" }).getState(), tags: tags(multiplayer) }),
      ],
      { stage, promptState: "round1", roles: ["setup", "beat", "switch"], mode: "isolated", subset15: false, records: [], ...overrides }
    );
  const perArm = (jobs: Job[]) =>
    jobs.reduce<Record<string, string[]>>((acc, j) => ((acc[j.armKey] = [...(acc[j.armKey] ?? []), `${j.caseId} s${j.sample}`]), acc), {});

  it("plans no baseline job in the round and migration stages: their references are stored records", () => {
    for (const stage of ["setup-rounds", "turn-rounds", "migration"] as const) {
      expect(plan(stage).filter((j) => j.baseline)).toEqual([]);
      expect(plan(stage, { mode: "pipeline", roles: ["switch"] }).filter((j) => j.baseline)).toEqual([]);
    }
    // The older stages still plan the baseline on every case
    expect(plan("3").some((j) => j.baseline)).toBe(true);
  });

  it("plans turn rounds 1 and 2: planner v2 on every planning case, round 1's chapter turns, round 2's form on every single-player turn and its paragraph arm", () => {
    expect(perArm(plan("turn-rounds", { roles: ["setup", "beat", "switch", "thread"] }))).toEqual({
      // In story order: the round case's story id sorts first
      "gpt-6-luna@medium/chapterFull": ["round-sp s1", "round-sp s2", "sp s1", "sp s2"],
      "gpt-6-luna@medium/chapterSlim": ["round-sp s1", "round-sp s2", "sp s1", "sp s2"],
      "gpt-6-luna@medium/chapterSlimPlans": ["round-sp s1", "round-sp s2", "sp s1", "sp s2"],
      // Round 2 (its form after the smoke's fix): twice on the stored cases (their reference's two samples), once on the
      // round cases; the paragraph arm once. The smoke's draft (turnR2) is not planned again.
      "gpt-6-luna@medium/turnR2b": ["sp s1", "sp s2", "round-sp s1"],
      "gpt-6-luna@medium/turnR2Paragraphs": ["sp s1"],
      "gpt-6-luna@low/planV2": ["mp-switch s1", "mp-switch s2", "sp-switch s1", "sp-switch s2", "mp-thread s1", "mp-thread s2", "sp-thread s1", "sp-thread s2"],
    });
    expect(plan("turn-rounds").every((j) => !isSplitRequest(j.first.request()))).toBe(true);
  });

  it("plans round 3's replay: B9 five times on the problem turn and the problem first turn, the round-2 form's samples 3 to 5 on the problem turn", () => {
    const cases = [...ROUND3_REPLAY_CASES, "sp"].map((id) => evalCase(id, "beat", { state: threadBeat(1, { id: `story-${id}` }).getState() }));
    const jobs = planJobs(cases, { stage: "turn-rounds", promptState: "round0", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    const replay = jobs.filter((j) => j.armKey.endsWith("/turnR3Form") || (j.armKey.endsWith("/turnR2b") && j.sample > 2));
    const sorted = (list: Job[]) => list.map((j) => `${j.caseId} s${j.sample}`).sort();
    const samples = (id: string, from: number) => Array.from({ length: ROUND3_REPLAY_SAMPLES - from + 1 }, (_, i) => `${id} s${from + i}`);
    expect(sorted(replay.filter((j) => j.armKey === "gpt-6-luna@medium/turnR3Form"))).toEqual(ROUND3_REPLAY_CASES.flatMap((id) => samples(id, 1)).sort());
    // The shrink (the stage's $0.04): the round-2 form's extra replays only on the problem turn, where it has two samples already
    expect(sorted(replay.filter((j) => j.armKey === "gpt-6-luna@medium/turnR2b"))).toEqual(samples(ROUND3_PROBLEM_TURN, 3));
    // Only the replay cases, and B9 goes out split with production's limits
    expect(replay.some((j) => j.caseId === "sp")).toBe(false);
    const b9 = replay.find((j) => j.armKey.endsWith("/turnR3Form"))?.first.request();
    expect(b9 && isSplitRequest(b9)).toBe(true);
    expect(b9 && callLimitsOf(b9)).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
    expect(callLimitsOf(jobs.find((j) => j.armKey.endsWith("/turnR2b"))!.first.request())).toBeUndefined();
  });

  it("chains round 2's switch cases: planner v2 into the round-2 turn, today's pair beside it in the migration check, two samples each", () => {
    const [id] = ROUND2_SWITCH_CHAIN_CASES;
    const chains = (stage: PlanOptions["stage"]) =>
      planJobs([evalCase(id, "switch", { state: createMockStoryState() }), evalCase("sp-switch", "switch", { state: createMockStoryState() })], {
        stage,
        promptState: "round0",
        roles: ["switch"],
        mode: "pipeline",
        subset15: false,
        records: [],
      }).map((j) => [j.caseId, j.armKey, j.sample]);
    expect(chains("turn-rounds")).toEqual([
      [id, "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/turnR2b", 1],
      [id, "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/turnR2b", 2],
    ]);
    expect(chains("migration")).toEqual([
      [id, "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod", 1],
      [id, "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod", 2],
    ]);
  });

  it("chains planner v2 into the chapter's first step in turn round 1: both turn forms for one player, the full form on Luna low for groups", () => {
    expect(plan("turn-rounds", { mode: "pipeline", roles: ["switch"] })).toEqual([]);
    const chains = plan("turn-rounds", { mode: "pipeline", roles: ["thread"] });
    expect(chains.map((j) => [j.caseId, j.armKey, j.sample])).toEqual([
      ["mp-thread", "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@low/chapterFull", 1],
      ["mp-thread", "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@low/chapterFull", 2],
      ["sp-thread", "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/chapterFull", 1],
      ["sp-thread", "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/chapterFull", 2],
      ["sp-thread", "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/chapterSlim", 1],
      ["sp-thread", "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/chapterSlim", 2],
    ]);
  });

  it("runs the trigger comparison on the built trigger cases: the full planner at four samples, the lean one's samples 3 and 4 on top", () => {
    const trigger = evalCase("round-switch-trigger-stat-8988006e-t8", "switch", { state: createMockStoryState(), tags: tags({ source: "round" }) });
    const jobs = planJobs([trigger], { stage: "turn-rounds", promptState: "round0", roles: ["switch"], mode: "isolated", subset15: false, records: [] });
    expect(perArm(jobs)).toEqual({
      "gpt-6-luna@low/planV2": [1, 2, 3, 4].map((s) => `${trigger.id} s${s}`),
      "gpt-6-luna@low/planV2Full": [1, 2, 3, 4].map((s) => `${trigger.id} s${s}`),
    });
  });

  it("plans setup rounds 1 and 2 in the setup rounds", () => {
    // The lemonade premise is on the owner's round-1 page, so Sol low runs it too; round 2's two arms run on Luna low only
    expect(perArm(plan("setup-rounds"))).toEqual({
      "gpt-6-luna@low/setupR1": ["setup-learn-lemonade s1", "setup-learn-lemonade s2"],
      "gpt-6-sol@low/setupR1": ["setup-learn-lemonade s1"],
      "gpt-6-luna@low/setupR2": ["setup-learn-lemonade s1", "setup-learn-lemonade s2"],
      "gpt-6-luna@low/setupR2Order": ["setup-learn-lemonade s1", "setup-learn-lemonade s2"],
      "gpt-6-luna@low/setupR1b": ["setup-learn-lemonade s1", "setup-learn-lemonade s2"],
      "gpt-6-luna@low/setupR1c": ["setup-learn-lemonade s1", "setup-learn-lemonade s2"],
      "gpt-6-luna@low/setupR2b": ["setup-learn-lemonade s1", "setup-learn-lemonade s2"],
      "gpt-6-luna@low/setupR2bOrder": ["setup-learn-lemonade s1", "setup-learn-lemonade s2"],
      // Setup round 3's confirmation run: the final form, two samples on every premise
      "gpt-6-luna@low/setupR3": ["setup-learn-lemonade s1", "setup-learn-lemonade s2"],
    });
    expect(plan("setup-rounds").every((j) => !isSplitRequest(j.first.request()))).toBe(true);
  });

  it("builds the turn rounds' references in the migration check: production's GPT-6 defaults per player count, no setup", () => {
    // Single-player beats on Luna medium, twice on the stored cases and once on the round cases; multiplayer beats on
    // Luna low once, on the stored cases only; the planners on Luna low twice everywhere. Setup reads the stored
    // setups, which today's code rebuilds byte for byte. Sample 4 is turn round 2's rerun of today's form beside its
    // candidates, for the waits.
    expect(perArm(plan("migration", { roles: ["setup", "beat", "switch", "thread"] }))).toEqual({
      "gpt-6-luna@medium/prod": ["sp s1", "sp s2", "round-sp s1", "sp s4"],
      "gpt-6-luna@low/prod": [
        "mp s1",
        "mp-switch s1",
        "mp-switch s2",
        "sp-switch s1",
        "sp-switch s2",
        "mp-thread s1",
        "mp-thread s2",
        "sp-thread s1",
        "sp-thread s2",
      ],
    });
  });

  it("plans the plan refresh (the owner's feedback, 2026-09-28): planner v2c twice on every chapter-planning case, planner v2b twice on the group ones", () => {
    // Planner v2b's chapter request differs from planner v2's only in groups (two-sided contests); on one player planner
    // v2's records stand in (standInKey). Planner v2c's switch planner is planner v2b's, so no switch case runs.
    expect(perArm(plan("plan-refresh", { roles: ["setup", "beat", "switch", "thread"] }))).toEqual({
      "gpt-6-luna@low/planV2c": ["mp-thread s1", "mp-thread s2", "sp-thread s1", "sp-thread s2"],
      "gpt-6-luna@low/planV2b": ["mp-thread s1", "mp-thread s2"],
    });
    expect(plan("plan-refresh", { mode: "pipeline", roles: ["switch", "thread"] })).toEqual([]);
  });

  it("plans the paid final check on production's own code: every role once on production's models, the single-player turns' second sample", () => {
    // The form gate ran production's single-player turns once under the same code (sample 1), so the final check sends
    // sample 2 on the stored turns; group turns and both planners once, on production's settings groups
    const jobs = plan("final-check", { roles: ["setup", "beat", "switch", "thread"] });
    expect(perArm(jobs)).toEqual({
      "gpt-6-luna@medium/adopted": ["sp s2"],
      "gpt-6-luna@low/adopted": ["mp s1", "mp-switch s1", "sp-switch s1", "mp-thread s1", "sp-thread s1"],
    });
    // Each goes out with production's limits for its role and player count
    const limits = (caseId: string) => callLimitsOf(jobs.find((j) => j.caseId === caseId)!.first.request());
    expect(limits("sp")).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
    expect(limits("mp")).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 14_000 });
    expect(limits("sp-switch")).toEqual({ timeoutMs: 30_000, maxCompletionTokens: 4_000 });
    expect(limits("mp-thread")).toEqual({ timeoutMs: 30_000, maxCompletionTokens: 4_000 });
    expect(jobs.every((j) => !isSplitRequest(j.first.request()))).toBe(true);
    // The chapter planner into the chapter's first step, production's pair per player count, once
    const chains = plan("final-check", { mode: "pipeline", roles: ["switch", "thread"] });
    expect(chains.map((j) => [j.caseId, j.armKey, j.sample])).toEqual([
      ["mp-thread", "pipeline:gpt-6-luna@low/adopted>gpt-6-luna@low/adopted", 1],
      ["sp-thread", "pipeline:gpt-6-luna@low/adopted>gpt-6-luna@medium/adopted", 1],
    ]);
  });

  it("plans the final check's setups: two new custom-story setups per player count on Luna low, two templates on Sol low (the template editor)", () => {
    const setup = (id: string) => {
      const premise = SETUP_PREMISES.find((p) => p.id === id)!;
      return evalCase(id, "setup", {
        setup: { premise: premise.premise, playerCount: premise.playerCount, gameMode: premise.gameMode, maxTurns: premise.maxTurns },
        tags: tags({ players: premise.playerCount, multiplayer: premise.playerCount > 1, kids: premise.tags.kids }),
      });
    };
    const cases = SETUP_PREMISES.map((p) => setup(p.id));
    const jobs = planJobs(cases, { stage: "final-check", promptState: "adopted1", roles: ["setup"], mode: "isolated", subset15: false, records: [] });
    const byArm = perArm(jobs);
    expect(Object.keys(byArm).sort()).toEqual(["gpt-6-luna@low/adopted", "gpt-6-sol@low/adoptedTemplate"]);
    expect(byArm["gpt-6-luna@low/adopted"].sort()).toEqual(FINAL_CHECK_SETUP_PREMISES.map((id) => `${id} s1`).sort());
    expect(byArm["gpt-6-sol@low/adoptedTemplate"].sort()).toEqual(FINAL_CHECK_TEMPLATE_PREMISES.map((id) => `${id} s1`).sort());
    // A custom story as production asks for it (the case's kids tag rides along), a template as the editor's AI Draft does
    for (const job of jobs) {
      const c = cases.find((x) => x.id === job.caseId)!;
      const { premise, playerCount, gameMode, maxTurns } = c.setup!;
      const request = job.first.request();
      const template = job.armKey.endsWith("/adoptedTemplate");
      const production = template
        ? setupStep.request(premise, playerCount, gameMode, maxTurns, "template")
        : setupStep.request(premise, playerCount, gameMode, maxTurns, "story", { kids: c.tags.kids });
      expect(requestText(request)).toBe(production.prompt);
      expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(production.schema)));
      expect(callLimitsOf(request)).toEqual(template ? { timeoutMs: 240_000, maxCompletionTokens: 20_000 } : { timeoutMs: 120_000, maxCompletionTokens: 20_000 });
    }
  });

  it("plans the request form's gate (B9): production's single-player turn form once as one message and once split, on the stored turns", () => {
    const jobs = plan("form-gate", { roles: ["setup", "beat", "switch", "thread"] });
    expect(perArm(jobs)).toEqual({
      "gpt-6-luna@medium/adopted": ["sp s1"],
      "gpt-6-luna@medium/adoptedSplit": ["sp s1"],
    });
    // The split one goes out as fixed rules and a per-call part, the one message as production sends it; both with production's limits
    const [oneMessage, split] = ["gpt-6-luna@medium/adopted", "gpt-6-luna@medium/adoptedSplit"].map((key) => jobs.find((j) => j.armKey === key)?.first.request());
    expect(oneMessage && isSplitRequest(oneMessage)).toBe(false);
    expect(split && isSplitRequest(split)).toBe(true);
    expect(plan("form-gate", { mode: "pipeline", roles: ["switch", "thread"] })).toEqual([]);
  });

  it("plans the options and continuity arms (2026-09-30) beside production's form, interleaved: every arm on a case before the next case, sample 1 before sample 2", () => {
    const arms = ["adopted", "turnO", "turnC", "turnOC"].map((variant) => `gpt-6-luna@medium/${variant}`);
    expect(perArm(plan("options-continuity", { roles: ["setup", "beat", "switch", "thread"] }))).toEqual(Object.fromEntries(arms.map((key) => [key, ["sp s1", "sp s2"]])));
    expect(plan("options-continuity", { mode: "pipeline", roles: ["switch", "thread"] })).toEqual([]);
    // Two stored single-player turns: the four arms on one case, then on the next, so the server's pace is shared
    const second = evalCase("sp-later", "beat", { state: threadBeat(1, { id: "story-z" }).getState() });
    const cases = [evalCase("sp", "beat", { state: threadBeat(1, { id: "story-a" }).getState() }), second];
    const jobs = planJobs(cases, { stage: "options-continuity", promptState: "adopted2", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    expect(jobs.map((j) => `${j.caseId} s${j.sample} ${j.armKey.split("/")[1]}`)).toEqual(
      [1, 2].flatMap((s) => ["sp", "sp-later"].flatMap((id) => ["adopted", "turnO", "turnC", "turnOC"].map((v) => `${id} s${s} ${v}`)))
    );
    // Every arm with production's single-player turn limits
    for (const job of jobs) expect(callLimitsOf(job.first.request())).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
    // Other stages keep their plan order: one arm's cases and samples, then the next arm's
    const gate = planJobs(cases, { stage: "form-gate", promptState: "adopted1", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    expect(gate.map((j) => `${j.caseId} ${j.armKey.split("/")[1]}`)).toEqual(["sp adopted", "sp-later adopted", "sp adoptedSplit", "sp-later adoptedSplit"]);
  });

  it("plans version O2 (2026-09-30) beside production's form on its rolled steps only, interleaved, with production's single-player turn limits", () => {
    const [first, second] = OPTIONS_O2_CASES;
    const cases = [
      evalCase(first, "beat", { state: threadBeat(1, { id: "story-a" }).getState() }),
      evalCase(second, "beat", { state: threadBeat(1, { id: "story-z" }).getState() }),
      evalCase("sp-other", "beat", { state: threadBeat(1, { id: "story-b" }).getState() }),
    ];
    const jobs = planJobs(cases, { stage: "options-o2", promptState: "adopted3", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    // O2's one fix-and-retest (turnO2b) once, beside the first sample
    expect(jobs.map((j) => `${j.caseId} s${j.sample} ${j.armKey.split("/")[1]}`)).toEqual([
      ...[first, second].flatMap((id) => ["adopted", "turnO2", "turnO2b"].map((v) => `${id} s1 ${v}`)),
      ...[first, second].flatMap((id) => ["adopted", "turnO2"].map((v) => `${id} s2 ${v}`)),
    ]);
    for (const job of jobs) expect(callLimitsOf(job.first.request())).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
    expect(planJobs(cases, { stage: "options-o2", promptState: "adopted3", roles: ["switch", "thread"], mode: "pipeline", subset15: false, records: [] })).toEqual([]);
  });

  it("plans the ending told as its milestones leave it (2026-09-30) beside production's ending on its endings only, interleaved, each on its player count's model and limits", () => {
    const [stored] = ENDING_STATE_STORED_CASES;
    const [group] = ENDING_STATE_BUILT_CASES.groups;
    const [single] = ENDING_STATE_BUILT_CASES.single;
    const cases = [
      evalCase(stored, "beat", { state: endingBeat(1, { id: "story-a" }).getState(), tags: tags({ ending: true }) }),
      evalCase(single, "beat", { state: endingBeat(1, { id: "story-b" }).getState(), tags: tags({ ending: true, source: "round" }) }),
      evalCase(group, "beat", { state: endingBeat(2, { id: "story-c" }).getState(), tags: tags({ ending: true, source: "round", multiplayer: true, players: 2 }) }),
      evalCase("sp-other-ending", "beat", { state: endingBeat(1, { id: "story-d" }).getState(), tags: tags({ ending: true }) }),
    ];
    // Production's two samples on a stored ending are adopted2's records already (the runner skips finished jobs), so there
    // only the variant goes out
    const jobs = planJobs(cases, { stage: "ending-state", promptState: "adopted2", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    expect(jobs.map((j) => `${j.caseId} s${j.sample} ${j.armKey}`).sort()).toEqual(
      [
        ...[1, 2].flatMap((s) => ["adopted", "endingStateB"].map((v) => `${stored} s${s} gpt-6-luna@medium/${v}`)),
        ...[1, 2].flatMap((s) => ["adopted", "endingStateB"].map((v) => `${single} s${s} gpt-6-luna@medium/${v}`)),
        ...[1, 2].flatMap((s) => ["adopted", "endingStateB"].map((v) => `${group} s${s} gpt-6-luna@low/${v}`)),
      ].sort()
    );
    for (const job of jobs) {
      const players = job.caseId === group ? 2 : 1;
      expect(callLimitsOf(job.first.request())).toEqual({ timeoutMs: 90_000, maxCompletionTokens: players === 1 ? 12_000 : 14_000 });
    }
    // Interleaved: both arms on a case before the next case
    const onSingle = jobs.filter((j) => j.caseId === single && j.sample === 1).map((j) => jobs.indexOf(j));
    expect(Math.abs(onSingle[0] - onSingle[1])).toBe(1);
    expect(planJobs(cases, { stage: "ending-state", promptState: "adopted2", roles: ["switch", "thread"], mode: "pipeline", subset15: false, records: [] })).toEqual([]);
  });

  it("plans the runaway replay (2026-09-30): production's request and the switch reminder's fix three times each on the runaway case only, interleaved, with production's single-player turn limits", () => {
    const [runaway] = RUNAWAY_CASES;
    const cases = [
      evalCase(runaway, "beat", { state: laterSwitchBeat(1, { id: "story-a" }).getState() }),
      evalCase("sp-other-switch", "beat", { state: laterSwitchBeat(1, { id: "story-b" }).getState() }),
    ];
    const jobs = planJobs(cases, { stage: "runaway", promptState: "adopted4", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    // Sample by sample, both arms together: six jobs, as the dry run counts them
    expect(jobs.map((j) => `${j.caseId} s${j.sample} ${j.armKey}`)).toEqual(
      [1, 2, 3].flatMap((s) => ["adopted", "noSwitchReminder"].map((v) => `${runaway} s${s} gpt-6-luna@medium/${v}`))
    );
    for (const job of jobs) expect(callLimitsOf(job.first.request())).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
    // The smoke: sample 1 of each
    const smoke = planJobs(cases, { stage: "runaway", promptState: "adopted4", roles: ["beat"], mode: "isolated", subset15: false, records: [], samples: 1 });
    expect(smoke.map((j) => `${j.sample} ${j.armKey}`)).toEqual(["1 gpt-6-luna@medium/adopted", "1 gpt-6-luna@medium/noSwitchReminder"]);
    // The two requests differ by the switch reminder alone
    const [production, fix] = jobs.slice(0, 2).map((j) => requestText(j.first.request()));
    expect(production.replace(SWITCH_REMINDER, "")).toBe(fix);
    expect(production).not.toBe(fix);
    expect(planJobs(cases, { stage: "runaway", promptState: "adopted4", roles: ["switch", "thread"], mode: "pipeline", subset15: false, records: [] })).toEqual([]);
  });

  it("plans the choice-result stage (2026-09-30): production's turn and the exploration-order turn twice on the exploration steps, interleaved, each on its player count's model and limits; planner v2e and v2f on the chapter plans", () => {
    const [stored] = CHOICE_RESULT_STORED_CASES;
    const [single] = CHOICE_RESULT_BUILT_CASES.single;
    const [group] = CHOICE_RESULT_BUILT_CASES.groups;
    const [plan] = CHOICE_RESULT_BUILT_CASES.plans;
    const [storedPlan] = CHOICE_RESULT_STORED_PLAN_CASES;
    const exploring = (players: number, id: string) => {
      const story = threadBeat(players, { id });
      const state = structuredClone(story.getState());
      const analysis = state.storyPhases[1] as ThreadAnalysis;
      analysis.threads = analysis.threads.map((t) => ({ ...t, possibleMilestones: { resolution1: "one", resolution2: "two", resolution3: "three" }, progression: t.progression.map((s) => ({ ...s, possibleResolutions: { resolution1: "one", resolution2: "two", resolution3: "three" } })) }));
      return state;
    };
    const cases = [
      evalCase(stored, "beat", { state: exploring(1, "story-a") }),
      evalCase(single, "beat", { state: exploring(1, "story-b"), tags: tags({ source: "round" }) }),
      evalCase(group, "beat", { state: exploring(2, "story-c"), tags: tags({ source: "round", multiplayer: true, players: 2 }) }),
      evalCase("sp-other-step", "beat", { state: threadBeat(1, { id: "story-d" }).getState() }),
      evalCase(plan, "thread", { state: threadAnalysisAfterSwitch(1, { id: "story-e" }).getState(), tags: tags({ source: "round" }) }),
      evalCase(storedPlan, "thread", { state: threadAnalysisAfterSwitch(1, { id: "story-f" }).getState() }),
    ];
    const turns = planJobs(cases, { stage: "choice-result", promptState: "adopted5", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    expect(turns.map((j) => `${j.caseId} s${j.sample} ${j.armKey}`).sort()).toEqual(
      [
        // With the one fix-and-retest (choiceResultB) on the single-player steps
        ...[1, 2].flatMap((s) => ["adopted", "choiceResult", "choiceResultB"].map((v) => `${stored} s${s} gpt-6-luna@medium/${v}`)),
        ...[1, 2].flatMap((s) => ["adopted", "choiceResult", "choiceResultB"].map((v) => `${single} s${s} gpt-6-luna@medium/${v}`)),
        ...[1, 2].flatMap((s) => ["adopted", "choiceResult"].map((v) => `${group} s${s} gpt-6-luna@low/${v}`)),
      ].sort()
    );
    for (const job of turns) expect(callLimitsOf(job.first.request())).toEqual({ timeoutMs: 90_000, maxCompletionTokens: job.caseId === group ? 14_000 : 12_000 });
    // Interleaved: both arms on a case before the next case
    const onSingle = turns.filter((j) => j.caseId === single && j.sample === 1).map((j) => turns.indexOf(j));
    expect(Math.abs(onSingle[0] - onSingle[1])).toBe(1);
    // The two requests differed by the exploration line alone; since the choice-line-sp adoption (2026-09-30) production's
    // own request (adopted) is the variant's, and what it sent then is productionTurnToday
    const [production, variant] = onSingle.map((i) => requestText(turns[i].first.request()));
    expect(production).toBe(variant);
    expect(variant.replace(CHOICE_RESULT_TEXT.explorationOrder, "")).toBe(productionTurnToday(caseStory(cases[1])).prompt);
    // The planners, beside planner v2e's stored plans: v2e and v2f twice on a built plan, v2f once on a stored one
    const plans = planJobs(cases, { stage: "choice-result", promptState: "round0", roles: ["thread"], mode: "isolated", subset15: false, records: [] });
    expect(plans.map((j) => `${j.caseId} s${j.sample} ${j.armKey}`).sort()).toEqual(
      [
        ...[1, 2].flatMap((s) => ["planV2e", "planV2f"].map((v) => `${plan} s${s} gpt-6-luna@low/${v}`)),
        `${storedPlan} s1 gpt-6-luna@low/planV2f`,
      ].sort()
    );
    expect(planJobs(cases, { stage: "choice-result", promptState: "adopted5", roles: ["switch", "thread"], mode: "pipeline", subset15: false, records: [] })).toEqual([]);
  });

  it("plans the choice-line-sp stage (2026-09-30): production's turn and the exploration-order turn twice on the single-player steps, interleaved, each with production's one checked retry", () => {
    const [stored] = CHOICE_RESULT_STORED_CASES;
    const [single] = CHOICE_RESULT_BUILT_CASES.single;
    const [group] = CHOICE_RESULT_BUILT_CASES.groups;
    const exploring = (players: number, id: string) => {
      const story = threadBeat(players, { id });
      const state = structuredClone(story.getState());
      const analysis = state.storyPhases[1] as ThreadAnalysis;
      analysis.threads = analysis.threads.map((t) => ({ ...t, possibleMilestones: { resolution1: "one", resolution2: "two", resolution3: "three" }, progression: t.progression.map((s) => ({ ...s, possibleResolutions: { resolution1: "one", resolution2: "two", resolution3: "three" } })) }));
      return state;
    };
    const cases = [
      evalCase(stored, "beat", { state: exploring(1, "story-a") }),
      evalCase(single, "beat", { state: exploring(1, "story-b"), tags: tags({ source: "round" }) }),
      evalCase(group, "beat", { state: exploring(2, "story-c"), tags: tags({ source: "round", multiplayer: true, players: 2 }) }),
    ];
    const turns = planJobs(cases, { stage: "choice-line-sp", promptState: "adopted6", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    expect(turns.map((j) => `${j.caseId} s${j.sample} ${j.armKey}`).sort()).toEqual(
      [...[1, 2].flatMap((s) => [stored, single].flatMap((c) => ["adopted", "choiceResult"].map((v) => `${c} s${s} gpt-6-luna@medium/${v}`)))].sort()
    );
    // Interleaved: both arms on a case before the next case; the requests differed by the exploration line alone (since
    // the stage's adoption, production's own request is the variant's, and what it sent at the run is productionTurnToday)
    const onSingle = turns.filter((j) => j.caseId === single && j.sample === 1);
    expect(Math.abs(turns.indexOf(onSingle[0]) - turns.indexOf(onSingle[1]))).toBe(1);
    const [production, variant] = onSingle.map((j) => requestText(j.first.request()));
    expect(production).toBe(variant);
    expect(variant.replace(CHOICE_RESULT_TEXT.explorationOrder, "")).toBe(productionTurnToday(caseStory(cases[1])).prompt);
    // Production's one checked retry on every job: its check is production's, and so is the retry's request
    const reply = (paragraphs: number, options: number) => ({
      player1: { text: Array.from({ length: paragraphs }, (_, i) => `Paragraph ${i + 1}. It goes on. And on.`).join("\n\n"), options: Array.from({ length: options }, (_, i) => ({ text: `Option ${i + 1}` })) },
    });
    for (const job of turns) {
      expect(job.retry).toBeDefined();
      const retry = job.retry as NonNullable<Job["retry"]>;
      expect(retry.problemOf(reply(5, 3))).toBeUndefined();
      expect(retry.problemOf(reply(1, 3))).toEqual({ text: shortTextProblem(reply(1, 3) as never), kind: "short" });
      expect(retry.problemOf(reply(5, 0))).toEqual({ text: missingOptionsProblem(reply(5, 0) as never), kind: "noOptions" });
      expect(retry.problemOf(reply(1, 0))).toEqual({ text: beatReplyProblem(reply(1, 0) as never), kind: "both" });
      const problem = retry.problemOf(reply(1, 3)) as { text: string; kind: "short" };
      const again = retry.build(problem);
      const first = job.first.request() as { prompt: string; schema: unknown; limits?: unknown };
      const asked = again.request() as { prompt: string; schema: unknown; limits?: unknown };
      expect(asked.prompt).toBe(withBeatProblem(first.prompt, problem.text));
      expect(asked.schema).toBe(first.schema);
      expect(callLimitsOf(asked as never)).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
      expect([again.role, again.arm.key, again.players]).toEqual(["beat", job.first.arm.key, 1]);
      expect(retry.estimate).toEqual(job.first.estimate);
    }
    // No group turn, no planner, and no earlier stage's turn carries the retry
    expect(planJobs(cases, { stage: "choice-line-sp", promptState: "adopted6", roles: ["switch", "thread"], mode: "pipeline", subset15: false, records: [] })).toEqual([]);
    const earlier = planJobs(cases, { stage: "choice-result", promptState: "adopted5", roles: ["beat"], mode: "isolated", subset15: false, records: [] });
    expect(earlier.length).toBeGreaterThan(0);
    expect(earlier.every((j) => j.retry === undefined)).toBe(true);
  });

  it("plans the parallel-threads stage (2026-10-01): the group switch planners twice on its switches, and each side's chapter planner into its own group turn twice on its chapter openings, both interleaved", () => {
    const [switchA, switchB] = PARALLEL_THREADS_CASES.switches;
    const [chapterA, chapterB] = PARALLEL_THREADS_CASES.chapters;
    const group = (players: number) => tags({ source: "round", multiplayer: true, players });
    const cases = [
      evalCase(switchA, "switch", { state: laterSwitchBeat(3, { id: "story-a" }).getState(), tags: group(3) }),
      evalCase(switchB, "switch", { state: laterSwitchBeat(2, { id: "story-b" }).getState(), tags: group(2) }),
      evalCase(chapterA, "thread", { state: threadAnalysisAfterSwitch(3, { id: "story-c" }).getState(), tags: group(3) }),
      evalCase(chapterB, "thread", { state: threadAnalysisAfterSwitch(2, { id: "story-d" }).getState(), tags: group(2) }),
      evalCase("mp-other-plan", "thread", { state: threadAnalysisAfterSwitch(2, { id: "story-e" }).getState(), tags: tags({ multiplayer: true, players: 2 }) }),
    ];
    const options = { stage: "parallel-threads" as const, promptState: "adopted11", subset15: false, records: [] };
    // The switch planners, sample by sample, both arms on a case before the next case
    const switches = planJobs(cases, { ...options, roles: ["switch"], mode: "isolated" });
    expect(switches.map((j) => `${j.caseId} s${j.sample} ${j.armKey}`)).toEqual(
      [1, 2].flatMap((s) => [switchA, switchB].flatMap((id) => ["adopted", "parallelThreads"].map((v) => `${id} s${s} gpt-6-luna@low/${v}`)))
    );
    for (const job of switches) expect(callLimitsOf(job.first.request())).toEqual(productionCallLimits("switchAnalysis", job.caseId === switchA ? 3 : 2));
    // The chapter openings as chains, each side's planner into its own turn, interleaved the same way
    const chains = planJobs(cases, { ...options, roles: ["thread"], mode: "pipeline" });
    const chain = (variant: string) => `pipeline:gpt-6-luna@low/${variant}>gpt-6-luna@low/${variant}`;
    expect(chains.map((j) => `${j.caseId} s${j.sample} ${j.armKey}`)).toEqual(
      [1, 2].flatMap((s) => [chapterA, chapterB].flatMap((id) => ["adopted", "parallelThreads"].map((v) => `${id} s${s} ${chain(v)}`)))
    );
    for (const job of chains) {
      expect(callLimitsOf(job.first.request())).toEqual(productionCallLimits("threadAnalysis", job.caseId === chapterA ? 3 : 2));
      expect(job.then?.arm.key).toBe(chainSides(job.armKey)?.beat);
    }
    // Nothing isolated on the chapter openings, no turn case, and no earlier stage plans the cases
    expect(planJobs(cases, { ...options, roles: ["beat", "thread"], mode: "isolated" })).toEqual([]);
    expect(planJobs(cases, { ...options, stage: "lever-direction", roles: ["switch", "thread"], mode: "pipeline" })).toEqual([]);
  });

  it("plans the group round (B10): the sharpened note twice on the stored group turns, today's group form's sample 2 beside it", () => {
    // Today's form ran once on the stored group turns (the migration check), so its sample 2 gives the noise and the
    // same-hour waits; no chain, no planner, no single-player turn
    // Then B10's one fix-and-retest (B10b, the shared moment's script), the same way
    expect(perArm(plan("groups", { roles: ["setup", "beat", "switch", "thread"] }))).toEqual({
      "gpt-6-luna@low/turnB10": ["mp s1", "mp s2"],
      "gpt-6-luna@low/prod": ["mp s2"],
      "gpt-6-luna@low/turnB10b": ["mp s1", "mp s2"],
    });
    expect(plan("groups", { mode: "pipeline", roles: ["switch", "thread"] })).toEqual([]);
  });

  it("plans the reruns: the framed turn without the chapter rules twice on every single-player chapter step, and planner v2c into it on the chapter plans", () => {
    expect(perArm(plan("reruns", { roles: ["setup", "beat", "switch", "thread"] }))).toEqual({
      "gpt-6-luna@medium/chapterFullB": ["round-sp s1", "round-sp s2", "sp s1", "sp s2"],
    });
    const chains = plan("reruns", { mode: "pipeline", roles: ["switch", "thread"] });
    // Today's pair beside it, up to sample 3: its samples 1 and 2 are stored, so only sample 3 is sent
    expect(chains.map((j) => [j.caseId, j.armKey, j.sample])).toEqual([
      ["sp-thread", "pipeline:gpt-6-luna@low/planV2c>gpt-6-luna@medium/chapterFullB", 1],
      ["sp-thread", "pipeline:gpt-6-luna@low/planV2c>gpt-6-luna@medium/chapterFullB", 2],
      ["sp-thread", "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod", 1],
      ["sp-thread", "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod", 2],
      ["sp-thread", "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod", 3],
    ]);
  });

  it("plans the setup retests: round 3b twice on the named-player and kids premises, then once on the others", () => {
    const setup = (id: string) => evalCase(id, "setup", { setup: { premise: "A premise", playerCount: 2, gameMode: GameModes.Competitive, maxTurns: 25 } });
    const jobs = planJobs([setup("setup-future-casablanca"), setup("setup-learn-peer-review")], {
      stage: "setup-retests",
      promptState: "round0",
      roles: ["setup", "beat"],
      mode: "isolated",
      subset15: false,
      records: [],
    });
    expect(jobs.map((j) => `${j.armKey} ${j.caseId} s${j.sample}`)).toEqual([
      "gpt-6-luna@low/setupR3b setup-future-casablanca s1",
      "gpt-6-luna@low/setupR3b setup-future-casablanca s2",
      "gpt-6-luna@low/setupR3b setup-learn-peer-review s1",
    ]);
  });

  it("plans the Casablanca sentence's retest in the setup rounds: round 3c twice on Casablanca and Susan, nowhere else", () => {
    const setup = (id: string, playerCount: 1 | 2) =>
      evalCase(id, "setup", { setup: { premise: "A premise", playerCount, gameMode: playerCount === 1 ? GameModes.SinglePlayer : GameModes.Competitive, maxTurns: 25 } });
    const cases = [setup("setup-future-casablanca", 2), setup("setup-custom-susan", 1), setup("setup-learn-peer-review", 2)];
    const jobs = planJobs(cases, { stage: "setup-rounds", promptState: "round0", roles: ["setup", "beat"], mode: "isolated", subset15: false, records: [] });
    // Setup queues by player count
    expect(jobs.filter((j) => j.armKey === "gpt-6-luna@low/setupR3c").map((j) => `${j.caseId} s${j.sample}`)).toEqual([
      "setup-custom-susan s1",
      "setup-custom-susan s2",
      "setup-future-casablanca s1",
      "setup-future-casablanca s2",
    ]);
    // The request is round 3c's, with the sentence
    const request = jobs.find((j) => j.armKey === "gpt-6-luna@low/setupR3c" && j.caseId === "setup-future-casablanca")!.first.request();
    expect(requestText(request)).toContain(IDENTITY_CLAUSE_NO_STAT_NAMES.more);
    expect(requestText(request)).toBe(setupRound2Request("A premise", 2, GameModes.Competitive, 25, "story", "generationOrder", ROUND3C_PARTS, { kids: false }).prompt);
  });

  it("plans the Casablanca sentence's second retest: round 3d six times on Casablanca, production's form beside it to six samples", () => {
    const setup = (id: string, playerCount: 1 | 2) =>
      evalCase(id, "setup", { setup: { premise: "A premise", playerCount, gameMode: playerCount === 1 ? GameModes.SinglePlayer : GameModes.Competitive, maxTurns: 25 } });
    const cases = [setup("setup-future-casablanca", 2), setup("setup-custom-susan", 1)];
    const jobs = planJobs(cases, { stage: "setup-rounds", promptState: "round0", roles: ["setup"], mode: "isolated", subset15: false, records: [] });
    const of = (arm: string) => jobs.filter((j) => j.armKey === arm).map((j) => `${j.caseId} s${j.sample}`);
    expect(of("gpt-6-luna@low/setupR3d")).toEqual([1, 2, 3, 4, 5, 6].map((s) => `setup-future-casablanca s${s}`));
    // Round 3's confirmation run planned samples 1 and 2 on every premise; the retest adds 3 to 6 on Casablanca only
    expect(of("gpt-6-luna@low/setupR3")).toEqual([
      "setup-custom-susan s1",
      "setup-custom-susan s2",
      ...[1, 2, 3, 4, 5, 6].map((s) => `setup-future-casablanca s${s}`),
    ]);
    const request = jobs.find((j) => j.armKey === "gpt-6-luna@low/setupR3d")!.first.request();
    expect(requestText(request)).toBe(setupRound2Request("A premise", 2, GameModes.Competitive, 25, "story", "generationOrder", ROUND3D_PARTS, { kids: false }).prompt);
    expect(requestText(request)).toContain(IDENTITY_CLAUSE_GROUPS_NAMELESS.more);
  });

  it("never plans a job twice where two plans of one arm meet, --samples included", () => {
    // 2026-09-29: --samples 6 raised round 3's two-sample plan to six on Casablanca, beside the retest's samples 3 to 6
    // of the same arm, and each of samples 3 to 6 ran twice
    const casablanca = evalCase("setup-future-casablanca", "setup", { setup: { premise: "A premise", playerCount: 2, gameMode: GameModes.Competitive, maxTurns: 25 } });
    for (const samples of [undefined, 6, 8]) {
      const jobs = planJobs([casablanca], { stage: "setup-rounds", promptState: "round0", roles: ["setup"], mode: "isolated", subset15: false, records: [], samples });
      const keys = jobs.map((j) => keyOf(j));
      expect(new Set(keys).size).toBe(keys.length);
      expect(jobs.filter((j) => j.armKey === "gpt-6-luna@low/setupR3").map((j) => j.sample)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].slice(0, samples ?? 6));
    }
    // The same holds for turn round 1's two planner v2 plans on the trigger cases
    const trigger = evalCase(TRIGGER_THREAD_CASES[0], "thread", { state: threadAnalysisAfterSwitch(1, { id: "story-trigger" }).getState() });
    const planned = planJobs([trigger], { stage: "turn-rounds", promptState: "round0", roles: ["thread"], mode: "isolated", subset15: false, records: [], samples: 4 });
    const keys = planned.map((j) => keyOf(j));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lets planner v2's chapter plans stand in for planner v2b's only where v2b's request is v2's byte for byte, prompt and schema (one player)", () => {
    const sp = evalCase("sp-thread", "thread", { state: threadAnalysisAfterSwitch(1, { id: "story-sp-thread" }).getState() });
    const mp = evalCase("mp-thread", "thread", { state: threadAnalysisAfterSwitch(2, { id: "story-mp-thread" }).getState(), tags: tags({ multiplayer: true, players: 2 }) });
    const V2 = "gpt-6-luna@low/planV2";
    const v2Record = (c: typeof sp) => record({ caseId: c.id, armKey: V2, callArmKey: V2, group: "thread", role: "thread", promptHash: todaysRequestHash(c, "planV2") });
    const same = sameRequestAs([sp, mp]);
    expect(same(v2Record(sp), "gpt-6-luna@low/planV2b")).toBe(true);
    // Two-sided contests change the group prompt
    expect(same(v2Record(mp), "gpt-6-luna@low/planV2b")).toBe(false);
    // Planner v2c's schema and prompt differ everywhere; a record without a hash or a case never stands in
    expect(same(v2Record(sp), "gpt-6-luna@low/planV2c")).toBe(false);
    expect(same({ ...v2Record(sp), promptHash: undefined }, "gpt-6-luna@low/planV2b")).toBe(false);
    expect(same({ ...v2Record(sp), caseId: "unknown" }, "gpt-6-luna@low/planV2b")).toBe(false);
  });

  it("chains the migration check's planner into its first turn on the chapter-plan cases only, with production's pair per player count, at one sample", () => {
    expect(plan("migration", { mode: "pipeline", roles: ["switch"] })).toEqual([]);
    const chains = plan("migration", { mode: "pipeline", roles: ["switch", "thread"] });
    expect(chains.map((j) => [j.caseId, j.armKey, j.sample])).toEqual([
      ["mp-thread", "pipeline:gpt-6-luna@low/prod>gpt-6-luna@low/prod", 1],
      ["sp-thread", "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod", 1],
    ]);
  });

  it("still plans AI Iteration in the migration check when asked for it", () => {
    const iteration = evalCase("iter-a", "iteration", {
      iteration: { template: { title: "T" }, feedback: "More rivalry", sections: ["stats"], playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 },
    });
    const jobs = planJobs([iteration], { stage: "migration", promptState: "round1", roles: ["iteration"], mode: "isolated", subset15: false, records: [] });
    // Production's template-editor default: Sol low since the owner's templates decision (2026-09-28)
    expect(jobs.map((j) => `${j.armKey} s${j.sample}`)).toEqual(["gpt-6-sol@low/prod s1", "gpt-6-sol@low/prod s2"]);
  });

  it("keeps the round cases out of the closed Stages 0 to 4, isolated and chained, and plans them in the migration check", () => {
    const cases = [
      evalCase("sp-switch", "switch", { state: createMockStoryState() }),
      evalCase("round-switch-late", "switch", { state: createMockStoryState(), tags: tags({ source: "round" }) }),
      evalCase("sp-thread", "thread", { state: threadAnalysisAfterSwitch(1).getState() }),
      evalCase("round-thread-short", "thread", { state: threadAnalysisAfterSwitch(1).getState(), tags: tags({ source: "round" }) }),
    ];
    const caseIds = (stage: PlanOptions["stage"], mode: PlanOptions["mode"], role: "switch" | "thread") =>
      [...new Set(planJobs(cases, { stage, promptState: "round1", roles: [role], mode, subset15: false, records: [] }).map((j) => j.caseId))].sort();
    for (const stage of ["0", "1-2", "3", "4"] as const) {
      expect(caseIds(stage, "isolated", "switch")).toEqual(["sp-switch"]);
      expect(caseIds(stage, "pipeline", "switch")).toEqual(["sp-switch"]);
      expect(caseIds(stage, "pipeline", "thread")).toEqual(["sp-thread"]);
    }
    expect(caseIds("migration", "isolated", "switch")).toEqual(["round-switch-late", "sp-switch"]);
    expect(caseIds("migration", "pipeline", "thread")).toEqual(["round-thread-short", "sp-thread"]);
  });

  it("plans a case frozen for a later stage only from that stage on, so the stages closed before it keep their rows as they ran", () => {
    const [built] = STAGE_SCOPING_NEW_CASES;
    const stored = evalCase("sp-thread", "thread", { state: threadAnalysisAfterSwitch(1).getState() });
    const frozenLater = evalCase(built, "thread", { state: threadAnalysisAfterSwitch(1).getState(), tags: tags({ source: "round" }) });
    const planned = (cases: EvalCase[], stage: PlanOptions["stage"], mode: PlanOptions["mode"]) =>
      planJobs(cases, { stage, promptState: "round1", roles: ["thread"], mode, subset15: false, records: [] }).map((j) => keyOf(j)).sort();
    for (const stage of STAGES.slice(0, STAGES.indexOf("stage-scoping"))) {
      for (const mode of ["isolated", "pipeline"] as const) {
        expect({ stage, mode, jobs: planned([stored, frozenLater], stage, mode) }).toEqual({ stage, mode, jobs: planned([stored], stage, mode) });
      }
    }
    // The stages the verifier found reopened do plan chapter-planning cases, so the comparison above is not empty there
    for (const stage of ["turn-rounds", "migration", "plan-refresh", "final-check"] as const) expect(planned([stored], stage, "isolated")).not.toEqual([]);
    for (const stage of ["turn-rounds", "migration", "reruns", "final-check"] as const) expect(planned([stored], stage, "pipeline")).not.toEqual([]);
    const scoping = planJobs([stored, frozenLater], { stage: "stage-scoping", promptState: "round1", roles: ["thread"], mode: "isolated", subset15: false, records: [] });
    expect([...new Set(scoping.map((j) => j.caseId))].sort()).toEqual([built, "sp-thread"]);
  });

  it("plans planner v2e (planner-v2e, 2026-09-30) twice on every chapter-planning case, the stage scoping's built ones included, and nothing else", () => {
    const [built] = STAGE_SCOPING_NEW_CASES;
    const stored = evalCase("sp-thread", "thread", { state: threadAnalysisAfterSwitch(1).getState() });
    const frozenLater = evalCase(built, "thread", { state: threadAnalysisAfterSwitch(1).getState(), tags: tags({ source: "round" }) });
    const switchCase = evalCase("sp-switch", "switch", { state: threadAnalysisAfterSwitch(1).getState() });
    const jobs = planJobs([stored, frozenLater, switchCase], { stage: "planner-v2e", promptState: "round0", roles: ["switch", "thread"], mode: "isolated", subset15: false, records: [] });
    expect(jobs.map((j) => `${j.caseId} s${j.sample} ${j.armKey}`).sort()).toEqual(
      [built, "sp-thread"].flatMap((id) => [1, 2].map((s) => `${id} s${s} gpt-6-luna@low/planV2e`)).sort()
    );
    expect(planJobs([stored], { stage: "planner-v2e", promptState: "round0", roles: ["thread"], mode: "pipeline", subset15: false, records: [] })).toEqual([]);
  });
});

describe("requestFor: the Stage 4 variants", () => {
  const setupInput = { role: "setup" as const, setup: { premise: "A premise", playerCount: 1 as const, gameMode: GameModes.SinglePlayer, maxTurns: 25 } };

  it("refuses a role a rewrite variant does not cover", () => {
    expect(() => requestFor("rewriteSlim", setupInput)).toThrow("Variant rewriteSlim does not cover role setup");
    expect(() => requestFor("rewriteZeroShot", { role: "beat", story: firstSwitchBeat(1) })).toThrow("Variant rewriteZeroShot does not cover role beat");
    expect(() => requestFor("rewrite2Slim", setupInput)).toThrow("Variant rewrite2Slim does not cover role setup");
    expect(() => requestFor("rewrite2ZeroShot", { role: "beat", story: firstSwitchBeat(1) })).toThrow("Variant rewrite2ZeroShot does not cover role beat");
  });

  it("builds each count-fix variant as its Stage 4 variant with worded counts", () => {
    const story = threadBeat(1);
    const pairs: [VariantId, VariantId, RequestInput][] = [
      ["rewrite2", "rewrite", setupInput],
      ["rewrite2ZeroShot", "rewriteZeroShot", setupInput],
      ["rewrite2", "rewrite", { role: "beat", story }],
      ["rewrite2Slim", "rewriteSlim", { role: "beat", story }],
    ];
    for (const [worded, exact, input] of pairs) {
      const [a, b] = [requestFor(worded, input), requestFor(exact, input)];
      if (!isSplitRequest(a) || !isSplitRequest(b)) throw new Error("expected split requests");
      expect({ worded, fixed: a.fixed.replace(`${NO_EMPTY_ITEMS}\n`, ""), perCall: a.perCall }).toEqual({ worded, fixed: b.fixed, perCall: b.perCall });
      expect(a.fixed).toContain(NO_EMPTY_ITEMS);
    }
  });
});

describe("requestFor: setup round 1", () => {
  const MULTIPLAYER_MODES = [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive];
  const INPUTS: [1 | 2 | 3, GameMode][] = [[1, GameModes.SinglePlayer], ...([2, 3] as const).flatMap((n) => MULTIPLAYER_MODES.map((m): [2 | 3, GameMode] => [n, m]))];
  const setup = (playerCount: 1 | 2 | 3, gameMode: GameMode): RequestInput => ({ role: "setup", setup: { premise: "A premise", playerCount, gameMode, maxTurns: 25 } });

  it.each(INPUTS)("%i players, %s: builds the custom-story request in production's one-message shape", (players, mode) => {
    const request = requestFor("setupR1", setup(players, mode));
    expect(isSplitRequest(request)).toBe(false);
    const expected = setupRound1Request("A premise", players, mode, 25, "story");
    expect(requestText(request)).toBe(expected.prompt);
    expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(expected.schema)));
  });

  it("builds AI Iteration with round 1's text, and refuses the turn roles", () => {
    const iteration = { template: { title: "T" }, feedback: "More rivalry", sections: ["stats"], playerCount: 2 as const, gameMode: GameModes.Competitive, maxTurns: 25 };
    const request = requestFor("setupR1", { role: "iteration", iteration });
    expect(requestText(request)).toBe(iterationRound1Request("More rivalry", 2, GameModes.Competitive, 25, ["stats"], { title: "T" }).prompt);
    expect(() => requestFor("setupR1", { role: "beat", story: firstSwitchBeat(1) })).toThrow("Variant setupR1 does not cover role beat");
  });

  it.each(INPUTS)("%i players, %s: builds round 1b (round 1 with the report's fixes) for custom stories and AI Iteration", (players, mode) => {
    const request = requestFor("setupR1b", setup(players, mode));
    const expected = setupRequestFromRound1("A premise", players, mode, 25, "story", ROUND1B_PARTS);
    expect(isSplitRequest(request)).toBe(false);
    expect(requestText(request)).toBe(expected.prompt);
    expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(expected.schema)));
    expect(requestText(request)).not.toBe(requestText(requestFor("setupR1", setup(players, mode))));
    const iteration = { template: { title: "T" }, feedback: "More rivalry", sections: ["stats"], playerCount: players, gameMode: mode, maxTurns: 25 };
    expect(requestText(requestFor("setupR1b", { role: "iteration", iteration }))).toBe(
      iterationRequestFromRound1("More rivalry", players, mode, 25, ["stats"], { title: "T" }, ROUND1B_PARTS).prompt
    );
    expect(() => requestFor("setupR1b", { role: "beat", story: firstSwitchBeat(1) })).toThrow("Variant setupR1b does not cover role beat");
  });

  it.each(INPUTS)("%i players, %s: builds round 1c (round 1b with proposal 1's fix-and-retest) for custom stories and AI Iteration", (players, mode) => {
    const request = requestFor("setupR1c", setup(players, mode));
    const expected = setupRequestFromRound1("A premise", players, mode, 25, "story", ROUND1C_PARTS);
    expect(requestText(request)).toBe(expected.prompt);
    expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(expected.schema)));
    const iteration = { template: { title: "T" }, feedback: "More rivalry", sections: ["stats"], playerCount: players, gameMode: mode, maxTurns: 25 };
    expect(requestText(requestFor("setupR1c", { role: "iteration", iteration }))).toBe(
      iterationRequestFromRound1("More rivalry", players, mode, 25, ["stats"], { title: "T" }, ROUND1C_PARTS).prompt
    );
    expect(() => requestFor("setupR1c", { role: "beat", story: firstSwitchBeat(1) })).toThrow("Variant setupR1c does not cover role beat");
  });

  it.each(INPUTS)("%i players, %s: the Stage 3 and Stage 4 setup variants still build on production's anchors", (players, mode) => {
    for (const variant of ["minimal", "rewrite", "rewriteZeroShot", "rewrite2", "rewrite2ZeroShot"] as VariantId[]) {
      expect(() => requestFor(variant, setup(players, mode))).not.toThrow();
    }
  });

  it("gives the example-copy check round 1's own worked example to read", () => {
    const block = exampleBlock(requestText(requestFor("setupR1", setup(2, GameModes.Competitive))));
    expect(block?.startsWith(WORKED_EXAMPLE_HEADING)).toBe(true);
    expect(block).toContain("Not like this:");
    expect(block).not.toContain("Character Selection Instructions");
  });
});

describe("requestFor: setup round 2", () => {
  const MULTIPLAYER_MODES = [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive];
  const INPUTS: [1 | 2 | 3, GameMode][] = [[1, GameModes.SinglePlayer], ...([2, 3] as const).flatMap((n) => MULTIPLAYER_MODES.map((m): [2 | 3, GameMode] => [n, m]))];
  const setup = (playerCount: 1 | 2 | 3, gameMode: GameMode): RequestInput => ({ role: "setup", setup: { premise: "A premise", playerCount, gameMode, maxTurns: 25 } });

  it.each(INPUTS)("%i players, %s: builds arm A (today's field order) and arm B (the generation order) in production's one-message shape", (players, mode) => {
    const pairs: [VariantId, Round2Order][] = [
      ["setupR2", "fieldOrder"],
      ["setupR2Order", "generationOrder"],
    ];
    for (const [variant, order] of pairs) {
      const request = requestFor(variant, setup(players, mode));
      expect(isSplitRequest(request)).toBe(false);
      const expected = setupRound2Request("A premise", players, mode, 25, "story", order);
      expect(requestText(request)).toBe(expected.prompt);
      expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(expected.schema)));
      expect("assemble" in request).toBe(order === "generationOrder");
    }
  });

  it("builds AI Iteration with arm A's text for both arms (A9 leaves iteration on today's order), and refuses the turn roles", () => {
    const iteration = { template: { title: "T" }, feedback: "More rivalry", sections: ["guidelines", "stats"], playerCount: 2 as const, gameMode: GameModes.Competitive, maxTurns: 25 };
    const expected = iterationRound2Request("More rivalry", 2, GameModes.Competitive, 25, ["guidelines", "stats"], { title: "T" }).prompt;
    for (const variant of ["setupR2", "setupR2Order"] as VariantId[]) {
      expect(requestText(requestFor(variant, { role: "iteration", iteration }))).toBe(expected);
      expect(() => requestFor(variant, { role: "beat", story: firstSwitchBeat(1) })).toThrow(`Variant ${variant} does not cover role beat`);
    }
  });

  it.each(INPUTS)("%i players, %s: builds round 2b's two arms on round 1b's passing changes, custom stories and AI Iteration", (players, mode) => {
    const pairs: [VariantId, Round2Order][] = [
      ["setupR2b", "fieldOrder"],
      ["setupR2bOrder", "generationOrder"],
    ];
    for (const [variant, order] of pairs) {
      const request = requestFor(variant, setup(players, mode));
      const expected = setupRound2Request("A premise", players, mode, 25, "story", order, ROUND2B_BASE_PARTS);
      expect(requestText(request)).toBe(expected.prompt);
      expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(expected.schema)));
      expect("assemble" in request).toBe(order === "generationOrder");
      const iteration = { template: { title: "T" }, feedback: "More rivalry", sections: ["guidelines", "stats"], playerCount: players, gameMode: mode, maxTurns: 25 };
      expect(requestText(requestFor(variant, { role: "iteration", iteration }))).toBe(
        iterationRound2Request("More rivalry", players, mode, 25, ["guidelines", "stats"], { title: "T" }, ROUND2B_BASE_PARTS).prompt
      );
      expect(() => requestFor(variant, { role: "beat", story: firstSwitchBeat(1) })).toThrow(`Variant ${variant} does not cover role beat`);
    }
  });

  it("assembles an arm B reply before anything reads it", () => {
    const request = requestFor("setupR2Order", setup(1, GameModes.SinglePlayer));
    const reply = { guidelines: { world: "w" }, threadDesign: { typesOfThreads: ["t"] }, playerOutcomes: { player1: [] }, player1: {} };
    expect(assembledReply(request, reply)).toMatchObject({ guidelines: { world: "w", typesOfThreads: ["t"] }, player1: { outcomes: [] } });
    expect(assembledReply(requestFor("setupR2", setup(1, GameModes.SinglePlayer)), reply)).toBe(reply);
  });

  it("gives the example-copy check production's example stat setups, which round 2's base keeps", () => {
    const block = exampleBlock(requestText(requestFor("setupR2", setup(2, GameModes.Competitive))));
    expect(block?.startsWith("EXAMPLE STAT SETUPS")).toBe(true);
    expect(block).not.toContain("Personal Dream");
    expect(block).not.toContain("Character Selection Instructions");
  });
});

describe("requestFor: setup round 3 and the chain's planner and turn forms", () => {
  const MULTIPLAYER_MODES = [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive];
  const INPUTS: [1 | 2 | 3, GameMode][] = [[1, GameModes.SinglePlayer], ...([2, 3] as const).flatMap((n) => MULTIPLAYER_MODES.map((m): [2 | 3, GameMode] => [n, m]))];
  const setup = (playerCount: 1 | 2 | 3, gameMode: GameMode, kids?: boolean): RequestInput => ({
    role: "setup",
    setup: { premise: "A premise", playerCount, gameMode, maxTurns: 25, ...(kids === undefined ? {} : { kids }) },
  });

  it.each(INPUTS)("%i players, %s: builds round 3 as round 2b's arm B with round 3's parts, in production's one-message shape", (players, mode) => {
    for (const kids of [false, true]) {
      const request = requestFor("setupR3", setup(players, mode, kids));
      const expected = setupRound2Request("A premise", players, mode, 25, "story", "generationOrder", ROUND3_PARTS, { kids });
      expect(isSplitRequest(request)).toBe(false);
      expect(requestText(request)).toBe(expected.prompt);
      expect(JSON.stringify(toJsonSchema(request.schema))).toBe(JSON.stringify(toJsonSchema(expected.schema)));
      expect("assemble" in request).toBe(true);
    }
    expect(requestText(requestFor("setupR3", setup(players, mode)))).toBe(requestText(requestFor("setupR3", setup(players, mode, false))));
  });

  it("reads whether a child reads along from the case's tags, and leaves every earlier setup form as it was", () => {
    const kidsCase = evalCase("setup-kids-animal-rescue", "setup", {
      setup: { premise: "A premise", playerCount: 2, gameMode: GameModes.Cooperative, maxTurns: 25 },
      tags: tags({ kids: true, players: 2, multiplayer: true }),
    });
    const input = requestInputFor(kidsCase);
    expect(input.role === "setup" && input.setup.kids).toBe(true);
    expect(requestText(requestFor("setupR3", input))).toContain("A child reads this story along with an adult");
    // A form without round 3's parts ignores it: today's prompt and round 2b's arm B stay byte for byte
    const plain = setup(2, GameModes.Cooperative, false);
    for (const variant of ["prod", "setupR1c", "setupR2bOrder"] as VariantId[]) expect(requestText(requestFor(variant, input))).toBe(requestText(requestFor(variant, plain)));
  });

  it("builds AI Iteration on round 3's text, and refuses the turn roles", () => {
    const iteration = { template: { title: "T" }, feedback: "More rivalry", sections: ["guidelines", "stats"], playerCount: 3 as const, gameMode: GameModes.Competitive, maxTurns: 25 };
    expect(requestText(requestFor("setupR3", { role: "iteration", iteration }))).toBe(
      iterationRound2Request("More rivalry", 3, GameModes.Competitive, 25, ["guidelines", "stats"], { title: "T" }, ROUND3_PARTS).prompt
    );
    expect(() => requestFor("setupR3", { role: "beat", story: firstSwitchBeat(1) })).toThrow("Variant setupR3 does not cover role beat");
  });

  it("builds planner v2 with two-sided contests for both planners", () => {
    const [switchStory, threadStory] = [firstSwitchBeat(3), threadAnalysisAfterSwitch(3)];
    expect(requestText(requestFor("planV2b", { role: "switch", story: switchStory }))).toBe(plannerV2SwitchRequest(switchStory, false).prompt);
    expect(requestText(requestFor("planV2b", { role: "thread", story: threadStory }))).toBe(plannerV2ThreadRequest(threadStory, false, { twoSided: true }).prompt);
    expect(() => requestFor("planV2b", { role: "beat", story: threadBeat(1) })).toThrow("Variant planV2b does not cover role beat");
  });

  it("builds today's turn form with B6 alone on single-player turns", () => {
    const story = threadBeat(1);
    expect(requestText(requestFor("turnB6", { role: "beat", story }))).toBe(todaysFormWithB6Request(story).prompt);
    expect(() => requestFor("turnB6", { role: "switch", story: firstSwitchBeat(1) })).toThrow("Variant turnB6 does not cover role switch");
  });
});

describe("rebuiltToday: stored records that may stand in as a round's reference", () => {
  const setupCase = evalCase("setup-learn-lemonade", "setup", { setup: { premise: "A premise", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 } });
  const stored = (armKey: string, promptHash: string | undefined, caseId = setupCase.id) =>
    record({ caseId, armKey, callArmKey: armKey, promptHash, role: "setup", group: "setup", promptState: "postfix" });

  it("accepts a record whose request today's code builds byte for byte on the record's own variant, and nothing else", () => {
    const current = rebuiltToday([setupCase]);
    const prod = todaysRequestHash(setupCase);
    const round1 = todaysRequestHash(setupCase, "setupR1");
    expect(prod).toBeDefined();
    expect(round1).not.toBe(prod);
    expect(current(stored("gpt-6-luna@low/prod", prod))).toBe(true);
    expect(current(stored("gpt-6-luna@low/setupR1", round1))).toBe(true);
    expect(current(stored("gpt-6-luna@low/setupR1", prod))).toBe(false);
    expect(current(stored("gpt-6-luna@low/prod", "an older prompt"))).toBe(false);
    expect(current(stored("gpt-6-luna@low/prod", undefined))).toBe(false);
    expect(current(stored("gpt-6-luna@low/prod", prod, "a case that is not frozen"))).toBe(false);
  });

  it("has no hash for a request today's code cannot build", () => {
    expect(todaysRequestHash(setupCase, "rewriteSlim")).toBeUndefined();
  });

  it("rebuilds a chain's planner from its case and its turn from the stored plan, each on its own side's variant", () => {
    // The final check reads production's own chains against today's pair's stored ones (2026-09-28)
    const threadCase = evalCase("sp-thread", "thread", { state: threadAnalysisAfterSwitch(1, { id: "story-sp-thread" }).getState() });
    const chain = "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod";
    const plan = threadAnalysis("challenge", 3, 0);
    const hash = (request: Parameters<typeof requestText>[0]) => sha256(requestText(request));
    const plannerHash = hash(requestFor("prod", { role: "thread", story: caseStory(threadCase, false) }));
    const turnHash = hash(requestFor("prod", { role: "beat", story: storyAfterAnalysis(caseStory(threadCase, false), "thread", plan) }));
    const step = (n: number, promptHash: string, overrides: Partial<CallRecord> = {}) =>
      record({
        caseId: threadCase.id,
        armKey: chain,
        callArmKey: n === 1 ? "gpt-6-luna@low/prod" : "gpt-6-luna@medium/prod",
        jobKey: `${threadCase.id}|${chain}|round0|1`,
        group: "pipeline",
        role: n === 1 ? "thread" : "beat",
        step: n,
        jobFinal: n === 2,
        promptHash,
        promptState: "round0",
        outputFile: `outputs/step${n}.json`,
        ...overrides,
      });
    const records = [step(1, plannerHash), step(2, turnHash)];
    const load = (r: CallRecord) => (r.outputFile === "outputs/step1.json" ? plan : undefined);
    const current = rebuiltToday([threadCase], { records, load });
    expect(records.map(current)).toEqual([true, true]);
    // A turn written from another plan, or a planner on another form, is not today's
    expect(current(step(2, "an older turn"))).toBe(false);
    expect(current(step(1, hash(requestFor("planV2", { role: "thread", story: caseStory(threadCase, false) }))))).toBe(false);
    // The turn's request needs the stored plan: without the chain's records only the planner can be rebuilt
    const alone = rebuiltToday([threadCase]);
    expect(records.map(alone)).toEqual([true, false]);
    // A turn whose planner step is not today's is not today's either
    const stale = [step(1, "an older planner"), step(2, turnHash)];
    expect(rebuiltToday([threadCase], { records: stale, load })(stale[1])).toBe(false);
  });
});

describe("storyAfterAnalysis: chains go on with the plan the game keeps", () => {
  /** A thread plan of duration 3 whose one thread has 2 steps: the game's check takes the length from the steps */
  const shortPlan = () => {
    const plan = threadAnalysis("challenge", 3, 0);
    plan.threads[0].progression.pop();
    return plan;
  };

  it("applies the checked plan: a thread's length equals its steps", () => {
    const plan = storyAfterAnalysis(threadAnalysisAfterSwitch(1), "thread", shortPlan()).getCurrentThreadAnalysis();
    expect(plan?.duration).toBe(2);
    expect(plan?.threads.map((t) => t.duration)).toEqual([2]);
  });

  it("applies an unusable plan as written, since the eval cannot ask again", () => {
    // The fixture's thread pushes outcome_1, which this story does not hold
    const story = threadAnalysisAfterSwitch(1, { sharedOutcomes: [outcome("shared_escape")] });
    expect(storyAfterAnalysis(story, "thread", shortPlan()).getCurrentThreadAnalysis()?.duration).toBe(3);
  });

  it("builds a chain's beat on the checked plan", () => {
    const cases = [evalCase("thread-case", "thread", { state: threadAnalysisAfterSwitch(1).getState() })];
    const [job] = planJobs(cases, {
      stage: "0",
      promptState: "round0",
      roles: ["thread"],
      mode: "pipeline",
      samples: 1,
      subset15: false,
      records: [],
    });
    const beat = job.then?.build(shortPlan());
    const text = beat ? requestText(beat.request()) : "";
    expect(text).toContain("Beat 1/2");
    expect(text).not.toContain("Beat 1/3");
  });
});

describe("retiredPromptStateProblem: the tags --run refuses", () => {
  it("refuses prefix and postfix, whose prompt code is gone, and accepts a new tag", () => {
    expect(retiredPromptStateProblem("prefix")).toMatch(/Run A/);
    expect(retiredPromptStateProblem("postfix")).toMatch(/round0/);
    expect(retiredPromptStateProblem("round0")).toBeUndefined();
  });
});

describe("planJobs: --rare-failure", () => {
  const cases = [
    evalCase("in-subset", "beat", { state: createMockStoryState(), tags: tags({ subset15: true }) }),
    evalCase("outside", "beat", { state: createMockStoryState() }),
  ];
  const options = (rareFailure?: PlanOptions["rareFailure"]): PlanOptions => ({
    stage: "1-2",
    promptState: "postfix",
    roles: ["beat"],
    mode: "isolated",
    subset15: false,
    rareFailure,
    records: [],
  });

  it("plans the regular samples and the batch without the flag", () => {
    // Baseline 2x2, three Luna arms 2x2 each, Luna high 1x2 and Sol low 1x1 on the subset, plus 3 x 50 extra calls
    expect(planJobs(cases, options())).toHaveLength(19 + 150);
  });

  it("skip leaves the rare-failure batch out", () => {
    const jobs = planJobs(cases, options("skip"));
    expect(jobs).toHaveLength(19);
    expect(jobs.every((j) => j.sample <= 2)).toBe(true);
  });

  it("only plans the rare-failure batch, 50 calls per Luna arm and no baseline", () => {
    const jobs = planJobs(cases, options("only"));
    expect(jobs).toHaveLength(150);
    expect(jobs.some((j) => j.baseline)).toBe(false);
    expect(jobs.every((j) => j.sample >= 3)).toBe(true);
    const perArm = jobs.reduce<Record<string, number>>((acc, j) => ((acc[j.armKey] = (acc[j.armKey] ?? 0) + 1), acc), {});
    expect(perArm).toEqual({ "gpt-6-luna@medium/prod": 50, "gpt-6-luna@none/prod": 50, "gpt-6-luna@low/prod": 50 });
  });
});

describe("planJobs: Stage 3 scopes, estimates and chains", () => {
  const multiplayer = { multiplayer: true, players: 2 };
  const multiplayerState = createMockMultiplayerStory(2).getState();
  const stage3 = (overrides: Partial<PlanOptions> = {}): PlanOptions => ({
    stage: "3",
    promptState: "postfix",
    roles: ["beat"],
    mode: "isolated",
    subset15: false,
    records: [],
    ...overrides,
  });
  const candidates = (jobs: Job[]) => jobs.filter((j) => !j.baseline);
  const setupCase = (id: string) =>
    evalCase(id, "setup", { setup: { premise: "A premise", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 } });
  const analysisCases = [
    evalCase("sp-switch", "switch", { state: createMockStoryState() }),
    evalCase("mp-switch", "switch", { state: multiplayerState, tags: tags(multiplayer) }),
  ];

  it("keeps multiplayer cases out of the single-player beat arms, and the baseline on every case", () => {
    const cases = [
      evalCase("sp", "beat", { state: createMockStoryState() }),
      evalCase("mp", "beat", { state: multiplayerState, tags: tags(multiplayer) }),
    ];
    const jobs = planJobs(cases, stage3());
    expect(new Set(candidates(jobs).map((j) => j.caseId))).toEqual(new Set(["sp"]));
    expect(new Set(jobs.filter((j) => j.baseline).map((j) => j.caseId))).toEqual(new Set(["sp", "mp"]));
  });

  it("restricts an arm to its case list, which --cases narrows further", () => {
    const cases = [setupCase("setup-pretend-er-doctor"), setupCase("setup-vent-subscription")];
    const onArm = (jobs: Job[], armKey: string) => candidates(jobs).filter((j) => j.armKey === armKey).map((j) => j.caseId);
    const all = planJobs(cases, stage3({ roles: ["setup"] }));
    expect(onArm(all, "gpt-6-sol@low/minimal")).toEqual(["setup-pretend-er-doctor"]);
    expect(onArm(all, "gpt-6-luna@low/minimal")).toHaveLength(4);
    const narrowed = planJobs(cases, stage3({ roles: ["setup"], caseIds: ["setup-vent-subscription"] }));
    expect(onArm(narrowed, "gpt-6-sol@low/minimal")).toEqual([]);
  });

  it("estimates a new variant from its reference's measured outputs until it has enough of its own", () => {
    const cases = [evalCase("sp", "beat", { state: createMockStoryState() })];
    const measured = (armKey: string, outputTokens: number): CallRecord[] =>
      Array.from({ length: MIN_MEASURED_RECORDS }, (_, i) =>
        record({ jobKey: `${armKey}-${i}`, role: "beat", armKey, callArmKey: armKey, outputTokens })
      );
    const estimate = (records: CallRecord[]) =>
      planJobs(cases, stage3({ records, armKeys: ["gpt-6-luna@medium/minimal"] }))[0].first.estimate.outputTokens;
    expect(estimate([])).toBe(2_100 + 6_200);
    expect(estimate(measured("gpt-6-luna@medium/prod", 1_600))).toBe(1_600);
    expect(estimate([...measured("gpt-6-luna@medium/prod", 1_600), ...measured("gpt-6-luna@medium/minimal", 900)])).toBe(900);
  });

  it("chains Luna low minimal analysis into the two minimal beat arms, on single-player cases at one sample", () => {
    const jobs = planJobs(analysisCases, stage3({ roles: ["switch"], mode: "pipeline" }));
    expect(candidates(jobs).map((j) => [j.caseId, j.armKey, j.sample])).toEqual([
      ["sp-switch", "pipeline:gpt-6-luna@low/minimal>gpt-6-luna@medium/minimal", 1],
      ["sp-switch", "pipeline:gpt-6-luna@low/minimal>gpt-6-luna@low/minimal", 1],
    ]);
    // The baseline chain stays on every case at 2 samples
    expect(jobs.filter((j) => j.baseline)).toHaveLength(4);
  });

  it("keeps the Stage 1-2 chains: Luna low analysis into three Luna beat arms, 2 samples, every case", () => {
    const jobs = candidates(planJobs(analysisCases, stage3({ stage: "1-2", roles: ["switch"], mode: "pipeline" })));
    expect(jobs).toHaveLength(2 * 3 * 2);
    expect(new Set(jobs.map((j) => j.armKey))).toEqual(
      new Set(["none", "low", "medium"].map((effort) => `pipeline:gpt-6-luna@low/prod>gpt-6-luna@${effort}/prod`))
    );
  });

  it("refuses a variant for a role it does not cover", () => {
    const input = { role: "setup" as const, setup: { premise: "A premise", playerCount: 1 as const, gameMode: GameModes.SinglePlayer, maxTurns: 25 } };
    expect(() => requestFor("slim", input)).toThrow("Variant slim does not cover role setup");
  });
});
