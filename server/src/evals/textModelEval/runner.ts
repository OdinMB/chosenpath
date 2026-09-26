import { PRODUCTION_MAX_RETRIES } from "shared/llm/chatModel.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { costFromUsage, type Arm, type EvalRole, type Estimate, type Stage } from "./arms.js";
import { budgetCheck, spentByStage, type Caps, type SpendRecord } from "./budget.js";
import { sha256, type CallSpec, type ExecutedCall } from "./executor.js";
import { USABLE_OUTCOMES, type CallCheck, type Outcome } from "./responseCheck.js";

/*
 * Schedules planned eval jobs and records every attempt: setup first, then
 * beats, analysis and pipeline chains, then iteration; within a role every
 * case's baseline first, candidates only where the baseline worked. Paced by
 * a rolling per-model token window, stopped by the spend caps, and
 * resumable from earlier records. Transport failures retry after a backoff;
 * a reply production could not parse is re-sent at once, up to
 * production's retries, as LangChain does in production.
 */

export type PlannedCall = {
  role: EvalRole;
  arm: Arm;
  players: number;
  estimate: Estimate;
  /** Built lazily, so a resumed job never builds its prompt */
  request: () => TextRequest;
};

export type Job = {
  stage: Stage;
  promptState: string;
  caseId: string;
  /** The arm the job measures: for a pipeline chain, "pipeline:<analysis>><beat>" */
  armKey: string;
  sample: number;
  baseline: boolean;
  /** Ordering group: the role, or "pipeline" for chains */
  group: EvalRole | "pipeline";
  first: PlannedCall;
  /** Pipeline chains: the beat call, built from the analysis output */
  then?: { estimate: Estimate; arm: Arm; players: number; build: (analysis: unknown) => PlannedCall };
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

export const GROUP_ORDER: Job["group"][] = ["setup", "beat", "switch", "thread", "pipeline", "iteration"];

export function jobKey(caseId: string, armKey: string, promptState: string, sample: number): string {
  return `${caseId}|${armKey}|${promptState}|s${sample}`;
}

export function keyOf(job: Job): string {
  return jobKey(job.caseId, job.armKey, job.promptState, job.sample);
}

export function finishedJobKeys(records: CallRecord[]): Set<string> {
  return new Set(records.filter((r) => r.jobFinal).map((r) => r.jobKey));
}

/** Whether a record's output can be used (valid or repaired) */
export function usable(record: { outcome: Outcome }): boolean {
  return USABLE_OUTCOMES.includes(record.outcome);
}

const RETRY_CODES = new Set(["slow_down", "server_is_overloaded", "rate_limit_exceeded"]);

/** 429, 5xx, timeouts and dropped connections; never a 4xx the request caused. Takes a check or a record. */
export function isRetryable(check: Pick<CallCheck, "outcome" | "status" | "code">): boolean {
  const { outcome, status, code } = check;
  if (outcome === "timeout" || outcome === "network-error") return true;
  if (outcome !== "http-error") return false;
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
   */
  const runStep = async (
    job: Job,
    call: PlannedCall,
    step: number,
    isLastStep: boolean,
    chainLatencyMs: number
  ): Promise<{ record: CallRecord; executed: ExecutedCall } | undefined> => {
    const request = call.request();
    let transportRetries = 0;
    let validityRetries = 0;
    for (let attempt = 1; ; attempt++) {
      if (!reserve(job.stage, call.estimate.costUsd)) return undefined;
      let executed: ExecutedCall;
      const startedAt = deps.now();
      try {
        await waitForTokens(call.arm.model, tokensOf(call.estimate));
        executed = await deps.execute({
          callId: sha256(`${keyOf(job)}|${step}|${attempt}`).slice(0, 20),
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
      const record = attemptRecord({
        job,
        call,
        executed,
        step,
        attempt,
        final,
        isLastStep,
        startedAt,
        chainLatencyMs,
        drift: step === 1 && driftChecked(job, executed.promptHash),
      });
      invocationSpent += record.costUsd;
      addRecord(record);
      if (final) return { record, executed };
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
    if (!first || !job.then || !usable(first.record)) return;
    await runStep(job, job.then.build(first.executed.check.parsed), 2, true, first.record.latencyMs);
  };

  const runPhase = async (phase: Job[]) => {
    const queue = phase.filter((job) => !finished.has(keyOf(job)));
    const worker = async () => {
      for (let job = queue.shift(); job && !stoppedReason; job = queue.shift()) {
        await runJob(job);
      }
    };
    await Promise.all(Array.from({ length: maxInFlight }, () => worker()));
  };

  const baselineWorked = (group: Job["group"], caseId: string) =>
    allRecords.some((r) => r.baseline && r.group === group && r.caseId === caseId && r.jobFinal && usable(r));

  for (const group of GROUP_ORDER) {
    const inGroup = jobs.filter((job) => job.group === group);
    await runPhase(inGroup.filter((job) => job.baseline));
    await runPhase(inGroup.filter((job) => !job.baseline && baselineWorked(group, job.caseId)));
    if (stoppedReason) break;
  }
  return { records, stoppedReason };
}
