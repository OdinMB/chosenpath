import { PRODUCTION_MAX_RETRIES } from "shared/llm/chatModel.js";
import { stageRunsBaseline, type Arm, type EvalRole, type Stage } from "./arms.js";
import { budgetCheck, spentByStage, type Caps, type SpendRecord } from "./budget.js";
import { sha256, type CallSpec, type ExecutedCall } from "./executor.js";
import { costFromUsage, type Estimate } from "./pricing.js";
import { USABLE_OUTCOMES, type CallCheck, type Outcome } from "./responseCheck.js";
import type { EvalRequest } from "./variants.js";

/*
 * Schedules planned eval jobs and records every attempt: setup first, then
 * beats, analysis and pipeline chains, then iteration; within a role every
 * case's baseline first, candidates only where the baseline worked. Paced by
 * a rolling per-model token window, stopped by the spend caps, and
 * resumable from earlier records; a job whose final record is a request the
 * API rejected (a 400 naming a parameter) counts as not finished, so the next
 * invocation plans it again. Transport failures retry after a backoff; a
 * reply production could not parse is re-sent at once, up to production's
 * retries, as LangChain does in production. A turn job of a stage that
 * measures production's one checked retry (a text of one paragraph, a beat
 * without options: checkedBeatReply) sends that retry as its second step,
 * right after the first reply, where the check finds a problem.
 *
 * Warm-first: the first call of each cache line (a split request's arm,
 * schema and fixed rules) runs alone, and the rest of that line waits until
 * it has finished, so they read a warm cache. Other lines and jobs without a
 * line are never held.
 */

export type PlannedCall = {
  role: EvalRole;
  arm: Arm;
  players: number;
  estimate: Estimate;
  /** Built lazily, so a resumed job never builds its prompt */
  request: () => EvalRequest;
};

/** Why production's check asked a turn again: a text of one paragraph, a beat without options, or both (beatChecks.ts). */
export type RetryKind = "short" | "noOptions" | "both";

/**
 * Production's one checked retry of a turn (checkedBeatReply, beatChecks.ts;
 * the choice-line-sp stage, 2026-09-30): where the first reply as parsed has
 * a problem the check names, one more call, the first request told the
 * problem, as the job's second step. The check reads the first reply only:
 * production uses a second short reply as it is.
 */
export type CheckedRetry = {
  /** The problem production's check finds in the first reply (its text, which names player slots, never story text), or undefined */
  problemOf: (parsed: unknown) => { text: string; kind: RetryKind } | undefined;
  /** The retry call, told the problem */
  build: (problem: { text: string; kind: RetryKind }) => PlannedCall;
  /** One retry's estimate, for the dry run's ceiling (the runner reserves the built call's own) */
  estimate: Estimate;
};

export type Job = {
  stage: Stage;
  promptState: string;
  caseId: string;
  /** The arm the job measures: for a pipeline chain, "pipeline:<analysis>><beat>" */
  armKey: string;
  sample: number;
  baseline: boolean;
  /** Ordering group: the role, "pipeline" for chains, or "prep" for the rounds' own calls (prepCalls.ts, never in calls.jsonl) */
  group: EvalRole | "pipeline" | "prep";
  first: PlannedCall;
  /** Pipeline chains: the beat call, built from the analysis output */
  then?: { estimate: Estimate; arm: Arm; players: number; build: (analysis: unknown) => PlannedCall };
  /** Turns in a stage that measures production's one checked retry: that retry as the second step, where the check finds a problem */
  retry?: CheckedRetry;
  /** Split requests: the cached prefix this call shares with others (arm, schema and fixed rules) */
  cacheLine?: string;
};

