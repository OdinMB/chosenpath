import { describe, expect, it } from "@jest/globals";
import { asCall, checkedTurns } from "../../../../src/evals/textModelEval/checkedTurns.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { record } from "./fixtures.js";

/*
 * Production's one checked retry of a turn, read as the turn the player gets
 * (the choice-line-sp stage, 2026-09-30): the first reply, the retry where
 * production's check asked again, the reply the game keeps (production's own
 * checkedBeatReply on the stored replies), the whole wait and the cost.
 */

const LINE = "gpt-6-luna@medium/choiceResult";

const reply = (paragraphs: number, options = 3) => ({
  player1: {
    text: Array.from({ length: paragraphs }, (_, i) => `Paragraph ${i + 1}. It goes on. And on.`).join("\n\n"),
    options: Array.from({ length: options }, (_, i) => ({ text: `Option ${i + 1}` })),
  },
});

/** A job's records and the replies their output files hold. */
function turnOf(sample: number, steps: { step: number; attempt?: number; seconds: number; outcome?: CallRecord["outcome"]; final?: boolean; jobFinal?: boolean; reply?: unknown; costUsd?: number; checkedRetry?: CallRecord["checkedRetry"] }[]) {
  const jobKey = `c|${LINE}|adopted6|s${sample}`;
  const outputs = new Map<string, unknown>();
  const records = steps.map((s, i) => {
    const outputFile = `outputs/${sample}-${i}.json`;
    if (s.reply !== undefined) outputs.set(outputFile, s.reply);
    return record({
      jobKey,
      stage: "choice-line-sp",
      promptState: "adopted6",
      caseId: "c",
      armKey: LINE,
      callArmKey: LINE,
      model: "gpt-6-luna",
      baseline: false,
      sample,
      step: s.step,
      attempt: s.attempt ?? 1,
      latencyMs: s.seconds * 1000,
      outcome: s.outcome ?? "valid",
      final: s.final ?? true,
      jobFinal: s.jobFinal ?? s.final ?? true,
      costUsd: s.costUsd ?? 0.004,
      outputFile,
      ...(s.checkedRetry ? { checkedRetry: s.checkedRetry } : {}),
    });
  });
  return { records, outputs };
}

async function read(...jobs: ReturnType<typeof turnOf>[]) {
  const records = jobs.flatMap((j) => j.records);
  const outputs = new Map(jobs.flatMap((j) => [...j.outputs]));
  return checkedTurns(records, (r) => (r.outputFile ? outputs.get(r.outputFile) : undefined), () => false);
}

