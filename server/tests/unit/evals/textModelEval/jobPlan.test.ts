import { jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, type GameMode } from "core/types/index.js";
import { exampleBlock } from "../../../../src/evals/textModelEval/setupDesignChecks.js";
import {
  ROUND1B_PARTS,
  ROUND1C_PARTS,
  WORKED_EXAMPLE_HEADING,
  iterationRequestFromRound1,
  iterationRound1Request,
  setupRequestFromRound1,
  setupRound1Request,
} from "../../../../src/game/services/storyTextRounds/setupRound1.js";
import { ROUND2B_BASE_PARTS, iterationRound2Request, setupRound2Request, type Round2Order } from "../../../../src/game/services/storyTextRounds/setupRound2.js";
import { MIN_MEASURED_RECORDS } from "../../../../src/evals/textModelEval/pricing.js";
import { planJobs, rebuiltToday, storyAfterAnalysis, todaysRequestHash, type PlanOptions } from "../../../../src/evals/textModelEval/jobPlan.js";
import type { CallRecord, Job } from "../../../../src/evals/textModelEval/runner.js";
import {
  assembledReply,
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

  it("plans setup rounds 1 and 2 in the setup rounds, and nothing yet in the turn rounds", () => {
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
    });
    expect(plan("setup-rounds").every((j) => !isSplitRequest(j.first.request()))).toBe(true);
    expect(plan("turn-rounds")).toEqual([]);
    expect(plan("turn-rounds", { mode: "pipeline", roles: ["switch"] })).toEqual([]);
  });

  it("builds the turn rounds' references in the migration check: production's GPT-6 defaults per player count, no setup", () => {
    // Single-player beats on Luna medium, twice on the stored cases and once on the round cases; multiplayer beats on
    // Luna low once, on the stored cases only; the planners on Luna low twice everywhere. Setup reads the stored
    // setups, which today's code rebuilds byte for byte.
    expect(perArm(plan("migration", { roles: ["setup", "beat", "switch", "thread"] }))).toEqual({
      "gpt-6-luna@medium/prod": ["sp s1", "sp s2", "round-sp s1"],
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
    expect(jobs.map((j) => `${j.armKey} s${j.sample}`)).toEqual(["gpt-6-luna@low/prod s1", "gpt-6-luna@low/prod s2"]);
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
