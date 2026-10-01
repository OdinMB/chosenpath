import {
  computeArmStats,
  weightedQuantile,
  type ArmStats,
  type CostReading,
} from "../../../../src/evals/textModelEval/armStats.js";
import { gates, storyCost, type GameplayConfig } from "../../../../src/evals/textModelEval/gateReadings.js";
import { renderResults } from "../../../../src/evals/textModelEval/resultsReport.js";
import { resolveCaps } from "../../../../src/evals/textModelEval/budget.js";
import type { CheckResult } from "../../../../src/evals/textModelEval/textChecks.js";
import type { CaseTags } from "../../../../src/evals/textModelEval/cases.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { record, tags } from "./fixtures.js";

const flat = (perCall: number, byPlayers: Record<number, number> = {}): CostReading => ({ perCall, byPlayers });

/** The same per-call cost on both bases */
function priced(perCall: number, byPlayers: Record<number, number> = {}): Pick<ArmStats, "cost"> {
  return { cost: { billed: flat(perCall, byPlayers), uncached: flat(perCall, byPlayers) } };
}

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
    ruleTallies: {},
    noiseFloor: {},
    latency: { n: 10, p50: 10, p95: 20 },
    beatOnlyLatencies: [10, 12, 20],
    turnLatencies: [],
    latencyByPlayers: {},
    medianTokens: { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0, visible: 0 },
    meanCounts: {},
    countMoments: {},
    cache: { readShare: 0, writeShare: 0, writingCalls: 0, lines: 0 },
    inputCost: { billed: 0, uncached: 0 },
    ...priced(0.01),
    ...overrides,
  };
}