export type CallRecord = {
  jobKey: string;
  stage: Stage;
  promptState: string;
  role: EvalRole;
  group: Job["group"];
  caseId: string;
  armKey: string;
  /** The arm of this call (differs from armKey on a chain's analysis step) */
  callArmKey: string;
  model: string;
  baseline: boolean;
  sample: number;
  players: number;
  chainId?: string;
  step: number;
  attempt: number;
  /** No further attempt will be made for this step */
  final: boolean;
  /** This record ends the job */
  jobFinal: boolean;
  startedAt: string;
  outcome: Outcome;
  latencyMs: number;
  processingMs?: number;
  /** Chains: analysis plus beat latency, on the beat record */
  turnLatencyMs?: number;
  status?: number;
  code?: string;
  param?: string;
  rejectedParam?: boolean;
  finishReason?: string;
  textAfterJson?: boolean;
  junkChars: number;
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  servedModel?: string;
  costUsd: number;
  costSource: "usage" | "estimate" | "none";
  estimateUsd: number;
  outputFile?: string;
  promptHash?: string;
  promptHashDrift?: boolean;
  errorMessage?: string;
  /** The job's cache line, on every record of the job */
  cacheLine?: string;
  /**
   * A turn production's check asked again (CheckedRetry): on the first reply's
   * final record, which then does not end the job, and on every record of the
   * retry, step 2
   */
  checkedRetry?: RetryKind;
};

export type RunnerDeps = {
  execute: (spec: CallSpec) => Promise<ExecutedCall>;
  record: (record: CallRecord) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  warn: (line: string) => void;
};

export type RunnerOptions = {
  caps: Caps;
  previous: CallRecord[];
  /** Spend recorded outside calls.jsonl (the probe), counted against the caps */
  extraSpend?: SpendRecord[];
  tokensPerMinute?: number;
  maxInFlight?: number;
  backoffsMs?: number[];
};

export type RunnerResult = { records: CallRecord[]; stoppedReason?: string };

export const DEFAULT_TOKENS_PER_MINUTE = 400_000;
const WINDOW_MS = 60_000;

export const GROUP_ORDER: Job["group"][] = ["setup", "beat", "switch", "thread", "pipeline", "iteration", "prep"];

export function jobKey(caseId: string, armKey: string, promptState: string, sample: number): string {
  return `${caseId}|${armKey}|${promptState}|s${sample}`;
}

export function keyOf(job: Job): string {
  return jobKey(job.caseId, job.armKey, job.promptState, job.sample);
}

/** A 429 that no wait fixes: the account has no credit or quota left (2026-09-29), as production's retry policy reads insufficient_quota */
const NEVER_RETRY_CODES = new Set(["credit_balance_exhausted", "insufficient_quota"]);

/**
 * Whether a record finishes its job: a final record, unless it is a request
 * the API rejected or a call refused because the account had no credit or
 * quota left (2026-09-29), which say nothing about the model and are planned
 * again. The one definition of "finished" for resuming, case building and the
 * variant pairing.
 */
export function finishesJob(record: Pick<CallRecord, "jobFinal" | "rejectedParam"> & { code?: string | null }): boolean {
  return record.jobFinal && !record.rejectedParam && !(record.code && NEVER_RETRY_CODES.has(record.code));
}

export function finishedJobKeys(records: CallRecord[]): Set<string> {
  return new Set(records.filter(finishesJob).map((r) => r.jobKey));
}

/**
 * Whether a record is a finished first reply for the readings: it finishes its
 * job, or it is a turn's first reply that production's one checked retry
 * follows (its job ends with the retry, step 2, which the checked-turn report
 * reads, checkedTurns.ts). A chain's planner step is no reply of a turn.
 */
export function finishesFirstReply(record: Pick<CallRecord, "jobFinal" | "rejectedParam" | "final" | "step" | "group" | "checkedRetry"> & { code?: string | null }): boolean {
  return finishesJob(record) || (record.final && record.step === 1 && record.group !== "pipeline" && record.checkedRetry !== undefined);
}

/** The record that finished the job (at most one: a finished job is never sent again), if any. */
export function finishingRecord(records: CallRecord[], key: string): CallRecord | undefined {
  return records.find((r) => r.jobKey === key && finishesJob(r));
}

/**
 * One record per job attempt (job, step and attempt), for the readings: where
 * an attempt has two records, the one written last. It happened once
 * (2026-09-29, before planJobs skipped a repeated job key): two plans of one
 * arm planned the same four jobs, both copies ran at once under the same
 * callId and wrote the same outputs/<callId>.json, so the file holds the reply
 * of the copy recorded last (checked on all four). Spend reads every record:
 * both copies were billed.
 */
