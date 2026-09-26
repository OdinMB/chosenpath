import type { Stage } from "./arms.js";

/*
 * The spend caps. Owner (2026-09-26): target about $25 for the whole
 * evaluation, a hard cap of $30 (below the owner's standing ceiling of $50),
 * extra spend only when obviously useful and recorded. Going a little over
 * $25 is justified because the owner explicitly prioritised Sol for story
 * setups, and setup inputs are 21-23K tokens with the schema, not the 15K
 * the plan assumed. The stage caps are $8 / $13 / $3 / $4; a stage cap above
 * its default needs a recorded reason, and the global cap can only be
 * lowered. The probe and case building count as Stage 0.
 */

export const DEFAULT_STAGE_CAPS: Record<Stage, number> = { "0": 8, "1-2": 13, "3": 3, "4": 4 };
export const HARD_CEILING = 30;
export const DEFAULT_GLOBAL_CAP = HARD_CEILING;

export type Caps = {
  stageCaps: Record<Stage, number>;
  globalCap: number;
  /** Per invocation (--max-spend) */
  maxSpend?: number;
};

export type BudgetOverride = {
  at: string;
  stage?: Stage;
  stageCap?: number;
  globalCap?: number;
  reason: string;
  /** A paid run's --arms: the arms the raise pays for */
  arms?: string[];
};

export type CapArgs = {
  stage?: Stage;
  stageCap?: number;
  globalCap?: number;
  maxSpend?: number;
  overTargetReason?: string;
  /** A paid run (--run), whose raised stage cap pays only for the arms it names */
  forRun?: boolean;
  /** The run's --arms */
  armKeys?: string[];
};

/**
 * Throws on a stage cap above its default without a reason, or a global cap
 * above the hard ceiling. A paid run that raises a stage cap must name its
 * arms (--arms), and the recorded override lists them: the raise is approved
 * for arms, and plan order cannot hold it to them (the runner goes setup
 * before beat, and warm-first can start a later arm early), so a run filtered
 * by role alone would spend it on whatever else the stage plans.
 */
export function resolveCaps(
  args: CapArgs,
  now: () => Date = () => new Date()
): { caps: Caps; override?: BudgetOverride } {
  const globalCap = args.globalCap ?? DEFAULT_GLOBAL_CAP;
  if (globalCap > HARD_CEILING) {
    throw new Error(`The global cap can never exceed $${HARD_CEILING}.`);
  }
  const stageCaps = { ...DEFAULT_STAGE_CAPS };
  if (args.stageCap !== undefined) {
    if (!args.stage) {
      throw new Error("--stage-cap needs --stage.");
    }
    stageCaps[args.stage] = args.stageCap;
  }
  const raisesStage =
    args.stage !== undefined && stageCaps[args.stage] > DEFAULT_STAGE_CAPS[args.stage];
  const raisesGlobal = globalCap > DEFAULT_GLOBAL_CAP;
  const reason = args.overTargetReason?.trim();
  if ((raisesStage || raisesGlobal) && !reason) {
    throw new Error(
      'A cap above the owner\'s target needs --over-target-reason "<why this spend is obviously useful>".'
    );
  }
  const arms = args.armKeys?.length ? args.armKeys : undefined;
  if (raisesStage && args.forRun && !arms) {
    throw new Error("A raised stage cap pays only for the arms it was approved for: name them with --arms.");
  }
  const caps: Caps = { stageCaps, globalCap, maxSpend: args.maxSpend };
  if (!reason || !(raisesStage || raisesGlobal)) {
    return { caps };
  }
  return {
    caps,
    override: {
      at: now().toISOString(),
      stage: raisesStage ? args.stage : undefined,
      stageCap: raisesStage && args.stage ? stageCaps[args.stage] : undefined,
      globalCap: raisesGlobal ? globalCap : undefined,
      reason,
      ...(args.forRun && arms ? { arms } : {}),
    },
  };
}

export type SpendRecord = { stage: Stage; costUsd: number };

export type Spend = { byStage: Record<Stage, number>; total: number };

export function spentByStage(records: SpendRecord[]): Spend {
  const byStage: Record<Stage, number> = { "0": 0, "1-2": 0, "3": 0, "4": 0 };
  for (const record of records) {
    byStage[record.stage] += record.costUsd;
  }
  return { byStage, total: Object.values(byStage).reduce((a, b) => a + b, 0) };
}

export type BudgetVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Whether a call estimated at `estimateUsd` may start. `spent` includes
 * reservations for calls in flight; `invocationSpent` is this run's share.
 */
export function budgetCheck(
  caps: Caps,
  spent: Spend,
  invocationSpent: number,
  stage: Stage,
  estimateUsd: number
): BudgetVerdict {
  const fmt = (usd: number) => `$${usd.toFixed(2)}`;
  if (spent.byStage[stage] + estimateUsd > caps.stageCaps[stage]) {
    return {
      ok: false,
      reason: `Stage ${stage} cap ${fmt(caps.stageCaps[stage])} reached (spent ${fmt(spent.byStage[stage])})`,
    };
  }
  if (spent.total + estimateUsd > caps.globalCap) {
    return {
      ok: false,
      reason: `Global cap ${fmt(caps.globalCap)} reached (spent ${fmt(spent.total)})`,
    };
  }
  if (caps.maxSpend !== undefined && invocationSpent + estimateUsd > caps.maxSpend) {
    return {
      ok: false,
      reason: `--max-spend ${fmt(caps.maxSpend)} reached (this run spent ${fmt(invocationSpent)})`,
    };
  }
  return { ok: true };
}