describe("checkedTurns: each turn job as the turn the player gets", () => {
  it("reads a turn production's check let through as its first reply, the wait its answer's plus every attempt sent again at once", async () => {
    const [turn] = await read(
      turnOf(1, [
        { step: 1, attempt: 1, seconds: 10, outcome: "invalid-json", final: false },
        // A dropped connection is retried after a backoff: no part of the wait, as in the turn waits
        { step: 1, attempt: 2, seconds: 0.1, outcome: "network-error", final: false },
        { step: 1, attempt: 3, seconds: 30, reply: reply(5) },
      ])
    );
    expect(turn).toMatchObject({ armKey: LINE, caseId: "c", sample: 1, kept: 1, firstShort: false, keptShort: false, firstWaitMs: 40_000, waitMs: 40_000 });
    expect(turn.costUsd).toBeCloseTo(0.012);
    expect([turn.retry, turn.retried]).toEqual([undefined, undefined]);
  });

  it("keeps the retry of a short first reply, and waits for both", async () => {
    const [turn] = await read(
      turnOf(1, [
        { step: 1, seconds: 20, jobFinal: false, reply: reply(1), checkedRetry: "short" },
        { step: 2, seconds: 30, reply: reply(5), checkedRetry: "short" },
      ])
    );
    expect(turn).toMatchObject({ retried: "short", kept: 2, firstShort: true, keptShort: false, firstWaitMs: 20_000, waitMs: 50_000 });
    expect(turn.firstCostUsd).toBeCloseTo(0.004);
    expect(turn.costUsd).toBeCloseTo(0.008);
  });

  it("keeps a second short reply as production does, and the short first reply where the retry has no options or its call failed", async () => {
    const turns = await read(
      turnOf(1, [
        { step: 1, seconds: 20, jobFinal: false, reply: reply(1), checkedRetry: "short" },
        { step: 2, seconds: 30, reply: reply(1), checkedRetry: "short" },
      ]),
      turnOf(2, [
        { step: 1, seconds: 20, jobFinal: false, reply: reply(1), checkedRetry: "short" },
        { step: 2, seconds: 30, reply: reply(5, 0), checkedRetry: "short" },
      ]),
      turnOf(3, [
        { step: 1, seconds: 20, jobFinal: false, reply: reply(1), checkedRetry: "short" },
        { step: 2, seconds: 30, outcome: "invalid-json", checkedRetry: "short" },
      ])
    );
    expect(turns.map((t) => [t.sample, t.kept, t.keptShort])).toEqual([
      [1, 2, true],
      [2, 1, true],
      [3, 1, true],
    ]);
  });

  it("fails a turn whose first reply had no options and whose retry has none either, or could not be used", async () => {
    const turns = await read(
      turnOf(1, [
        { step: 1, seconds: 20, jobFinal: false, reply: reply(5, 0), checkedRetry: "noOptions" },
        { step: 2, seconds: 30, reply: reply(5, 0), checkedRetry: "noOptions" },
      ]),
      turnOf(2, [
        { step: 1, seconds: 20, jobFinal: false, reply: reply(5, 0), checkedRetry: "noOptions" },
        { step: 2, seconds: 30, outcome: "invalid-json", checkedRetry: "noOptions" },
      ])
    );
    expect(turns.map((t) => [t.sample, t.kept, t.firstWithoutOptions])).toEqual([
      [1, undefined, true],
      [2, undefined, true],
    ]);
    expect(turns.map((t) => (asCall(t, "kept") === undefined ? "none" : "kept"))).toEqual(["none", "none"]);
  });

  it("reads no turn while a retry is due but unrecorded, nor a turn of a stage without the checked retry", async () => {
    const pending = turnOf(1, [{ step: 1, seconds: 20, jobFinal: false, reply: reply(1), checkedRetry: "short" }]);
    const other = turnOf(2, [{ step: 1, seconds: 20, reply: reply(1) }]);
    other.records.forEach((r) => Object.assign(r, { stage: "choice-result" }));
    expect(await read(pending, other)).toEqual([]);
  });

  it("reads a job run again after an interruption by its last run of each step", async () => {
    const [turn] = await read(
      turnOf(1, [
        // Interrupted before the retry: step 1 ran again on the next invocation, and its reply was fine
        { step: 1, attempt: 1, seconds: 20, jobFinal: false, reply: reply(1), checkedRetry: "short" },
        { step: 1, attempt: 2, seconds: 25, reply: reply(5) },
      ])
    );
    expect(turn).toMatchObject({ kept: 1, firstShort: false, waitMs: 25_000 });
    expect(turn.retried).toBeUndefined();
    expect(turn.first.attempt).toBe(2);
  });
});

describe("asCall: a turn as one call for the readings (variantComparison, turnWaits)", () => {
  it("is the reply kept, finishing its job, with the turn's whole wait and cost; or the first reply with its own", async () => {
    const [turn] = await read(
      turnOf(1, [
        { step: 1, seconds: 20, jobFinal: false, reply: reply(1), checkedRetry: "short", costUsd: 0.003 },
        { step: 2, seconds: 30, reply: reply(5), checkedRetry: "short", costUsd: 0.005 },
      ])
    );
    const kept = asCall(turn, "kept");
    expect(kept).toMatchObject({ jobKey: turn.jobKey, step: 1, attempt: 1, final: true, jobFinal: true, latencyMs: 50_000, outputFile: "outputs/1-1.json" });
    expect(kept?.costUsd).toBeCloseTo(0.008);
    const first = asCall(turn, "first");
    expect(first).toMatchObject({ step: 1, jobFinal: true, latencyMs: 20_000, outputFile: "outputs/1-0.json" });
    expect(first?.costUsd).toBeCloseTo(0.003);
  });
});
