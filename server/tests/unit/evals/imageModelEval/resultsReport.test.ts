import {
  computeArmMetrics,
  gateFailures,
  percentile,
  summarizeSite,
} from "../../../../src/evals/imageModelEval/resultsReport.js";
import type { ArmMetrics } from "../../../../src/evals/imageModelEval/resultsReport.js";
import type { CallRecord } from "../../../../src/evals/imageModelEval/runner.js";

describe("percentile", () => {
  it("uses the nearest rank", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([40, 10, 30, 20], 95)).toBe(40);
    expect(percentile([5], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
  });

  it("is undefined for no values", () => {
    expect(percentile([], 50)).toBeUndefined();
  });
});

function metrics(overrides: Partial<ArmMetrics>): ArmMetrics {
  return {
    callSite: "beat",
    armKey: "candidate",
    baseline: false,
    calls: 9,
    successes: 9,
    refusals: 0,
    otherErrors: 0,
    junk: 0,
    p95LatencyMs: 20_000,
    ...overrides,
  };
}

describe("gateFailures", () => {
  const baseline = metrics({ armKey: "baseline", baseline: true, otherErrors: 1 });

  it("passes an arm within one failure of the baseline", () => {
    expect(gateFailures(metrics({ refusals: 1, junk: 1 }), baseline)).toEqual([]);
  });

  it("fails an arm with more than one extra failure", () => {
    expect(gateFailures(metrics({ refusals: 2, otherErrors: 1 }), baseline)).toHaveLength(1);
  });

  it("fails a slow beat arm but not a slow cover arm", () => {
    const slowBeat = metrics({ p95LatencyMs: 31_000 });
    const slowCover = metrics({ callSite: "story-cover", p95LatencyMs: 90_000 });
    const coverBaseline = { ...baseline, callSite: "story-cover" as const };

    expect(gateFailures(slowBeat, baseline)).toHaveLength(1);
    expect(gateFailures(slowCover, coverBaseline)).toEqual([]);
  });

  it("allows beat latency up to a slower baseline's p95", () => {
    const slowBaseline = { ...baseline, p95LatencyMs: 45_000 };
    expect(gateFailures(metrics({ p95LatencyMs: 40_000 }), slowBaseline)).toEqual([]);
  });
});

describe("summarizeSite", () => {
  it("lists ruled-out arms and the cheapest arm that passes the gates", () => {
    const all = [
      metrics({ armKey: "gpt-image-1.5@medium", baseline: true, usdPerImage: 0.05 }),
      metrics({ armKey: "slow-cheap", p95LatencyMs: 45_000, usdPerImage: 0.01 }),
      metrics({ armKey: "fast-mid", usdPerImage: 0.04 }),
      metrics({ armKey: "fast-dear", usdPerImage: 0.09 }),
      metrics({ callSite: "story-cover", armKey: "other-site", usdPerImage: 0.001 }),
    ];

    const summary = summarizeSite("beat", all);

    expect(summary?.armsTested).toEqual(["gpt-image-1.5@medium", "fast-dear", "fast-mid", "slow-cheap"]);
    expect(summary?.ruledOut.map((r) => r.armKey)).toEqual(["slow-cheap"]);
    expect(summary?.cheapestPassing?.armKey).toBe("fast-mid");
  });

  it("is undefined when the site has no baseline results", () => {
    expect(summarizeSite("template-cover", [metrics({})])).toBeUndefined();
  });
});

describe("computeArmMetrics", () => {
  function record(overrides: Partial<CallRecord>): CallRecord {
    return {
      itemId: "item",
      caseId: "beat:story:one",
      armKey: "gpt-image-1.5@medium",
      model: "gpt-image-1.5",
      quality: "medium",
      size: "1024x1024",
      startedAt: "",
      latencyMs: 10_000,
      status: "success",
      attempt: 1,
      final: true,
      costUsd: 0.04,
      costSource: "usage",
      ...overrides,
    };
  }

  it("counts only the final outcome per case and arm, and classifies failures", () => {
    const records = [
      record({ caseId: "beat:s:1", status: "error", final: false, errorCode: "RATE_LIMIT" }),
      record({ caseId: "beat:s:1", latencyMs: 12_000 }),
      record({ caseId: "beat:s:2", status: "error", errorCode: "UNKNOWN", errorType: "image_generation_user_error" }),
      record({ caseId: "beat:s:3", status: "error", errorCode: "TECHNICAL" }),
      record({ caseId: "beat:s:4", status: "junk" }),
    ];

    const [beat] = computeArmMetrics(records);

    expect(beat).toMatchObject({
      callSite: "beat",
      baseline: true,
      calls: 4,
      successes: 1,
      refusals: 1,
      otherErrors: 1,
      junk: 1,
      p50LatencyMs: 12_000,
    });
  });
});