describe("storyCost", () => {
  it("counts 85/19/21 calls with pregeneration and 29/7/7 without, plus one setup", () => {
    const config: GameplayConfig = {
      beat: arm(priced(0.01)),
      switch: arm(priced(0.002)),
      thread: arm(priced(0.004)),
      setup: arm(priced(0.1)),
    };
    const cost = storyCost(config, "billed");
    expect(cost.withPregen).toBeCloseTo(0.85 + 0.038 + 0.084 + 0.1);
    expect(cost.withoutPregen).toBeCloseTo(0.29 + 0.014 + 0.028 + 0.1);
  });

  it("prices by basis and by player count, falling back to the mean over all calls", () => {
    const beat = arm({ cost: { billed: flat(0.02, { 1: 0.01, 3: 0.03 }), uncached: flat(0.04, { 1: 0.02 }) } });
    const config: GameplayConfig = { beat, setup: arm(priced(0.1, { 3: 0.2 })) };
    expect(storyCost(config, "billed").withPregen).toBeCloseTo(0.85 + 0.1);
    expect(storyCost(config, "uncached").withPregen).toBeCloseTo(1.7 + 0.1);
    expect(storyCost(config, "billed", 3).withoutPregen).toBeCloseTo(29 * 0.03 + 0.2);
    // No 3-player uncached beat calls: the mean over all calls stands in
    expect(storyCost(config, "uncached", 3).withoutPregen).toBeCloseTo(29 * 0.04 + 0.2);
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

  it("counts the turn rounds' preparation calls, kept beside calls.jsonl, under their stage and in the total", () => {
    const text = renderResults({
      records: [record({ costUsd: 0.25 })],
      checks: new Map(),
      tags: new Map(),
      caps: resolveCaps({}).caps,
      sideSpend: [{ stage: "turn-rounds", costUsd: 0.5 }],
      generatedAt: new Date(0),
    });
    expect(text).toContain("| turn-rounds | $0.50 | $2.00 |");
    expect(text).toContain("| total | $0.75 | $48.00 |");
  });

  it("reads a job attempt recorded twice once, and still counts both calls' spend", () => {
    const twice = [
      record({ jobKey: "a|arm|prefix|s1", caseId: "a", costUsd: 0.25, latencyMs: 30_000 }),
      record({ jobKey: "a|arm|prefix|s1", caseId: "a", costUsd: 0.5, latencyMs: 50_000 }),
    ];
    const text = renderResults({ records: twice, checks: new Map(), tags: new Map([["a", tags()]]), caps: resolveCaps({}).caps, generatedAt: new Date(0) });
    expect(text).toContain("| 0 | $0.75 | $8.00 |");
    // One call, the later record: its wait and its cost
    const row = text.split("\n").find((line) => line.startsWith(`| beat | ${record().armKey} (baseline) |`)) as string;
    expect(row.split(" | ")[2]).toBe("1");
    expect(row).toContain("| 50.0 s | 50.0 s |");
    expect(row).toContain("$0.5000");
  });
});

describe("renderResults: the variant section", () => {
  const MEDIUM_MINIMAL = "gpt-6-luna@medium/minimal";
  const MEDIUM_PROD = "gpt-6-luna@medium/prod";
  const call = (armKey: string, overrides: Partial<CallRecord> = {}): CallRecord =>
    record({ jobKey: `a|${armKey}|postfix|s1`, promptState: "postfix", armKey, callArmKey: armKey, model: "gpt-6-luna", baseline: false, caseId: "a", ...overrides });
  const render = (records: CallRecord[]) =>
    renderResults({ records, checks: new Map(), tags: new Map([["a", tags()]]), caps: resolveCaps({}).caps, generatedAt: new Date(0) });

  it("renders nothing without comparisons", () => {
    expect(render([call(MEDIUM_PROD)])).not.toContain("### Variants against their reference");
  });

  it("names each arm's reference, and reads input and caching against it", () => {
    const rewrite = "gpt-6-luna@medium/rewriteSlim";
    const slim = "gpt-6-luna@medium/slim";
    const text = render([
      call(rewrite, { cacheLine: "A", inputTokens: 10_000, cachedTokens: 4_000, cacheWriteTokens: 0, outputTokens: 1_000 }),
      call(slim, { inputTokens: 12_000, outputTokens: 1_000 }),
    ]);
    expect(text).toContain("### Variants against their reference (Stage 3 trims, Stage 4 rewrite, setup and turn rounds)");
    expect(text).toContain(`| beat | ${rewrite} | ${slim} | 1 |`);
    expect(text).toContain("**Input and caching**");
    // Cache lines 0 -> 1, read share 0% -> 40%, median input tokens 12000 -> 10000
    expect(text).toMatch(new RegExp(`\\| beat \\| ${rewrite} \\| 0 → 1 \\| 0 → 0 \\| 0\\.0% → 40\\.0% \\| 12000 → 10000 \\(-17%\\) \\|`));
  });

  it("shows full -> trimmed with the change in tokens, waits and cost", () => {
    const text = render([
      call(MEDIUM_MINIMAL, { outputTokens: 700, reasoningTokens: 200, latencyMs: 20_000, costUsd: 0.001 }),
      call(MEDIUM_PROD, { outputTokens: 1_400, reasoningTokens: 400, latencyMs: 40_000, costUsd: 0.002 }),
    ]);
    expect(text).toContain("1000 → 500 (-50%)");
    expect(text).toContain("400 → 200 (-50%)");
    expect(text).toContain("40.0 s → 20.0 s (-50%)");
    expect(text).toContain("$0.0020 → $0.0010 (-50%)");
    // 85 beats per single-player story with pregeneration
    expect(text).toContain("$0.1700 → $0.0850");
  });

  it("names a stored reference by its prompt state, and lists shares beyond the noise with the checks", () => {
    const ROUND1 = "gpt-6-luna@low/setupR1";
    const LUNA_PROD = "gpt-6-luna@low/prod";
    const setupCall = (promptState: string, armKey: string, sample: number) =>
      record({
        jobKey: `a|${armKey}|${promptState}|s${sample}`,
        promptState,
        role: "setup",
        group: "setup",
        armKey,
        callArmKey: armKey,
        model: "gpt-6-luna",
        baseline: false,
        caseId: "a",
        sample,
        promptHash: "today",
        outputFile: `${promptState}|${armKey}|${sample}`,
      });
    const records = [1, 2].flatMap((sample) => [setupCall("round0", ROUND1, sample), setupCall("postfix", LUNA_PROD, sample)]);
    const checks = new Map<string, CheckResult>(
      records.map((r) => [r.outputFile as string, { checks: {}, counts: { spendablePlayerStats: r.armKey === ROUND1 ? 4 : 2, visiblePlayerStats: 4 }, unknownIds: [] }])
    );
    const text = renderResults({
      records,
      checks,
      tags: new Map([["a", tags()]]),
      caps: resolveCaps({}).caps,
      storedReference: (r) => r.promptHash === "today",
      generatedAt: new Date(0),
    });
    expect(text).toContain(`| setup | ${ROUND1} | postfix:${LUNA_PROD} (stored) | 2 |`);
    expect(text).toContain("spendableShare 50.0% → 100.0%");
  });

  it("lists what moved under the stop rule apart from what is only beyond the noise, with its p or standard errors", () => {
    const ROUND1 = "gpt-6-luna@low/setupR1";
    const LUNA_PROD = "gpt-6-luna@low/prod";
    const cases = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const setupCall = (promptState: string, armKey: string, caseId: string, sample: number) =>
      record({
        jobKey: `${caseId}|${armKey}|${promptState}|s${sample}`,
        promptState,
        role: "setup",
        group: "setup",
        armKey,
        callArmKey: armKey,
        model: "gpt-6-luna",
        baseline: false,
        caseId,
        sample,
        promptHash: "today",
        outputFile: `${promptState}|${armKey}|${caseId}|${sample}`,
      });
    const records = [1, 2].flatMap((sample) => cases.flatMap((c) => [setupCall("round0", ROUND1, c, sample), setupCall("postfix", LUNA_PROD, c, sample)]));
    const even = (r: CallRecord) => Number(r.caseId.slice(1)) % 2 === 0;
    const checks = new Map<string, CheckResult>(
      records.map((r) => {
        const round1 = r.armKey === ROUND1;
        return [
          r.outputFile as string,
          {
            // modeSlate 50% -> 100%; playerStats 100% -> 39 of 40
            checks: { modeSlate: round1 || even(r), playerStats: !(round1 && r.caseId === "c0" && r.sample === 1) },
            // 1s and 3s -> 0s
            counts: { compoundQuestions: round1 ? 0 : even(r) ? 1 : 3 },
            unknownIds: [],
          },
        ];
      })
    );
    const text = renderResults({
      records,
      checks,
      tags: new Map(cases.map((c) => [c, tags()])),
      caps: resolveCaps({}).caps,
      storedReference: (r) => r.promptHash === "today",
      generatedAt: new Date(0),
    });
    expect(text).toContain("| Role | Arm | Reference | State counts per call, reference (±noise) → arm | Moved lower | Moved higher | Beyond noise, not moved |");
    expect(text).toContain(
      `| setup | ${ROUND1} | postfix:${LUNA_PROD} (stored) | compoundQuestions 2.00 (±0.00) → 0.00 | compoundQuestions 2.00 → 0.00 (12.5 SE) | modeSlate 50.0% → 100.0% (p < 0.001) | playerStats 100.0% → 97.5% (p 0.500) |`
    );
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
    beat: arm({ baseline: true, latencyByPlayers: { 2: [30, 40], 3: [40, 50] } }),
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

  it("reads the cost cap on each basis against the baseline's figure on the same basis", () => {
    // The baseline got cache hits: billed $0.006 per beat, $0.01 uncached
    const cachedBaseline: GameplayConfig = { ...baseline, beat: arm({ ...baseline.beat, cost: { billed: flat(0.006), uncached: flat(0.01) } }) };
    const { cost } = gates({ ...baseline, beat: arm(priced(0.008)) }, cachedBaseline);
    expect(cost.billed).toMatchObject({ withinCap: false });
    expect(cost.uncached).toMatchObject({ withinCap: true });
    expect(cost.uncached.baselinePerStory).toBeGreaterThan(cost.billed.baselinePerStory);
  });

  it("reads the setup cap (1.5x today's wait) on the median and on the p95", () => {
    const setup = (p50: number, p95: number) => gates({ ...baseline, setup: arm({ group: "setup", latency: { n: 2, p50, p95 } }) }, baseline).setup;
    expect(setup(60, 75)).toMatchObject({ medianWithinCap: true, p95WithinCap: true, baselineP95: 50 });
    expect(setup(55, 80)).toMatchObject({ medianWithinCap: true, p95WithinCap: false });
    expect(setup(61, 70)).toMatchObject({ medianWithinCap: false, p95WithinCap: true });
  });

  it("prices a multiplayer story at its player count, with and without multiplayer pregeneration", () => {
    const beat = arm({ ...priced(0.01, { 1: 0.01, 2: 0.03 }), latencyByPlayers: { 1: [10], 2: [30] } });
    const setup = arm({ group: "setup", ...priced(0.1, { 2: 0.12 }) });
    const { multiplayer } = gates({ beat, setup }, baseline);
    expect(Object.keys(multiplayer.costByPlayers)).toEqual(["2"]);
    expect(multiplayer.costByPlayers[2].billed.withoutMpPregen).toBeCloseTo(29 * 0.03 + 0.12);
    expect(multiplayer.costByPlayers[2].billed.withMpPregen).toBeCloseTo(85 * 0.03 + 0.12);
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
  it("sums a call's attempts, so a re-send costs what production pays", () => {
    const attempts = [
      record({ jobKey: "a|arm|postfix|s1", caseId: "a", attempt: 1, final: false, jobFinal: false, outcome: "invalid-json", costUsd: 0.01 }),
      record({ jobKey: "a|arm|postfix|s1", caseId: "a", attempt: 2, costUsd: 0.01 }),
      record({ jobKey: "b|arm|postfix|s1", caseId: "b", costUsd: 0.01, players: 2 }),
    ];
    const [stats] = computeArmStats(attempts, new Map(), new Map([["a", tags()], ["b", tags()]]));
    expect(stats.cost.billed.perCall).toBeCloseTo(0.015);
    expect(stats.cost.billed.byPlayers).toEqual({ 1: 0.02, 2: 0.01 });
    expect(stats.validity).toMatchObject({ calls: 2, firstAttemptValid: 1, validWithinRetries: 2 });
  });

  it("prices cache writes as plain input on the uncached basis (caching off)", () => {
    // Luna per 1M: input $0.10, cache write $0.125, output $0.50
    const written = record({ caseId: "a", model: "gpt-6-luna", inputTokens: 1_000_000, cacheWriteTokens: 400_000, outputTokens: 0, costUsd: 0.11 });
    const [stats] = computeArmStats([written], new Map(), new Map([["a", tags()]]));
    expect(stats.cost.uncached.perCall).toBeCloseTo(0.1, 10);
    expect(stats.inputCost).toEqual({ billed: expect.closeTo(0.11, 10), uncached: expect.closeTo(0.1, 10) });
  });

  it("leaves a rejected request out of the call count, and reads its rate over all records", () => {
    const records = [
      record({ jobKey: "a|arm|postfix|s1", caseId: "a", outcome: "http-error", status: 400, rejectedParam: true, costUsd: 0, costSource: "none" }),
      record({ jobKey: "a|arm|postfix|s1", caseId: "a" }),
    ];
    const [stats] = computeArmStats(records, new Map(), new Map([["a", tags()]]));
    expect(stats.calls).toBe(1);
    expect(stats.rates.rejectedParam).toBeCloseTo(0.5);
  });

  it("prices only calls with a model attempt: a job left with a rejected request is no $0 call", () => {
    const rejected = record({
      jobKey: "b|arm|postfix|s1",
      caseId: "b",
      outcome: "http-error",
      status: 400,
      rejectedParam: true,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      costSource: "none",
      cacheLine: "B",
    });
    // Luna per 1M: input $0.10, output $0.50, so $0.01 of input and $0.01 of output
    const valid = record({ jobKey: "a|arm|postfix|s1", caseId: "a", model: "gpt-6-luna", inputTokens: 100_000, outputTokens: 20_000, costUsd: 0.02, cacheLine: "A" });
    const [stats] = computeArmStats([valid, rejected], new Map(), new Map([["a", tags()], ["b", tags()]]));
    expect(stats.calls).toBe(1);
    expect(stats.cost.billed).toEqual({ perCall: 0.02, byPlayers: { 1: 0.02 } });
    expect(stats.cost.uncached.perCall).toBeCloseTo(0.02, 10);
    expect(stats.inputCost.billed).toBeCloseTo(0.01, 10);
    expect(stats.inputCost.uncached).toBeCloseTo(0.01, 10);
    // A line whose only call was rejected is not a cache line
    expect(stats.cache.lines).toBe(1);
    expect(stats.rates.rejectedParam).toBeCloseTo(0.5);
  });

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

  it("averages the checks' state counts over usable final calls, and reads visible tokens as output minus reasoning", () => {
    const checks = new Map<string, CheckResult>([
      ["o1", { checks: {}, counts: { facts: 2, threads: 1 }, unknownIds: [] }],
      ["o2", { checks: {}, counts: { facts: 4 }, unknownIds: [] }],
      ["o3", { checks: {}, counts: { facts: 90 }, unknownIds: [] }],
    ]);
    const records = [
      record({ jobKey: "a", caseId: "a", outputFile: "o1", outputTokens: 1_500, reasoningTokens: 500 }),
      record({ jobKey: "b", caseId: "a", outputFile: "o2", outputTokens: 1_500, reasoningTokens: 500 }),
      // An unusable final call does not count
      record({ jobKey: "c", caseId: "a", outputFile: "o3", outcome: "invalid-json" }),
    ];
    const [stats] = computeArmStats(records, checks, new Map([["a", tags()]]));
    expect(stats.meanCounts).toEqual({ facts: 3, threads: 1 });
    expect(stats.medianTokens.visible).toBe(1_000);
  });

  it("keeps the passes behind each rate and the moments behind each mean, over usable final calls, for the stop rule", () => {
    const checks = new Map<string, CheckResult>([
      ["o1", { checks: { paragraphs: true }, counts: { facts: 2 }, unknownIds: [] }],
      ["o2", { checks: { paragraphs: false }, counts: { facts: 4 }, unknownIds: [] }],
      ["o3", { checks: { paragraphs: true }, counts: { facts: 6 }, unknownIds: [] }],
      ["o4", { checks: { paragraphs: false }, counts: { facts: 90 }, unknownIds: [] }],
    ]);
    const records = [
      record({ jobKey: "a", caseId: "a", outputFile: "o1" }),
      record({ jobKey: "b", caseId: "a", outputFile: "o2" }),
      record({ jobKey: "c", caseId: "a", outputFile: "o3" }),
      // An unusable final call does not count
      record({ jobKey: "d", caseId: "a", outputFile: "o4", outcome: "invalid-json" }),
    ];
    const [stats] = computeArmStats(records, checks, new Map([["a", tags()]]));
    expect(stats.ruleTallies).toEqual({ paragraphs: { hits: 2, n: 3 } });
    expect(stats.countMoments).toEqual({ facts: { n: 3, mean: 4, variance: 4 } });
  });
});
