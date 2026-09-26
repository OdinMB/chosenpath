import { jest } from "@jest/globals";
import { GameModes } from "core/types/index.js";
import { MIN_MEASURED_RECORDS } from "../../../../src/evals/textModelEval/pricing.js";
import { planJobs, type PlanOptions } from "../../../../src/evals/textModelEval/jobPlan.js";
import type { CallRecord, Job } from "../../../../src/evals/textModelEval/runner.js";
import { requestFor } from "../../../../src/evals/textModelEval/variants.js";
import { createMockMultiplayerStory, createMockStoryState } from "../../../helpers/testHelpers.js";
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
    env: {},
  });

  it("drops multiplayer continuation beats and keeps first beats, endings and single-player beats", () => {
    expect(planJobs(cases, options(true)).map((j) => j.caseId)).toEqual(["sp-continuation", "mp-first", "mp-ending"]);
  });

  it("keeps every beat case without the flag", () => {
    expect(planJobs(cases, options(false)).map((j) => j.caseId)).toEqual(cases.map((c) => c.id));
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
    env: {},
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
    env: {},
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

  it("estimates a new variant from its prod sibling's measured outputs until it has enough of its own", () => {
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
