import { jest } from "@jest/globals";
import { runCalls, shouldRetry } from "../../../../src/evals/imageModelEval/runner.js";
import type {
  CallRecord,
  PlannedCall,
  RunnerDeps,
} from "../../../../src/evals/imageModelEval/runner.js";
import type { EvalCase } from "../../../../src/evals/imageModelEval/cases.js";
import type { Arm } from "../../../../src/evals/imageModelEval/arms.js";
import type { ImageApiUsage } from "../../../../src/images/openaiImageClient.js";

const arm: Arm = {
  key: "gpt-image-2.5-flare@medium",
  model: "gpt-image-2.5-flare",
  quality: "medium",
  size: "1024x1024",
  baseline: false,
};

function evalCase(id: string): EvalCase {
  return {
    id,
    callSite: "beat",
    prompt: "prompt",
    references: [],
    description: "scene",
    styleNotes: "- none given",
  };
}

function call(id: string, estimateUsd = 0.01): PlannedCall {
  return { itemId: `item-${id}`, evalCase: evalCase(id), arm, estimateUsd };
}

function apiError(status: number, message: string, type?: string): Error {
  return Object.assign(new Error(message), { status, ...(type ? { type } : {}) });
}

type ExecuteFn = RunnerDeps["execute"];

function setup(execute: ExecuteFn) {
  let clock = 0;
  const records: CallRecord[] = [];
  const executeMock = jest.fn<ExecuteFn>(execute);
  const deps: RunnerDeps = {
    execute: executeMock,
    store: async (c) => ({ outputFile: `images/${c.evalCase.id}.jpeg` }),
    record: (r) => {
      records.push(r);
    },
    now: () => clock,
    // Let other workers' pending steps run first, as they would in real time
    sleep: async (ms) => {
      await new Promise((resolve) => setImmediate(resolve));
      clock += ms;
    },
  };
  return { deps, records, executeMock };
}

const success: ExecuteFn = async () => ({ buffer: Buffer.from("img") });

const baseOptions = {
  maxSpendUsd: 10,
  spentUsd: 0,
  previous: [] as CallRecord[],
  outputExists: () => true,
};

describe("runCalls", () => {
  it("stops before an attempt that would exceed the spend cap", async () => {
    const { deps, executeMock } = setup(success);

    const result = await runCalls(
      [call("a", 0.4), call("b", 0.4), call("c", 0.4)],
      deps,
      { ...baseOptions, maxSpendUsd: 1, maxInFlight: 1 }
    );

    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(result.stoppedBySpendGuard).toBe(true);
    expect(result.spentUsd).toBeCloseTo(0.8);
  });

  it("counts spend already incurred against the cap", async () => {
    const { deps, executeMock } = setup(success);

    const result = await runCalls([call("a", 0.4)], deps, {
      ...baseOptions,
      maxSpendUsd: 1,
      spentUsd: 0.7,
    });

    expect(executeMock).not.toHaveBeenCalled();
    expect(result.stoppedBySpendGuard).toBe(true);
  });

  it("bills from reported usage when present", async () => {
    const usage: ImageApiUsage = {
      inputTextTokens: 100,
      inputImageTokens: 0,
      outputTokens: 439,
    };
    const { deps, records } = setup(async () => ({ buffer: Buffer.from("img"), usage }));

    await runCalls([call("a", 0.5)], deps, baseOptions);

    expect(records[0].costSource).toBe("usage");
    expect(records[0].costUsd).toBeCloseTo((100 * 5 + 439 * 30) / 1_000_000);
  });

  it("retries a 429 at most twice", async () => {
    const { deps, records, executeMock } = setup(async () => {
      throw apiError(429, "429 Rate limit reached");
    });

    await runCalls([call("a")], deps, baseOptions);

    expect(executeMock).toHaveBeenCalledTimes(3);
    expect(records.map((r) => r.final)).toEqual([false, false, true]);
    expect(records.every((r) => r.errorCode === "RATE_LIMIT")).toBe(true);
  });

  it("never retries image_generation_user_error or a content policy block", async () => {
    const userError = setup(async () => {
      throw apiError(400, "400 Request rejected", "image_generation_user_error");
    });
    const policy = setup(async () => {
      throw apiError(400, "400 Your request was rejected by the safety system");
    });

    await runCalls([call("a")], userError.deps, baseOptions);
    await runCalls([call("b")], policy.deps, baseOptions);

    expect(userError.executeMock).toHaveBeenCalledTimes(1);
    expect(userError.records[0].final).toBe(true);
    expect(policy.executeMock).toHaveBeenCalledTimes(1);
    expect(policy.records[0].errorCode).toBe("CONTENT_POLICY");
  });

  it("does not bill a rejected (4xx) request", async () => {
    const { deps, records } = setup(async () => {
      throw apiError(400, "400 Invalid value for size");
    });

    const result = await runCalls([call("a", 0.5)], deps, baseOptions);

    expect(records[0].costUsd).toBe(0);
    expect(result.spentUsd).toBe(0);
  });

  it("skips pairs that already have a final record, unless the image is gone", async () => {
    const { deps, executeMock } = setup(success);
    const finished = (id: string, status: CallRecord["status"]): CallRecord => ({
      itemId: `item-${id}`,
      caseId: id,
      armKey: arm.key,
      model: arm.model,
      quality: arm.quality,
      size: arm.size,
      startedAt: "",
      latencyMs: 1,
      status,
      attempt: 1,
      final: true,
      costUsd: 0,
      costSource: "none",
      outputFile: status === "success" ? `images/${id}.jpeg` : undefined,
    });

    await runCalls([call("done"), call("refused"), call("lost"), call("new")], deps, {
      ...baseOptions,
      previous: [
        finished("done", "success"),
        finished("refused", "error"),
        finished("lost", "success"),
      ],
      outputExists: (file) => !file.includes("lost"),
      maxInFlight: 1,
    });

    expect(executeMock.mock.calls.map(([c]) => c.evalCase.id)).toEqual(["lost", "new"]);
  });

  it("starts at most 5 requests per rolling minute", async () => {
    const { deps } = setup(success);
    const startTimes: number[] = [];
    const execute = deps.execute;
    deps.execute = async (c) => {
      startTimes.push(deps.now());
      return execute(c);
    };

    await runCalls(
      Array.from({ length: 11 }, (_, i) => call(`c${i}`)),
      deps,
      baseOptions
    );

    for (const start of startTimes) {
      const inWindow = startTimes.filter((t) => t >= start && t < start + 60_000);
      expect(inWindow.length).toBeLessThanOrEqual(5);
    }
    expect(startTimes).toHaveLength(11);
  });
});

describe("shouldRetry", () => {
  it("retries only rate limits and technical failures", () => {
    expect(shouldRetry({ errorCode: "RATE_LIMIT" })).toBe(true);
    expect(shouldRetry({ errorCode: "TECHNICAL" })).toBe(true);
    expect(shouldRetry({ errorCode: "UNKNOWN" })).toBe(false);
    expect(shouldRetry({ errorCode: "COPYRIGHT" })).toBe(false);
  });
});
