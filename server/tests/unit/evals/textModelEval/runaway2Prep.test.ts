import { describe, expect, it } from "@jest/globals";
import {
  RUNAWAY_2_ARMS,
  firstTries,
  renderRunaway2,
  runawayArmReadings,
  type FirstTry,
} from "../../../../src/evals/textModelEval/runaway2Prep.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { record } from "./fixtures.js";

/*
 * The second runaway replay's readings (2026-10-01): every job's first try on
 * the case, answered or run away (cut at production's output cap, or by its
 * 90-second timeout, which the replay of 2026-09-30 showed is the same runaway
 * a second or two before the cap), each arm against production on the samples
 * both have under the stop rule (stopRule.ts): a variant moved only when its
 * runaway rate is below production's by more than production's own two-half
 * difference (odd samples against even) and a one-sided Fisher p < 0.10.
 * Beside it the answered replies' reasoning tokens (a mean against
 * production's, the same rule), waits and cost.
 */

const PRODUCTION = "gpt-6-luna@medium/adopted";
const NO_AUDIT = "gpt-6-luna@medium/noThreadAudit";
const NO_MILESTONES = "gpt-6-luna@medium/noNewMilestones";

function attempt(armKey: string, sample: number, attemptNo: number, overrides: Partial<CallRecord>): CallRecord {
  return record({
    jobKey: `cont-x|${armKey}|adopted19|s${sample}`,
    stage: "runaway-2",
    promptState: "adopted19",
    caseId: "cont-x",
    armKey,
    callArmKey: armKey,
    model: "gpt-6-luna",
    baseline: false,
    sample,
    attempt: attemptNo,
    startedAt: `2026-10-01T10:${String(sample).padStart(2, "0")}:0${attemptNo}.000Z`,
    reasoningTokens: 1_500,
    outputTokens: 4_000,
    latencyMs: 35_000,
    costUsd: 0.0035,
    ...overrides,
  });
}

const answered = (armKey: string, sample: number, reasoningTokens = 1_500) => [attempt(armKey, sample, 1, { reasoningTokens })];
const ranAway = (armKey: string, sample: number) => [
  attempt(armKey, sample, 1, { outcome: "length", finishReason: "length", reasoningTokens: 12_000, outputTokens: 12_000, latencyMs: 80_000, costUsd: 0.0074, final: false, jobFinal: false, outputFile: undefined }),
  attempt(armKey, sample, 2, { reasoningTokens: 1_400 }),
];

/** An arm's jobs over samples 1..n, those in `runs` run away. */
const arm = (armKey: string, n: number, runs: number[] = [], reasoning = 1_500) =>
  Array.from({ length: n }, (_, i) => i + 1).flatMap((s) => (runs.includes(s) ? ranAway(armKey, s) : answered(armKey, s, reasoning)));

describe("firstTries: each job's first try", () => {
  it("reads a reply cut at the output cap as a runaway, its retry beside it", () => {
    const [t] = firstTries(ranAway(PRODUCTION, 3));
    expect(t).toMatchObject({ armKey: PRODUCTION, variant: "adopted", caseId: "cont-x", sample: 3, kind: "runaway", cut: "length", reasoningTokens: 12_000, retries: 1, retryAnswered: true });
    expect(t.costUsd).toBeCloseTo(0.0074 + 0.0035);
  });

  it("reads production's 90-second timeout as a runaway too (the replay of 2026-09-30: the same runaway, cut a second or two before the cap)", () => {
    const [t] = firstTries([attempt(NO_AUDIT, 1, 1, { outcome: "timeout", latencyMs: 90_040, reasoningTokens: 0, outputTokens: 0, final: false, jobFinal: false }), attempt(NO_AUDIT, 1, 2, {})]);
    expect(t).toMatchObject({ kind: "runaway", cut: "timeout", retries: 1, retryAnswered: true });
  });

  it("reads an answered first try with its reasoning tokens, wait and cost", () => {
    const [t] = firstTries(answered(NO_MILESTONES, 2, 1_234));
    expect(t).toMatchObject({ variant: "noNewMilestones", kind: "answered", reasoningTokens: 1_234, latencyMs: 35_000, retries: 0 });
    expect(t.retryAnswered).toBeUndefined();
  });

  it("skips a transport failure: the first try is the first attempt the model answered or ran away on", () => {
    const tries = firstTries([attempt(PRODUCTION, 1, 1, { outcome: "network-error", latencyMs: 40, reasoningTokens: 0, final: false, jobFinal: false }), attempt(PRODUCTION, 1, 2, { reasoningTokens: 999 })]);
    expect(tries).toHaveLength(1);
    expect(tries[0]).toMatchObject({ kind: "answered", reasoningTokens: 999, retries: 0 });
    // A job whose every attempt failed in transport is a failed try, counted apart
    expect(firstTries([attempt(PRODUCTION, 2, 1, { outcome: "http-error", latencyMs: 400 })])[0]).toMatchObject({ kind: "failed" });
  });

  it("ignores records of other stages", () => {
    expect(firstTries([{ ...answered(PRODUCTION, 1)[0], stage: "runaway" }])).toEqual([]);
  });
});

