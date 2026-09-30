import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { checkedBeatReply, missingOptionsProblem, shortTextProblem } from "../../game/services/beatChecks.js";
import { stageChecksTurns } from "./arms.js";
import { isRetryable, PRODUCTION_RETRIED_OUTCOMES, usable, type CallRecord, type RetryKind } from "./runner.js";

/*
 * Production's one checked retry of a turn, read as the turn the player gets
 * (the choice-line-sp stage, 2026-09-30): the runner sends the retry as a turn
 * job's second step where production's check found the first reply short or
 * without options (runner.ts, CheckedRetry), and this file reads each such job
 * whole. The reply the game keeps is decided by production's own
 * checkedBeatReply (beatChecks.ts), run on the two stored replies: the retry's
 * unless it has no options, when the first is kept if it had them; the first
 * when the retry's call failed and the first had options; otherwise the turn
 * fails. The wait is what the player waits for: each step's answer plus every
 * attempt sent again at once before it (production's parse re-sends), both
 * steps; a transport failure retried after a backoff is not part of it, as in
 * the turn waits (turnWaits.ts), and a hang is counted apart. The cost is every
 * attempt of both steps. Readings only.
 */

export type CheckedTurn = {
  jobKey: string;
  promptState: string;
  armKey: string;
  caseId: string;
  sample: number;
  players: number;
  /** The first reply's final record (the last run's, should a resumed job have sent step 1 again) */
  first: CallRecord;
  /** The retry's final record, where production's check asked again */
  retry?: CallRecord;
  /** Why the check asked again */
  retried?: RetryKind;
  /** The reply the game keeps: the first (1) or the retry (2); undefined when the turn fails */
  kept?: 1 | 2;
  /** Production's check on the first reply: one short paragraph, no options */
  firstShort: boolean;
  firstWithoutOptions: boolean;
  /** Whether the reply kept is one short paragraph */
  keptShort?: boolean;
  /** The first reply's wait and the whole turn's, in ms */
  firstWaitMs: number;
  waitMs: number;
  firstCostUsd: number;
  costUsd: number;
  /** Attempts that hung until the eval's timeout, both steps (in no wait) */
  hangs: number;
};

/** A step's last run: its attempts after the step's previous final record, up to its last final one. */
function lastRun(attempts: CallRecord[]): CallRecord[] {
  const sorted = [...attempts].sort((a, b) => a.attempt - b.attempt);
  const finals = sorted.map((r, i) => (r.final ? i : -1)).filter((i) => i >= 0);
  if (finals.length === 0) return [];
  const end = finals[finals.length - 1];
  const start = finals.length > 1 ? finals[finals.length - 2] + 1 : 0;
  return sorted.slice(start, end + 1);
}

/** A run's wait: its answer plus each attempt sent again at once before it (a backoff's transport failure is not). */
function runWaitMs(run: CallRecord[]): number {
  return run.filter((r) => r.final || (!isRetryable(r) && PRODUCTION_RETRIED_OUTCOMES.includes(r.outcome))).reduce((sum, r) => sum + r.latencyMs, 0);
}

const costOf = (run: CallRecord[]) => run.reduce((sum, r) => sum + r.costUsd, 0);

/** Which reply production's checkedBeatReply keeps of these two (the second undefined: the retry's call failed); undefined: the turn fails. */
async function keptReply(first: SetOfBeatGenerationSchema, second: SetOfBeatGenerationSchema | undefined, ending: boolean): Promise<1 | 2 | undefined> {
  let calls = 0;
  try {
    const kept = await checkedBeatReply(
      "",
      async () => {
        calls++;
        if (calls === 1) return first;
        if (second === undefined) throw new Error("the retry's call failed");
        return second;
      },
      () => undefined,
      { ending }
    );
    return kept === first ? 1 : 2;
  } catch {
    return undefined;
  }
}

/**
 * Every finished turn job of a stage that measures production's checked retry
 * (stageChecksTurns), read whole; a job whose retry is due but unrecorded (an
 * interrupted run) is not finished. `endingOf` says whether a case's turn is an
 * ending, where the check asks for no options.
 */
export async function checkedTurns(records: CallRecord[], load: (record: CallRecord) => unknown, endingOf: (caseId: string) => boolean): Promise<CheckedTurn[]> {
  const byJob = new Map<string, CallRecord[]>();
  for (const r of records) {
    if (r.group !== "beat" || r.role !== "beat" || !stageChecksTurns(r.stage)) continue;
    byJob.set(r.jobKey, [...(byJob.get(r.jobKey) ?? []), r]);
  }
  const turns: CheckedTurn[] = [];
  for (const [jobKey, jobRecords] of byJob) {
    const firstRun = lastRun(jobRecords.filter((r) => r.step === 1));
    const first = firstRun[firstRun.length - 1];
    if (!first) continue;
    const retried = usable(first) ? first.checkedRetry : undefined;
    const retryRun = retried ? lastRun(jobRecords.filter((r) => r.step === 2)) : [];
    const retry = retryRun[retryRun.length - 1];
    if (retried && !retry) continue;
    const firstReply = usable(first) ? (load(first) as SetOfBeatGenerationSchema | undefined) : undefined;
    const retryReply = retry && usable(retry) ? (load(retry) as SetOfBeatGenerationSchema | undefined) : undefined;
    const ending = endingOf(first.caseId);
    const kept = firstReply === undefined ? undefined : retried ? await keptReply(firstReply, retryReply, ending) : 1;
    const keptReplyText = kept === 1 ? firstReply : kept === 2 ? retryReply : undefined;
    const hangs = [...firstRun, ...retryRun].filter((r) => r.outcome === "timeout").length;
    turns.push({
      jobKey,
      promptState: first.promptState,
      armKey: first.armKey,
      caseId: first.caseId,
      sample: first.sample,
      players: first.players,
      first,
      ...(retry ? { retry } : {}),
      ...(retried ? { retried } : {}),
      ...(kept ? { kept } : {}),
      firstShort: firstReply !== undefined && shortTextProblem(firstReply) !== undefined,
      firstWithoutOptions: firstReply !== undefined && missingOptionsProblem(firstReply, { ending }) !== undefined,
      ...(keptReplyText ? { keptShort: shortTextProblem(keptReplyText) !== undefined } : {}),
      firstWaitMs: runWaitMs(firstRun),
      waitMs: runWaitMs(firstRun) + runWaitMs(retryRun),
      firstCostUsd: costOf(firstRun),
      costUsd: costOf(firstRun) + costOf(retryRun),
      hangs,
    });
  }
  return turns.sort((a, b) => a.armKey.localeCompare(b.armKey) || a.sample - b.sample || a.caseId.localeCompare(b.caseId));
}

/**
 * A turn as one call for the readings (variantComparison.ts, turnWaits.ts):
 * the first reply with its own wait and cost, or the reply the game keeps with
 * the whole turn's; a record that finishes its job at step 1. Undefined for the
 * reply kept of a turn that fails.
 */
export function asCall(turn: CheckedTurn, which: "first" | "kept"): CallRecord | undefined {
  if (which === "first") return { ...turn.first, final: true, jobFinal: true, latencyMs: turn.firstWaitMs, costUsd: turn.firstCostUsd };
  const record = turn.kept === 2 ? turn.retry : turn.kept === 1 ? turn.first : undefined;
  if (!record) return undefined;
  return { ...record, step: 1, attempt: 1, final: true, jobFinal: true, latencyMs: turn.waitMs, costUsd: turn.costUsd };
}