export function oneRecordPerAttempt(records: CallRecord[]): CallRecord[] {
  const attemptOf = (r: CallRecord) => `${r.jobKey}|${r.step}|${r.attempt}`;
  const last = new Map<string, number>();
  records.forEach((r, i) => last.set(attemptOf(r), i));
  return records.filter((r, i) => last.get(attemptOf(r)) === i);
}

/** Whether a record's output can be used (valid or repaired) */
export function usable(record: { outcome: Outcome }): boolean {
  return USABLE_OUTCOMES.includes(record.outcome);
}

const RETRY_CODES = new Set(["slow_down", "server_is_overloaded", "rate_limit_exceeded"]);

/** 429, 5xx, timeouts and dropped connections; never a 4xx the request caused, nor a 429 for an account out of credit. Takes a check or a record. */
export function isRetryable(check: Pick<CallCheck, "outcome" | "status" | "code">): boolean {
  const { outcome, status, code } = check;
  if (outcome === "timeout" || outcome === "network-error") return true;
  if (outcome !== "http-error") return false;
  if (code && NEVER_RETRY_CODES.has(code)) return false;
  if (code && RETRY_CODES.has(code)) return true;
  return status === 429 || (status !== undefined && status >= 500);
}

/**
 * Replies production's LangChain parse rejects, and so re-sends within its
 * retries. "repaired" (text after the JSON) is usable here but fails there.
 */
export const PRODUCTION_RETRIED_OUTCOMES: Outcome[] = ["repaired", "invalid-json", "schema-mismatch", "length", "refusal"];

function attemptCost(
  call: PlannedCall,
  executed: ExecutedCall
): Pick<CallRecord, "costUsd" | "costSource"> {
  const { metrics, check } = executed;
  if (metrics.inputTokens > 0 || metrics.outputTokens > 0) {
    return { costUsd: costFromUsage(call.arm.model, metrics), costSource: "usage" };
  }
  // A rejected request (4xx) is not billed; a timeout or 5xx may have been
  if (check.status !== undefined && check.status >= 400 && check.status < 500) {
    return { costUsd: 0, costSource: "none" };
  }
  return { costUsd: call.estimate.costUsd, costSource: "estimate" };
}

/** One attempt as a calls.jsonl record: ids, outcome, timings, usage and cost; never text. */
function attemptRecord(input: {
  job: Job;
  call: PlannedCall;
  executed: ExecutedCall;
  step: number;
  attempt: number;
  final: boolean;
  isLastStep: boolean;
  startedAt: number;
  chainLatencyMs: number;
  drift: boolean;
  /** Production's checked retry: why the turn is asked again (on the first reply that triggers it, and on the retry's records) */
  checkedRetry?: RetryKind;
}): CallRecord {
  const { job, call, executed, step, final } = input;
  const { check, metrics } = executed;
  return {
    jobKey: keyOf(job),
    stage: job.stage,
    promptState: job.promptState,
    role: call.role,
    group: job.group,
    caseId: job.caseId,
    armKey: job.armKey,
    callArmKey: call.arm.key,
    model: call.arm.model,
    baseline: job.baseline,
    sample: job.sample,
    players: call.players,
    chainId: job.then ? keyOf(job) : undefined,
    step,
    attempt: input.attempt,
    final,
    // A chain ends early when its analysis step produced nothing usable
    jobFinal: final && (input.isLastStep || !usable(check)),
    startedAt: new Date(input.startedAt).toISOString(),
    outcome: check.outcome,
    latencyMs: executed.latencyMs,
    processingMs: executed.capture.processingMs,
    turnLatencyMs: job.then && step === 2 ? input.chainLatencyMs + executed.latencyMs : undefined,
    status: check.status,
    code: check.code,
    param: check.param,
    rejectedParam: check.rejectedParam || undefined,
    finishReason: check.finishReason,
    textAfterJson: check.trailingText?.trim() ? true : undefined,
    junkChars: check.junkChars,
    inputTokens: metrics.inputTokens,
    cachedTokens: metrics.cachedTokens,
    cacheWriteTokens: metrics.cacheWriteTokens,
    outputTokens: metrics.outputTokens,
    reasoningTokens: metrics.reasoningTokens,
    servedModel: metrics.model,
    ...attemptCost(call, executed),
    estimateUsd: call.estimate.costUsd,
    outputFile: executed.outputFile,
    promptHash: executed.promptHash,
    promptHashDrift: input.drift || undefined,
    errorMessage: check.errorMessage,
    cacheLine: job.cacheLine,
    ...(input.checkedRetry ? { checkedRetry: input.checkedRetry } : {}),
  };
}

