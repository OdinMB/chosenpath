import {
  computeArmStats,
  gates,
  renderResults,
  storyCost,
  weightedQuantile,
  type ArmStats,
  type GameplayConfig,
} from "../../../../src/evals/textModelEval/resultsReport.js";
import { resolveCaps } from "../../../../src/evals/textModelEval/budget.js";
import type { CheckResult } from "../../../../src/evals/textModelEval/textChecks.js";
import type { CaseTags } from "../../../../src/evals/textModelEval/cases.js";
import { record, tags } from "./fixtures.js";

function arm(overrides: Partial<ArmStats> = {}): ArmStats {
  return {
    promptState: "prefix",
    group: "beat",
    armKey: "a",
    model: "gpt-6-luna",
    baseline: false,
    calls: 10,
    validity: { calls: 10, firstAttemptValid: 10, invalidFirstAttempts: 0, validWithinRetries: 10, transportOnly: 0 },
    rates: { repaired: 0, refusal: 0, length: 0, rejectedParam: 0, textAfterJson: 0, junk: 0 },
    ruleRates: {},
    noiseFloor: {},
    latency: { n: 10, p50: 10, p95: 20 },
    beatOnlyLatencies: [10, 12, 20],
    turnLatencies: [],
    latencyByPlayers: {},
    medianTokens: { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 },
    costPerCall: 0.01,
    uncachedCostPerCall: 0.01,
    ...overrides,
  };
}

describe("storyCost", () => {
  it("counts 85/19/21 calls with pregeneration and 29/7/7 without, plus one setup", () => {
    const config: GameplayConfig = {
      beat: arm({ costPerCall: 0.01 }),
      switch: arm({ costPerCall: 0.002 }),
      thread: arm({ costPerCall: 0.004 }),
      setup: arm({ costPerCall: 0.1 }),
    };
    const cost = storyCost(config);
    expect(cost.withPregen).toBeCloseTo(0.85 + 0.038 + 0.084 + 0.1);
    expect(cost.withoutPregen).toBeCloseTo(0.29 + 0.014 + 0.028 + 0.1);
  });

  it("prices a single-player story from single-player calls when there are any", () => {
    const config: GameplayConfig = { beat: arm({ costPerCall: 0.02, singlePlayerCostPerCall: 0.01 }) };
    expect(storyCost(config).withPregen).toBeCloseTo(0.85);
  });
});

describe("renderResults", () => {
  it("counts the probe's spend against Stage 0", () => {
    const text = renderResults({
      records: [record({ costUsd: 0.25 })],
      checks: new Map(),
      tags: new Map(),
      caps: resolveCaps({}).caps,
      probe: { generatedAt: "", results: [], totalCostUsd: 0.5, priorSpendUsd: 0.25 },
      generatedAt: new Date(0),
    });
    expect(text).toContain("| 0 | $1.00 | $8.00 |");
  });
});

describe("weightedQuantile", () => {
  it("weights samples", () => {
    const samples = [
      { value: 1, weight: 0.25 },
      { value: 10, weight: 0.25 },
      { value: 100, weight: 0.5 },
    ];
    expect(weightedQuantile(samples, 0.5)).toBe(10);
    expect(weightedQuantile(samples, 0.51)).toBe(100);
    expect(weightedQuantile([], 0.5)).toBeUndefined();
  });
});

