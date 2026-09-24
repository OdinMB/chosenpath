import { APIConnectionError } from "openai";
import {
  analyzeImageGenerationError,
  type ImageApiUsage,
} from "../../images/openaiImageClient.js";
import type { Arm } from "./arms.js";
import { costFromUsage } from "./arms.js";
import type { EvalCase } from "./cases.js";

/*
 * Executes planned image calls safely and records every attempt: paced to the
 * Tier-1 image limit, retried only when a retry can help, stopped by a hard
 * spend guard, and resumable from earlier records.
 */

export type PlannedCall = {
  itemId: string;
  evalCase: EvalCase;
  arm: Arm;
  estimateUsd: number;
};

export type CallStatus = "success" | "error" | "junk";

export type CallRecord = {
  itemId: string;
  caseId: string;
  armKey: string;
  model: string;
  quality: string;
  size: string;
  startedAt: string;
  latencyMs: number;
  status: CallStatus;
  attempt: number;
  /** No further attempt will be made for this case and arm */
  final: boolean;
  errorCode?: string;
  errorType?: string;
  apiCode?: string;
  httpStatus?: number;
  errorMessage?: string;
  usage?: ImageApiUsage;
  costUsd: number;
  costSource: "usage" | "estimate" | "none";
  outputFile?: string;
  junkReason?: string;
};

export type RunnerDeps = {
  /** Sends the request; throws the raw SDK error on failure */
  execute: (call: PlannedCall) => Promise<{ buffer: Buffer; usage?: ImageApiUsage }>;
  /** Vets and stores the returned image */
  store: (
    call: PlannedCall,
    buffer: Buffer
  ) => Promise<{ outputFile?: string; junkReason?: string }>;
  /** Persists one attempt record (called right after each attempt) */
  record: (record: CallRecord) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type RunnerOptions = {
  maxSpendUsd: number;
  /** Spend already incurred (earlier runs, earlier phases) */
  spentUsd: number;
  /** Records from earlier runs, for resume */
  previous: CallRecord[];
  outputExists: (outputFile: string) => boolean;
  maxStartsPerWindow?: number;
  windowMs?: number;
  /**
   * Start times shared across runCalls invocations, so back-to-back phases
   * stay within the per-minute limit together. Mutated in place.
   */
  startLog?: number[];
  maxInFlight?: number;
  retryBackoffsMs?: number[];
};

export type RunnerResult = {
  records: CallRecord[];
  spentUsd: number;
  stoppedBySpendGuard: boolean;
};

export type ClassifiedError = {
  /** The app's error category (RATE_LIMIT, CONTENT_POLICY, ...) */
  errorCode: string;
  /** The API's own error type, code and offending parameter, when present */
  errorType?: string;
  apiCode?: string;
  param?: string;
  httpStatus?: number;
  message: string;
};

export function callKey(caseId: string, armKey: string): string {
  return `${caseId}|${armKey}`;
}

/** The latest final record for a case and arm (a re-generated image supersedes). */
export function latestFinalRecord(
  records: CallRecord[],
  caseId: string,
  armKey: string
): CallRecord | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.final && r.caseId === caseId && r.armKey === armKey) {
      return r;
    }
  }
  return undefined;
}