describe("runawayArmReadings: each arm against production under the stop rule", () => {
  it("moves a variant that never runs away where production does 5 times in 16 (beyond production's two-half difference, Fisher p < 0.10)", () => {
    const tries = firstTries([...arm(PRODUCTION, 16, [2, 5, 9, 12, 15]), ...arm(NO_AUDIT, 16, [], 1_200), ...arm(NO_MILESTONES, 16, [3, 7, 10, 14])]);
    const readings = runawayArmReadings(tries);
    expect(readings.map((r) => r.key)).toEqual([PRODUCTION, NO_AUDIT, NO_MILESTONES]);
    const [production, noAudit, noMilestones] = readings;
    expect(production).toMatchObject({ tries: 16, runaways: 5, answered: 11, retries: 5, retriesAnswered: 5 });
    expect(production.runawayMove).toBeUndefined();
    // Production's odd samples 3 of 8 (5, 9, 15), its even ones 2 of 8 (2, 12): |3/8 - 2/8| = 0.125
    expect(noAudit.runawayMove?.noise).toBeCloseTo(0.125);
    expect(noAudit.runawayMove?.arm).toEqual({ hits: 0, n: 16 });
    expect(noAudit.runawayMove?.reference).toEqual({ hits: 5, n: 16 });
    expect(noAudit.runawayMove?.move.moved).toBe("lower");
    expect(noAudit.runawayMove?.move.p).toBeLessThan(0.05);
    // 4 of 16 against 5 of 16: within the noise
    expect(noMilestones.runawayMove?.move.moved).toBeUndefined();
    // The answered replies' reasoning: 1,200 against 1,500 every time, no spread, so certain
    expect(noAudit.reasoning.mean).toBe(1_200);
    expect(noAudit.reasoningMove?.move.moved).toBe("lower");
  });

  it("reads only the samples both have: a variant run on samples 1 to 8 against production's 1 to 8", () => {
    const tries = firstTries([...arm(PRODUCTION, 16, [2, 5, 9, 12, 15]), ...arm(NO_AUDIT, 8)]);
    const noAudit = runawayArmReadings(tries).find((r) => r.key === NO_AUDIT)!;
    expect(noAudit.runawayMove?.reference).toEqual({ hits: 2, n: 8 });
    expect(noAudit.runawayMove?.arm).toEqual({ hits: 0, n: 8 });
    // 0 of 8 against 2 of 8: Fisher p about 0.23, not moved
    expect(noAudit.runawayMove?.move.moved).toBeUndefined();
  });

  it("leaves a failed try out of the counts and reports it", () => {
    const tries = firstTries([...arm(PRODUCTION, 2), attempt(NO_AUDIT, 1, 1, { outcome: "network-error", latencyMs: 30 }), ...answered(NO_AUDIT, 2)]);
    const noAudit = runawayArmReadings(tries).find((r) => r.key === NO_AUDIT)!;
    expect(noAudit).toMatchObject({ tries: 1, failed: 1, runaways: 0 });
  });

  it("names the stage's arms in order: production, then the two diagnostic variants", () => {
    expect(RUNAWAY_2_ARMS).toEqual([PRODUCTION, NO_AUDIT, NO_MILESTONES]);
  });
});

describe("renderRunaway2", () => {
  it("writes a table per arm, the moves, and every runaway first try with its time", () => {
    const tries: FirstTry[] = firstTries([...arm(PRODUCTION, 4, [2]), ...arm(NO_AUDIT, 4)]);
    const md = renderRunaway2({ generatedAt: new Date("2026-10-01T12:00:00Z"), tries, readings: runawayArmReadings(tries), replies: [], spendUsd: 0.05 });
    expect(md).toContain("# The runaway turn, second attempt (runaway-2)");
    expect(md).toContain("| gpt-6-luna@medium/adopted | 4 | 1 |");
    expect(md).toContain("| gpt-6-luna@medium/noThreadAudit | 4 | 0 |");
    expect(md).toMatch(/cont-x s2 .*gpt-6-luna@medium\/adopted.*10:02:01/);
    expect(md).toContain("$0.0500");
  });
});