function tokensOf(estimate: Estimate): number {
  return estimate.inputTokens + estimate.outputTokens;
}

export async function runJobs(
  jobs: Job[],
  deps: RunnerDeps,
  options: RunnerOptions
): Promise<RunnerResult> {
  const tpm = options.tokensPerMinute ?? DEFAULT_TOKENS_PER_MINUTE;
  const maxInFlight = options.maxInFlight ?? 6;
  const backoffs = options.backoffsMs ?? [30_000, 60_000, 120_000];

  const allRecords = [...options.previous];
  const records: CallRecord[] = [];
  const finished = finishedJobKeys(allRecords);
  const windows = new Map<string, { at: number; tokens: number }[]>();
  let reserved = 0;
  let invocationSpent = 0;
  let stoppedReason: string | undefined;

  const addRecord = (record: CallRecord) => {
    records.push(record);
    allRecords.push(record);
    deps.record(record);
  };

  const waitForTokens = async (model: string, tokens: number) => {
    const window = windows.get(model) ?? [];
    windows.set(model, window);
    for (;;) {
      const now = deps.now();
      while (window.length > 0 && window[0].at <= now - WINDOW_MS) window.shift();
      const used = window.reduce((sum, entry) => sum + entry.tokens, 0);
      if (window.length === 0 || used + tokens <= tpm) {
        window.push({ at: now, tokens });
        return;
      }
      await deps.sleep(window[0].at + WINDOW_MS - now);
    }
  };

  /** Reserves the estimate if every cap allows it; stops scheduling otherwise. */
  const reserve = (stage: Stage, estimateUsd: number): boolean => {
    if (stoppedReason) return false;
    const spent = spentByStage([...allRecords, ...(options.extraSpend ?? [])]);
    spent.byStage[stage] += reserved;
    spent.total += reserved;
    const verdict = budgetCheck(options.caps, spent, invocationSpent + reserved, stage, estimateUsd);
    if (!verdict.ok) {
      stoppedReason = verdict.reason;
      return false;
    }
    reserved += estimateUsd;
    return true;
  };

  const driftChecked = (job: Job, promptHash: string): boolean => {
    const prefix = `${job.caseId}|${job.armKey}|${job.promptState}|`;
    const drift = allRecords.some(
      (r) => r.step === 1 && r.promptHash && r.jobKey.startsWith(prefix) && r.promptHash !== promptHash
    );
    if (drift) {
      deps.warn(`Prompt changed for ${prefix} within prompt state ${job.promptState}: the code changed underneath`);
    }
    return drift;
  };

  /**
   * Runs one call with retries: transport failures after a backoff, on their
   * own budget; unparseable replies at once, at most PRODUCTION_MAX_RETRIES
   * times. Returns the final executed call, or undefined when stopped.
   *
   * Attempts are numbered after those already recorded for the job and step
   * (a re-planned rejected request, or a job resumed part-way), so each
   * attempt keeps its own callId and outputs/<callId>.json is never
   * overwritten. A job without records starts at attempt 1, as it always did.
   */
  const runStep = async (
    job: Job,
    call: PlannedCall,
    step: number,
    isLastStep: boolean,
    chainLatencyMs: number,
    /** The retry step's reason, on each of its records */
    retryOf?: RetryKind
  ): Promise<{ record: CallRecord; executed: ExecutedCall; problem?: { text: string; kind: RetryKind } } | undefined> => {
    const request = call.request();
    const key = keyOf(job);
    const recorded = allRecords.filter((r) => r.jobKey === key && r.step === step).map((r) => r.attempt);
    let transportRetries = 0;
    let validityRetries = 0;
    for (let attempt = 1 + Math.max(0, ...recorded); ; attempt++) {
      if (!reserve(job.stage, call.estimate.costUsd)) return undefined;
      let executed: ExecutedCall;
      const startedAt = deps.now();
      try {
        await waitForTokens(call.arm.model, tokensOf(call.estimate));
        executed = await deps.execute({
          callId: sha256(`${key}|${step}|${attempt}`).slice(0, 20),
          role: call.role,
          arm: call.arm,
          request,
        });
      } finally {
        reserved -= call.estimate.costUsd;
      }
      const transportRetry = isRetryable(executed.check) && transportRetries < backoffs.length;
      const resend =
        PRODUCTION_RETRIED_OUTCOMES.includes(executed.check.outcome) && validityRetries < PRODUCTION_MAX_RETRIES;
      const final = !transportRetry && !resend;
      // Production checks the first reply it could parse; a turn whose call failed outright is not checked
      const problem = final && step === 1 && job.retry && usable(executed.check) ? job.retry.problemOf(executed.check.parsed) : undefined;
      const record = attemptRecord({
        job,
        call,
        executed,
        step,
        attempt,
        final,
        isLastStep: isLastStep && !problem,
        startedAt,
        chainLatencyMs,
        drift: step === 1 && driftChecked(job, executed.promptHash),
        checkedRetry: problem?.kind ?? retryOf,
      });
      invocationSpent += record.costUsd;
      addRecord(record);
      if (final) return { record, executed, problem };
      if (transportRetry) {
        await deps.sleep(executed.capture.retryAfterMs ?? backoffs[transportRetries]);
        transportRetries++;
      } else {
        validityRetries++;
      }
    }
  };

  const runJob = async (job: Job) => {
    const first = await runStep(job, job.first, 1, !job.then, 0);
    if (first?.problem && job.retry) {
      // Production's one checked retry, right after the first reply, told its problem
      await runStep(job, job.retry.build(first.problem), 2, true, 0, first.problem.kind);
      return;
    }
    if (!first || !job.then || !usable(first.record)) return;
    await runStep(job, job.then.build(first.executed.check.parsed), 2, true, first.record.latencyMs);
  };

  /**
   * Warm-first: a worker takes the first queued job that has no cache line,
   * or whose line is already warm or not being warmed. A job that starts a
   * line warms it: the line is warm once that job finishes, whatever its
   * outcome. When every queued job is on a line being warmed, the worker
   * waits for a warm-up to finish, then checks for a stop again. A waiting
   * worker never deadlocks: each line being warmed has a job in flight.
   */
  const runPhase = async (phase: Job[]) => {
    const queue = phase.filter((job) => !finished.has(keyOf(job)));
    const warm = new Set<string>();
    const warming = new Set<string>();
    let waiting: (() => void)[] = [];
    const takeable = (job: Job) => !job.cacheLine || warm.has(job.cacheLine) || !warming.has(job.cacheLine);
    const worker = async () => {
      while (queue.length > 0 && !stoppedReason) {
        const index = queue.findIndex(takeable);
        if (index < 0) {
          await new Promise<void>((resolve) => waiting.push(resolve));
          continue;
        }
        const [job] = queue.splice(index, 1);
        const line = job.cacheLine !== undefined && !warm.has(job.cacheLine) ? job.cacheLine : undefined;
        if (line !== undefined) warming.add(line);
        try {
          await runJob(job);
        } finally {
          if (line !== undefined) {
            warming.delete(line);
            warm.add(line);
            const woken = waiting;
            waiting = [];
            for (const wake of woken) wake();
          }
        }
      }
    };
    await Promise.all(Array.from({ length: maxInFlight }, () => worker()));
  };

  const baselineWorked = (group: Job["group"], caseId: string) =>
    allRecords.some((r) => r.baseline && r.group === group && r.caseId === caseId && r.jobFinal && usable(r));
  // A stage that reads against stored references runs no baseline, so it gates nothing on one
  const mayRun = (job: Job) => !stageRunsBaseline(job.stage) || baselineWorked(job.group, job.caseId);

  for (const group of GROUP_ORDER) {
    const inGroup = jobs.filter((job) => job.group === group);
    await runPhase(inGroup.filter((job) => job.baseline));
    await runPhase(inGroup.filter((job) => !job.baseline && mayRun(job)));
    if (stoppedReason) break;
  }
  return { records, stoppedReason };
}
