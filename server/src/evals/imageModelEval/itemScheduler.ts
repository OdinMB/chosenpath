import type { Arm } from "./arms.js";
import type { EvalCase } from "./cases.js";
import type { CallRecord, PlannedCall } from "./runner.js";
import { latestFinalRecord } from "./runner.js";

/*
 * Decides which case fills each rating item and in which order calls run:
 * every item's baseline first, a reserve case for any item whose baseline
 * failed, and the candidate arms only for items with a working baseline.
 * That way no money goes into candidates that could never be rated.
 */

export type RatingItemPlan = {
  itemId: string;
  /** The first arm is the baseline */
  arms: Arm[];
  evalCase: EvalCase;
};

export type RatingSetPlan = {
  setId: string;
  items: RatingItemPlan[];
  /** Cases that replace an item whose baseline failed, in order */
  reserves: EvalCase[];
};

/** Runs one batch of calls; returns every record known so far (earlier runs included). */
export type PhaseRunner = (
  calls: PlannedCall[]
) => Promise<{ records: CallRecord[]; stoppedBySpendGuard: boolean }>;

export type EstimateFn = (evalCase: EvalCase, arm: Arm) => number;

type BaselineState = "pending" | "ok" | "failed";

function baselineState(
  item: RatingItemPlan,
  records: CallRecord[],
  outputExists: (outputFile: string) => boolean
): BaselineState {
  const final = latestFinalRecord(records, item.evalCase.id, item.arms[0].key);
  if (!final) {
    return "pending";
  }
  if (final.status !== "success") {
    return "failed";
  }
  // A success whose image has gone missing is generated again
  return final.outputFile !== undefined && outputExists(final.outputFile)
    ? "ok"
    : "pending";
}

function planCall(item: RatingItemPlan, arm: Arm, estimate: EstimateFn): PlannedCall {
  return {
    itemId: item.itemId,
    evalCase: item.evalCase,
    arm,
    estimateUsd: estimate(item.evalCase, arm),
  };
}

/**
 * Runs the rating items and returns the final plan: each item holds the case
 * that actually filled it. `partial` is true when the spend guard stopped a phase.
 */
export async function runRatingItems(
  sets: RatingSetPlan[],
  initialRecords: CallRecord[],
  deps: {
    runPhase: PhaseRunner;
    estimate: EstimateFn;
    outputExists: (outputFile: string) => boolean;
  }
): Promise<{ sets: RatingSetPlan[]; records: CallRecord[]; partial: boolean }> {
  const { runPhase, estimate, outputExists } = deps;
  const plans = sets.map((set) => ({
    ...set,
    items: set.items.map((item) => ({ ...item })),
    reserves: [...set.reserves],
  }));
  let records = initialRecords;
  const allItems = () => plans.flatMap((set) => set.items);
  const stateOf = (item: RatingItemPlan) =>
    baselineState(item, records, outputExists);

  for (;;) {
    const baselineCalls = allItems()
      .filter((item) => stateOf(item) === "pending")
      .map((item) => planCall(item, item.arms[0], estimate));
    if (baselineCalls.length > 0) {
      const result = await runPhase(baselineCalls);
      records = result.records;
      if (result.stoppedBySpendGuard) {
        return { sets: plans, records, partial: true };
      }
    }

    let replaced = false;
    for (const set of plans) {
      for (const item of set.items) {
        const reserve =
          stateOf(item) === "failed" ? set.reserves.shift() : undefined;
        if (reserve) {
          item.evalCase = reserve;
          replaced = true;
        }
      }
    }
    if (!replaced) {
      break;
    }
  }

  const candidateCalls = allItems()
    .filter((item) => stateOf(item) === "ok")
    .flatMap((item) => item.arms.slice(1).map((arm) => planCall(item, arm, estimate)));
  const result = await runPhase(candidateCalls);
  return { sets: plans, records: result.records, partial: result.stoppedBySpendGuard };
}