function readField(error: unknown, field: string): unknown {
  return error && typeof error === "object" && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

function readString(error: unknown, field: string): string | undefined {
  const value = readField(error, field);
  return typeof value === "string" ? value : undefined;
}

export function classifyError(error: unknown): ClassifiedError {
  const status = readField(error, "status");
  const message = error instanceof Error ? error.message : String(error);
  // Timeouts and dropped connections carry no status; they are transient
  const errorCode =
    error instanceof APIConnectionError
      ? "TECHNICAL"
      : analyzeImageGenerationError(error).errorCode;
  return {
    errorCode,
    errorType: readString(error, "type"),
    apiCode: readString(error, "code"),
    param: readString(error, "param"),
    httpStatus: typeof status === "number" ? status : undefined,
    message,
  };
}

/**
 * Only rate limits and transient technical failures (including timeouts)
 * are worth sending again unchanged.
 */
export function shouldRetry(error: Pick<ClassifiedError, "errorCode" | "errorType">): boolean {
  if (error.errorType === "image_generation_user_error") {
    return false;
  }
  return error.errorCode === "RATE_LIMIT" || error.errorCode === "TECHNICAL";
}

/** Keys of case/arm pairs that need no further call. */
export function finishedCallKeys(
  records: CallRecord[],
  outputExists: (outputFile: string) => boolean
): Set<string> {
  const keys = new Set<string>();
  for (const r of records) {
    const done =
      r.final &&
      (r.status !== "success" || (r.outputFile !== undefined && outputExists(r.outputFile)));
    if (done) {
      keys.add(callKey(r.caseId, r.armKey));
    }
  }
  return keys;
}

function failedAttemptCost(
  call: PlannedCall,
  error: ClassifiedError
): Pick<CallRecord, "costUsd" | "costSource"> {
  // A rejected request (4xx) is not billed. A timeout or 5xx may have been,
  // so count the estimate (conservative).
  if (error.httpStatus !== undefined && error.httpStatus >= 400 && error.httpStatus < 500) {
    return { costUsd: 0, costSource: "none" };
  }
  return { costUsd: call.estimateUsd, costSource: "estimate" };
}

export async function runCalls(
  calls: PlannedCall[],
  deps: RunnerDeps,
  options: RunnerOptions
): Promise<RunnerResult> {
  const maxStarts = options.maxStartsPerWindow ?? 5;
  const windowMs = options.windowMs ?? 60_000;
  const maxInFlight = options.maxInFlight ?? 3;
  const backoffs = options.retryBackoffsMs ?? [30_000, 60_000];

  const finished = finishedCallKeys(options.previous, options.outputExists);
  const queue = calls.filter(
    (c) => !finished.has(callKey(c.evalCase.id, c.arm.key))
  );
  const records: CallRecord[] = [];
  const starts = options.startLog ?? [];
  let spent = options.spentUsd;
  let reserved = 0;
  let stopped = false;

  const addRecord = (record: CallRecord) => {
    records.push(record);
    deps.record(record);
  };

  const waitForStartSlot = async () => {
    for (;;) {
      const now = deps.now();
      while (starts.length > 0 && starts[0] <= now - windowMs) {
        starts.shift();
      }
      if (starts.length < maxStarts) {
        starts.push(now);
        return;
      }
      await deps.sleep(starts[0] + windowMs - now);
    }
  };

  const attempt = async (call: PlannedCall, attemptNo: number): Promise<boolean> => {
    const base = {
      itemId: call.itemId,
      caseId: call.evalCase.id,
      armKey: call.arm.key,
      model: call.arm.model,
      quality: call.arm.quality,
      size: call.arm.size,
      attempt: attemptNo,
    };
    const startedAt = deps.now();
    let result: { buffer: Buffer; usage?: ImageApiUsage };
    try {
      result = await deps.execute(call);
    } catch (error) {
      const classified = classifyError(error);
      const retry = shouldRetry(classified) && attemptNo <= backoffs.length;
      const cost = failedAttemptCost(call, classified);
      spent += cost.costUsd;
      addRecord({
        ...base,
        startedAt: new Date(startedAt).toISOString(),
        latencyMs: deps.now() - startedAt,
        status: "error",
        final: !retry,
        errorCode: classified.errorCode,
        errorType: classified.errorType,
        apiCode: classified.apiCode,
        httpStatus: classified.httpStatus,
        errorMessage: classified.message,
        ...cost,
      });
      return retry;
    }

    const latencyMs = deps.now() - startedAt;
    const cost = result.usage
      ? { costUsd: costFromUsage(call.arm.model, result.usage), costSource: "usage" as const }
      : { costUsd: call.estimateUsd, costSource: "estimate" as const };
    spent += cost.costUsd;
    const stored = await deps.store(call, result.buffer).catch((error: unknown) => ({
      outputFile: undefined,
      junkReason: `could not vet or store the image: ${error instanceof Error ? error.message : String(error)}`,
    }));
    addRecord({
      ...base,
      startedAt: new Date(startedAt).toISOString(),
      latencyMs,
      status: stored.junkReason ? "junk" : "success",
      final: true,
      usage: result.usage,
      ...cost,
      outputFile: stored.outputFile,
      junkReason: stored.junkReason,
    });
    return false;
  };

  const runOne = async (call: PlannedCall) => {
    for (let attemptNo = 1; ; attemptNo++) {
      // A retry is a new start: none after the guard has stopped the run
      if (stopped) {
        return;
      }
      if (spent + reserved + call.estimateUsd > options.maxSpendUsd) {
        stopped = true;
        return;
      }
      reserved += call.estimateUsd;
      let retry: boolean;
      try {
        await waitForStartSlot();
        retry = await attempt(call, attemptNo);
      } finally {
        reserved -= call.estimateUsd;
      }
      if (!retry) {
        return;
      }
      await deps.sleep(backoffs[attemptNo - 1]);
    }
  };

  const worker = async () => {
    while (!stopped) {
      const call = queue.shift();
      if (!call) {
        return;
      }
      await runOne(call);
    }
  };

  await Promise.all(Array.from({ length: maxInFlight }, () => worker()));

  return { records, spentUsd: spent, stoppedBySpendGuard: stopped };
}