describe("gates", () => {
  const baseline: GameplayConfig = {
    beat: arm({ baseline: true, costPerCall: 0.01, latencyByPlayers: { 2: [30, 40], 3: [40, 50] } }),
    switch: arm({ latency: { n: 2, p50: 4, p95: 5 } }),
    thread: arm({ latency: { n: 2, p50: 6, p95: 8 } }),
    setup: arm({ group: "setup", latency: { n: 2, p50: 40, p95: 50 } }),
  };

  it("applies the 60 s cap to beat-only turns and to analysis turns separately", () => {
    const fast = gates({ ...baseline, beat: arm({ beatOnlyLatencies: [20, 30], latency: { n: 2, p50: 25, p95: 30 } }) }, baseline);
    expect(fast.pregenTurn).toMatchObject({ pass: true, source: "summed", analysisTurnP95: 38 });
    const slowAnalysis = gates({ ...baseline, beat: arm({ beatOnlyLatencies: [20, 30], turnLatencies: [40, 65] }) }, baseline);
    expect(slowAnalysis.pregenTurn).toMatchObject({ pass: false, source: "pipeline", beatOnlyP95: 30 });
  });

  it("sums single-player waits for an analysis turn when single-player calls exist", () => {
    const beat = arm({ beatOnlyLatencies: [20], latency: { n: 3, p50: 20, p95: 50 }, latencyByPlayers: { 1: [20, 25], 3: [50] } });
    const thread = arm({ latency: { n: 3, p50: 6, p95: 20 }, latencyByPlayers: { 1: [5, 6], 3: [20] } });
    expect(gates({ ...baseline, beat, thread }, baseline).pregenTurn.analysisTurnP95).toBe(31);
  });

  it("caps cost at the baseline's per-story cost", () => {
    expect(gates({ ...baseline, beat: arm({ costPerCall: 0.009 }) }, baseline).costCap.pass).toBe(true);
    expect(gates({ ...baseline, beat: arm({ costPerCall: 0.011 }) }, baseline).costCap.pass).toBe(false);
  });

  it("allows a setup up to 1.5 times the baseline median", () => {
    const setup = (p50: number) => gates({ ...baseline, setup: arm({ group: "setup", latency: { n: 1, p50, p95: p50 } }) }, baseline).setup?.pass;
    expect(setup(60)).toBe(true);
    expect(setup(61)).toBe(false);
  });

  it("marks multiplayer pregeneration above +5 s and fails above 60 s", () => {
    const mp = (values: number[]) => gates({ ...baseline, beat: arm({ latencyByPlayers: { 2: values } }) }, baseline).multiplayer.verdict;
    expect(mp([30, 44])).toBe("ok");
    expect(mp([30, 46])).toBe("needs multiplayer pregeneration");
    expect(mp([30, 61])).toBe("fail");
  });

  it("flags the no-pregeneration exception only for a fast full turn", () => {
    const quick = arm({ beatOnlyLatencies: [3, 4, 5], turnLatencies: [5, 6, 7] });
    expect(gates({ ...baseline, beat: quick }, baseline).noPregen.exception).toBe(true);
    const slower = arm({ beatOnlyLatencies: [3, 4, 5], turnLatencies: [5, 6, 9] });
    expect(gates({ ...baseline, beat: slower }, baseline).noPregen.exception).toBe(false);
  });
});

describe("computeArmStats", () => {
  it("takes the noise floor from the gap between baseline samples 1 and 2", () => {
    const checks = new Map<string, CheckResult>([
      ["o1", { checks: { paragraphs: true }, counts: {}, unknownIds: [] }],
      ["o2", { checks: { paragraphs: true }, counts: {}, unknownIds: [] }],
      ["o3", { checks: { paragraphs: true }, counts: {}, unknownIds: [] }],
      ["o4", { checks: { paragraphs: false }, counts: {}, unknownIds: [] }],
    ]);
    const records = [
      record({ caseId: "a", sample: 1, outputFile: "o1" }),
      record({ caseId: "b", sample: 1, outputFile: "o2" }),
      record({ caseId: "a", sample: 2, outputFile: "o3" }),
      record({ caseId: "b", sample: 2, outputFile: "o4" }),
    ];
    const [stats] = computeArmStats(records, checks, new Map<string, CaseTags>([["a", tags()], ["b", tags({ analysisTurn: true })]]));
    expect(stats.ruleRates.paragraphs).toBeCloseTo(0.75);
    expect(stats.noiseFloor.paragraphs).toBeCloseTo(0.5);
    // Only the case without analysis counts as a beat-only turn
    expect(stats.beatOnlyLatencies).toEqual([10, 10]);
  });
});
