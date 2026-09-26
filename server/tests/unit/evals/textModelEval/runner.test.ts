import { jest } from "@jest/globals";
import { resolveCaps } from "../../../../src/evals/textModelEval/budget.js";
import { sha256, type CallSpec, type ExecutedCall } from "../../../../src/evals/textModelEval/executor.js";
import {
  finishingRecord,
  jobKey,
  keyOf,
  runJobs,
  type CallRecord,
  type Job,
  type RunnerDeps,
} from "../../../../src/evals/textModelEval/runner.js";
import { BASELINE, LUNA, executed, job, plannedCall, record } from "./fixtures.js";

function deps(results: (spec: CallSpec) => ExecutedCall) {
  const calls: CallSpec[] = [];
  const records: CallRecord[] = [];
  const warnings: string[] = [];
  const sleeps: number[] = [];
  const d: RunnerDeps = {
    execute: async (spec) => {
      calls.push(spec);
      return results(spec);
    },
    record: (r) => records.push(r),
    now: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    warn: (line) => warnings.push(line),
  };
  return { d, calls, records, warnings, sleeps };
}

const caps = resolveCaps({}).caps;

describe("runJobs", () => {
  it("skips jobs that already have a final record (resume)", async () => {
    const done = job("case-1", "beat", BASELINE);
    const open = job("case-2", "beat", BASELINE);
    const previous = [record({ jobKey: keyOf(done), caseId: "case-1" })];
    const { d, calls } = deps(() => executed("valid"));
    await runJobs([done, open], d, { caps, previous });
    expect(calls).toHaveLength(1);
    expect(keyOf(open)).toBe(jobKey("case-2", BASELINE.key, "prefix", 1));
  });

  it("retries 429 and 5xx, honouring retry-after, but never a 400", async () => {
    const queue: ExecutedCall[] = [
      { ...executed("http-error", { status: 429 }), capture: { status: 429, retryAfterMs: 1_500 } },
      executed("http-error", { status: 503 }),
      executed("valid"),
      executed("http-error", { status: 400, param: "temperature", rejectedParam: true }),
    ];
    const { d, calls, records, sleeps } = deps(() => queue.shift() as ExecutedCall);
    await runJobs([job("a", "beat", BASELINE), job("b", "beat", BASELINE, { sample: 2 })], d, { caps, previous: [], maxInFlight: 1 });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1_500, 60_000]);
    expect(records.map((r) => [r.caseId, r.attempt, r.final, r.outcome])).toEqual([
      ["a", 1, false, "http-error"],
      ["a", 2, false, "http-error"],
      ["a", 3, true, "valid"],
      ["b", 1, true, "http-error"],
    ]);
    // A rejected request is not billed
    expect(records[3].costUsd).toBe(0);
  });

  it("runs every baseline first, and no candidate where the baseline failed", async () => {
    const jobs = [
      job("good", "beat", LUNA),
      job("bad", "beat", LUNA),
      job("good", "beat", BASELINE),
      job("bad", "beat", BASELINE),
    ];
    // The "bad" baseline (calls 2-4) fails its first attempt and both re-sends
    const { d, calls } = deps((spec) =>
      spec.arm.baseline && calls.length >= 2 ? executed("invalid-json") : executed("valid")
    );
    await runJobs(jobs, d, { caps, previous: [], maxInFlight: 1 });
    expect(calls.map((c) => c.arm.key)).toEqual([BASELINE.key, BASELINE.key, BASELINE.key, BASELINE.key, LUNA.key]);
  });

  describe("re-sends replies production could not parse, as its LangChain retry does", () => {
    const run = async (queue: ExecutedCall[]) => {
      const harness = deps(() => queue.shift() as ExecutedCall);
      await runJobs([job("a", "beat", BASELINE)], harness.d, { caps, previous: [], maxInFlight: 1 });
      return harness;
    };

    it("re-sends an invalid reply at once and stops at the valid one", async () => {
      const { calls, records, sleeps } = await run([executed("invalid-json"), executed("valid")]);
      expect(calls).toHaveLength(2);
      expect(sleeps).toEqual([]);
      expect(records.map((r) => [r.attempt, r.final, r.outcome])).toEqual([
        [1, false, "invalid-json"],
        [2, true, "valid"],
      ]);
    });

    it("gives up after two re-sends", async () => {
      const { calls, records } = await run([executed("invalid-json"), executed("schema-mismatch"), executed("repaired"), executed("valid")]);
      expect(calls).toHaveLength(3);
      expect(records.map((r) => [r.attempt, r.final, r.outcome])).toEqual([
        [1, false, "invalid-json"],
        [2, false, "schema-mismatch"],
        [3, true, "repaired"],
      ]);
    });

    it("keeps both re-sends after a transport retry", async () => {
      const { calls, records, sleeps } = await run([
        executed("http-error", { status: 429 }),
        executed("invalid-json"),
        executed("invalid-json"),
        executed("valid"),
      ]);
      expect(calls).toHaveLength(4);
      expect(sleeps).toEqual([30_000]);
      expect(records.map((r) => r.final)).toEqual([false, false, false, true]);
    });

    it("never re-sends a request the API rejected", async () => {
      const { calls, records } = await run([executed("http-error", { status: 400, param: "temperature", rejectedParam: true }), executed("valid")]);
      expect(calls).toHaveLength(1);
      expect(records[0].final).toBe(true);
    });
  });

  it("runs setup before beats", async () => {
    const { d, calls } = deps(() => executed("valid"));
    await runJobs([job("b", "beat", BASELINE), job("s", "setup", BASELINE)], d, { caps, previous: [], maxInFlight: 1 });
    expect(calls.map((c) => c.role)).toEqual(["setup", "beat"]);
  });

  it("stops scheduling when the next call would pass a cap, counting calls in flight", async () => {
    const small = resolveCaps({ maxSpend: 0.025 }).caps;
    const jobs = ["a", "b", "c"].map((id) => job(id, "beat", BASELINE));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { d, calls } = deps(() => executed("valid"));
    const slow: RunnerDeps = {
      ...d,
      execute: async (spec) => {
        const result = await d.execute(spec);
        await gate;
        return result;
      },
    };
    const run = runJobs(jobs, slow, { caps: small, previous: [], maxInFlight: 3 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Two reservations of $0.01 fit under $0.025; the third would not, although nothing was billed yet
    expect(calls).toHaveLength(2);
    release();
    const result = await run;
    expect(result.stoppedReason).toMatch(/max-spend/);
  });

  it("warns and records when a prompt changes under the same key", async () => {
    const warn = jest.fn();
    const drifting = job("a", "beat", BASELINE, { sample: 2, first: plannedCall("beat", BASELINE, 0.01, "new prompt") });
    const previous = [record({ jobKey: jobKey("a", BASELINE.key, "prefix", 1), caseId: "a", promptHash: "old" })];
    const { d, records } = deps(() => executed("valid", {}, "new"));
    await runJobs([drifting], { ...d, warn }, { caps, previous });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(records[0].promptHashDrift).toBe(true);
  });

  it("plans a job again when its final record is a request the API rejected, and resumes other finals as finished", async () => {
    const rejected = job("rejected", "beat", BASELINE);
    const invalid = job("invalid", "beat", BASELINE);
    const previous = [
      record({ jobKey: keyOf(rejected), caseId: "rejected", outcome: "http-error", status: 400, param: "prompt_cache_breakpoint", rejectedParam: true }),
      record({ jobKey: keyOf(invalid), caseId: "invalid", outcome: "invalid-json" }),
    ];
    const { d, calls, records } = deps(() => executed("valid"));
    await runJobs([rejected, invalid], d, { caps, previous });
    expect(calls).toHaveLength(1);
    // The re-run's attempts are numbered after the rejected one
    expect(records.map((r) => [r.caseId, r.attempt, r.outcome])).toEqual([["rejected", 2, "valid"]]);
  });

  it("gives a re-run attempt its own callId, so the output file of an earlier attempt is never overwritten", async () => {
    const rejected = job("rejected", "beat", BASELINE);
    const fresh = job("fresh", "beat", BASELINE);
    const previous = [
      record({ jobKey: keyOf(rejected), caseId: "rejected", outcome: "http-error", status: 400, param: "prompt_cache_breakpoint", rejectedParam: true }),
    ];
    const { d, calls } = deps(() => executed("valid"));
    await runJobs([rejected, fresh], d, { caps, previous, maxInFlight: 1 });
    const [rerun, first] = calls.map((c) => c.callId);
    expect(rerun).not.toBe(sha256(`${keyOf(rejected)}|1|1`).slice(0, 20));
    expect(rerun).toBe(sha256(`${keyOf(rejected)}|1|2`).slice(0, 20));
    // A job without earlier records keeps the callId it always had
    expect(first).toBe(sha256(`${keyOf(fresh)}|1|1`).slice(0, 20));
  });

  describe("finishingRecord", () => {
    it("is the final record that finished the job, not an earlier rejected request", () => {
      const rejected = record({ jobKey: "k", outcome: "http-error", status: 400, rejectedParam: true, costUsd: 0, costSource: "none" });
      const rerun = record({ jobKey: "k", attempt: 2 });
      expect(finishingRecord([rejected, rerun], "k")).toBe(rerun);
      expect(finishingRecord([rejected], "k")).toBeUndefined();
      expect(finishingRecord([record({ jobKey: "other" })], "k")).toBeUndefined();
    });

    it("is a final record whatever its outcome, as a finished job's is", () => {
      const invalid = record({ jobKey: "k", outcome: "invalid-json" });
      expect(finishingRecord([record({ jobKey: "k", final: false, jobFinal: false, outcome: "invalid-json" }), invalid], "k")).toBe(invalid);
    });
  });

  describe("warm-first: the first call of a cache line runs alone", () => {
    /** Each job's prompt is its case id, so a call names its case (baseline jobs, so none waits on a baseline). */
    const lineJob = (caseId: string, cacheLine?: string): Job => ({
      ...job(caseId, "beat", BASELINE),
      cacheLine,
      first: plannedCall("beat", BASELINE, 0.01, caseId),
    });
    const caseOf = (spec: CallSpec) => ("prompt" in spec.request ? spec.request.prompt : "");

    /** An execute whose first call per case finishes only when the test releases that case. */
    function controlled(result: () => ExecutedCall = () => executed("valid")) {
      const started: string[] = [];
      const releases = new Map<string, () => void>();
      const d: RunnerDeps = {
        ...deps(result).d,
        execute: async (spec) => {
          const caseId = caseOf(spec);
          const first = !started.includes(caseId);
          started.push(caseId);
          if (first) await new Promise<void>((resolve) => releases.set(caseId, resolve));
          return result();
        },
      };
      return { d, started, release: (caseId: string) => releases.get(caseId)?.() };
    }
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

    it("holds the rest of a line until its first call finishes, runs other lines alongside, and never holds a job without a line", async () => {
      const jobs = [lineJob("a1", "A"), lineJob("a2", "A"), lineJob("a3", "A"), lineJob("b1", "B"), lineJob("free")];
      const { d, started, release } = controlled();
      const run = runJobs(jobs, d, { caps, previous: [], maxInFlight: 3 });
      await settle();
      expect(started).toEqual(["a1", "b1", "free"]);
      release("free");
      await settle();
      // The freed worker waits: a2 and a3 are on line A, which is still warming
      expect(started).toEqual(["a1", "b1", "free"]);
      release("a1");
      await settle();
      expect(started.slice(3).sort()).toEqual(["a2", "a3"]);
      for (const id of ["a2", "a3", "b1"]) release(id);
      const result = await run;
      expect(result.stoppedReason).toBeUndefined();
      expect(result.records.map((r) => [r.caseId, r.cacheLine])).toEqual(
        expect.arrayContaining([["a1", "A"], ["a2", "A"], ["a3", "A"], ["b1", "B"], ["free", undefined]])
      );
    });

    it("ends the run when a cap stops it while workers wait on a warm-up", async () => {
      // $0.035 fits three $0.01 reservations at once, so without warm-first all three would start
      const small = resolveCaps({ maxSpend: 0.035 }).caps;
      const jobs = [lineJob("a1", "A"), lineJob("a2", "A"), lineJob("a3", "A")];
      // Every attempt is a 503, billed at its estimate, so a1's fourth reservation passes the cap
      const { d, started, release } = controlled(() => executed("http-error", { status: 503 }));
      const run = runJobs(jobs, d, { caps: small, previous: [], maxInFlight: 3 });
      await settle();
      expect(started).toEqual(["a1"]);
      release("a1");
      const result = await run;
      expect(result.stoppedReason).toMatch(/max-spend/);
      expect(new Set(started)).toEqual(new Set(["a1"]));
    });
  });

  it("runs a pipeline chain's beat on the analysis output and sums the turn latency", async () => {
    const built: unknown[] = [];
    const chain: Job = {
      ...job("t", "thread", BASELINE),
      armKey: `pipeline:${BASELINE.key}>${BASELINE.key}`,
      group: "pipeline",
      then: {
        arm: BASELINE,
        players: 1,
        estimate: { inputTokens: 1, outputTokens: 1, costUsd: 0.01 },
        build: (analysis) => {
          built.push(analysis);
          return plannedCall("beat", BASELINE);
        },
      },
    };
    const { d, records } = deps(() => executed("valid"));
    await runJobs([chain], d, { caps, previous: [] });
    expect(built).toEqual([{ ok: true }]);
    expect(records.map((r) => [r.step, r.jobFinal, r.turnLatencyMs])).toEqual([
      [1, false, undefined],
      [2, true, 2_000],
    ]);
  });
});
