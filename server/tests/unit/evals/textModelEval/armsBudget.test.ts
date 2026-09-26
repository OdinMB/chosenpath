import {
  armKey,
  costFromUsage,
  estimateCall,
  makeArm,
  MIN_MEASURED_RECORDS,
} from "../../../../src/evals/textModelEval/arms.js";
import {
  budgetCheck,
  resolveCaps,
  spentByStage,
} from "../../../../src/evals/textModelEval/budget.js";
import { z } from "zod";
import { requestChars } from "../../../../src/evals/textModelEval/jobPlan.js";

describe("costFromUsage", () => {
  it("bills uncached, cached, cache-write and output tokens separately", () => {
    // 1M in of which 200K cached and 300K written; 1M out (reasoning included)
    const usage = { inputTokens: 1_000_000, cachedTokens: 200_000, cacheWriteTokens: 300_000, outputTokens: 1_000_000, reasoningTokens: 600_000 };
    // Sol: 0.5M × 2.00 + 0.2M × 0.20 + 0.3M × 2.50 + 1M × 10.00
    expect(costFromUsage("gpt-6-sol", usage)).toBeCloseTo(1 + 0.04 + 0.75 + 10);
    // A served snapshot name prices like its family; gpt-4.1-mini is not priced as gpt-4.1
    expect(costFromUsage("gpt-4.1-mini-2025-04-14", { ...usage, cacheWriteTokens: 0 })).toBeCloseTo(0.8 * 0.4 + 0.2 * 0.1 + 1.6);
  });

  it("refuses a model without a price", () => {
    expect(() => costFromUsage("o3", { inputTokens: 1, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 1 })).toThrow();
  });
});

describe("arm keys and estimates", () => {
  it("keys effort arms by effort and temperature arms by temperature", () => {
    expect(armKey({ model: "gpt-6-luna", reasoningEffort: "medium" }, "prod")).toBe("gpt-6-luna@medium/prod");
    expect(armKey({ model: "gpt-4.1-mini", temperature: 0.2 }, "prod")).toBe("gpt-4.1-mini@t0.2/prod");
    expect(armKey({ model: "gpt-6-sol", reasoningEffort: "low", verbosity: "low" }, "prod")).toBe("gpt-6-sol@low+vlow/prod");
  });

  it("switches from the table to measured medians once enough records exist", () => {
    const arm = makeArm({ model: "gpt-6-luna", reasoningEffort: "medium" });
    const base = { role: "beat" as const, arm, promptChars: 4_000, players: 1 };
    const fromTable = estimateCall(base);
    expect(fromTable.outputTokens).toBe(2_100 + 6_200);
    const few = estimateCall({ ...base, measuredOutputTokens: Array(MIN_MEASURED_RECORDS - 1).fill(1_000) });
    expect(few.outputTokens).toBe(fromTable.outputTokens);
    const enough = estimateCall({ ...base, measuredOutputTokens: [900, 1_000, 5_000] });
    expect(enough.outputTokens).toBe(1_000);
    expect(enough.inputTokens).toBe(1_000);
  });

  it("counts the schema as input, since OpenAI bills it", () => {
    const schema = z.object({ answer: z.string().describe("x".repeat(2_000)) });
    const chars = requestChars({ prompt: "p".repeat(1_000), schema });
    expect(chars).toBeGreaterThan(3_000);
    expect(chars).toBeLessThan(3_500);
  });
});

describe("budget caps", () => {
  const spend = (stage0: number, stage12 = 0) =>
    spentByStage([
      { stage: "0", costUsd: stage0 },
      { stage: "1-2", costUsd: stage12 },
    ]);

  it("stops at the stage cap, the global cap and the invocation cap", () => {
    const { caps } = resolveCaps({ maxSpend: 1 });
    expect(budgetCheck(caps, spend(5.9), 0, "0", 0.2)).toMatchObject({ ok: false });
    expect(budgetCheck(caps, spend(5.5), 0, "0", 0.2)).toEqual({ ok: true });
    expect(budgetCheck(caps, spend(6, 11.9), 0, "1-2", 0.05)).toEqual({ ok: true });
    const nearGlobal = spentByStage([{ stage: "0", costUsd: 6 }, { stage: "1-2", costUsd: 12 }, { stage: "3", costUsd: 3 }, { stage: "4", costUsd: 3.9 }]);
    expect(budgetCheck(caps, nearGlobal, 0, "4", 0.05)).toEqual({ ok: true });
    expect(budgetCheck(caps, nearGlobal, 0, "4", 0.2)).toMatchObject({ ok: false });
    expect(budgetCheck(caps, spend(0), 0.95, "0", 0.1)).toMatchObject({ ok: false });
  });

  it("needs a reason above the owner's target and records it", () => {
    expect(() => resolveCaps({ stage: "1-2", stageCap: 14 })).toThrow(/over-target-reason/);
    expect(() => resolveCaps({ globalCap: 30 })).toThrow(/over-target-reason/);
    const { caps, override } = resolveCaps(
      { stage: "1-2", stageCap: 14, overTargetReason: "more Sol setup samples" },
      () => new Date("2026-09-27T00:00:00Z")
    );
    expect(caps.stageCaps["1-2"]).toBe(14);
    expect(override).toEqual({ at: "2026-09-27T00:00:00.000Z", stage: "1-2", stageCap: 14, globalCap: undefined, reason: "more Sol setup samples" });
    // Lowering a cap needs no reason
    expect(resolveCaps({ stage: "0", stageCap: 2 }).override).toBeUndefined();
  });

  it("never lets the global cap pass $50, whatever the reason", () => {
    expect(() => resolveCaps({ globalCap: 50.01, overTargetReason: "anything" })).toThrow(/\$50/);
    expect(resolveCaps({ globalCap: 50, overTargetReason: "ceiling" }).caps.globalCap).toBe(50);
  });
});
