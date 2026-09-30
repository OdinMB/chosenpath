import type { Arm, EvalRole, Stage } from "./arms.js";
import type { SpendRecord } from "./budget.js";
import { requestChars } from "./jobPlan.js";
import { costFromUsage } from "./pricing.js";
import { finishingRecord, usable, type CallRecord, type Job } from "./runner.js";
import type { EvalRequest } from "./variants.js";

/*
 * The rounds' own calls (the chapter backfill, chapterFrames.ts; the judged
 * checks, judgedChecks.ts; setup round 3's setup-to-play chain,
 * setupChain.ts; the whole-story playthroughs, playthroughs.ts): runner jobs in the group "prep", recorded in
 * prep-calls.jsonl beside calls.jsonl, so every report that reads calls.jsonl
 * keeps reading only the isolated and chained cases' calls. Their spend joins
 * the ledger under their stage (turn-rounds; setup-rounds for the chain)
 * wherever the caps are checked. A prep job's arm key is "<kind>><arm key>"
 * (backfill>gpt-6-luna@low/prod), so it never reads as an eval arm.
 */

export type PrepKind = "backfill" | "judge" | "chain" | "play";

export const prepArmKey = (kind: PrepKind, arm: Arm) => `${kind}>${arm.key}`;

/**
 * A prep call's estimate: the request's characters at 4 per token (the
 * schema included, as OpenAI bills it) and an output guess that includes
 * reasoning. The replies are short, so the runner's reservations stay small.
 */
export function prepEstimate(arm: Arm, request: EvalRequest, outputTokens: number) {
  const inputTokens = Math.ceil(requestChars(request) / 4);
  return { inputTokens, outputTokens, costUsd: costFromUsage(arm.model, { inputTokens, cachedTokens: 0, cacheWriteTokens: 0, outputTokens }) };
}

/** One prep call as a runner job; the request is built once, lazily. */
export function prepJob(input: {
  kind: PrepKind;
  stage: Stage;
  promptState: string;
  caseId: string;
  sample: number;
  arm: Arm;
  /** The production role whose factory settings tag the call (metadata and retry policy only) */
  role: EvalRole;
  players: number;
  build: () => EvalRequest;
  outputTokens: number;
}): Job {
  let built: EvalRequest | undefined;
  const request = () => (built ??= input.build());
  return {
    stage: input.stage,
    promptState: input.promptState,
    caseId: input.caseId,
    armKey: prepArmKey(input.kind, input.arm),
    sample: input.sample,
    baseline: false,
    group: "prep",
    first: {
      role: input.role,
      arm: input.arm,
      players: input.players,
      request,
      estimate: prepEstimate(input.arm, request(), input.outputTokens),
    },
  };
}

/** The ledger's share of the prep calls. */
export function prepSpend(records: CallRecord[]): SpendRecord[] {
  return records.map((r) => ({ stage: r.stage, costUsd: r.costUsd }));
}

/** The usable record that finished a prep job, if any. */
export function finishedPrepRecord(records: CallRecord[], jobKey: string): CallRecord | undefined {
  const record = finishingRecord(records, jobKey);
  return record && usable(record) ? record : undefined;
}
