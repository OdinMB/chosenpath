import { z } from "zod";
import { finishedPrepRecord, prepArmKey, prepEstimate, prepJob, prepSpend } from "../../../../src/evals/textModelEval/prepCalls.js";
import { costFromUsage } from "../../../../src/evals/textModelEval/pricing.js";
import { keyOf } from "../../../../src/evals/textModelEval/runner.js";
import { LUNA, record } from "./fixtures.js";

describe("prep calls: the rounds' own calls beside calls.jsonl", () => {
  const request = { prompt: "p".repeat(4_000), schema: z.object({ answer: z.string() }) };

  it("keys a prep job by its kind and arm, in the prep group, never as an eval arm", () => {
    let builds = 0;
    const job = prepJob({
      kind: "backfill",
      stage: "turn-rounds",
      promptState: "round0",
      caseId: "frame-abc",
      sample: 1,
      arm: LUNA,
      role: "thread",
      players: 1,
      build: () => {
        builds++;
        return request;
      },
      outputTokens: 1_500,
    });
    expect(job).toMatchObject({ group: "prep", armKey: "backfill>gpt-6-luna@low/prod", baseline: false, stage: "turn-rounds" });
    expect(keyOf(job)).toBe("frame-abc|backfill>gpt-6-luna@low/prod|round0|s1");
    expect(job.first.request()).toBe(request);
    job.first.request();
    expect(builds).toBe(1);
    expect(prepArmKey("judge", LUNA)).toBe("judge>gpt-6-luna@low/prod");
  });

  it("estimates from the request's characters, the schema included, and the output guess", () => {
    const estimate = prepEstimate(LUNA, request, 1_000);
    expect(estimate.inputTokens).toBeGreaterThan(1_000);
    expect(estimate.outputTokens).toBe(1_000);
    expect(estimate.costUsd).toBeCloseTo(costFromUsage(LUNA.model, { inputTokens: estimate.inputTokens, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 1_000 }));
  });

  it("books every prep record's spend under its stage, and finds a job's usable finishing record", () => {
    const records = [
      record({ jobKey: "k", stage: "turn-rounds", costUsd: 0.001, outcome: "invalid-json", final: false, jobFinal: false }),
      record({ jobKey: "k", stage: "turn-rounds", costUsd: 0.002, attempt: 2 }),
    ];
    expect(prepSpend(records)).toEqual([
      { stage: "turn-rounds", costUsd: 0.001 },
      { stage: "turn-rounds", costUsd: 0.002 },
    ]);
    expect(finishedPrepRecord(records, "k")?.attempt).toBe(2);
    expect(finishedPrepRecord([record({ jobKey: "k", outcome: "schema-mismatch" })], "k")).toBeUndefined();
  });
});
