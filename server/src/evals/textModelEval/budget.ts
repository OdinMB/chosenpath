import { FEEDBACK_STAGES, STAGES, type Stage } from "./arms.js";

export { FEEDBACK_STAGES };

/*
 * The spend caps. Owner (2026-09-26): target about $25 for the whole
 * evaluation, a hard cap of $30 (below the owner's standing ceiling of $50),
 * extra spend only when obviously useful and recorded. Going a little over
 * $25 is justified because the owner explicitly prioritised Sol for story
 * setups, and setup inputs are 21-23K tokens with the schema, not the 15K
 * the plan assumed. The owner raised the hard cap to $33 on 2026-09-27, for
 * the setup and turn rounds after the Round 0 play fixes, and to $40 on
 * 2026-09-28, for the missing steps after the owner's feedback of that day
 * (going on although the stalled Stage 4 calls may have been billed). The
 * stage caps are $8 / $13 / $3 / $4 for Stages 0 to 4, $3 / $2 / $1.20 for
 * the setup rounds, the turn rounds and the migration check, and $0.10 /
 * $0.60 / $0.10 / $0.40 / $0.40 / $0.60 for the feedback workflow's runs
 * (STAGE_CAP_REASONS says why); a stage cap above its default needs a
 * recorded reason, and the global cap can only be lowered. The probe and case
 * building count as Stage 0. The content-filter check (--filter-check,
 * filterCheck.ts) is its own ledger stage, "filter", capped at $0.30: its
 * calls cost fractions of a cent, and it has no --run stage.
 */

/** A stage of the spend ledger: the --run stages plus the filter check. */
export type LedgerStage = Stage | "filter";
export const LEDGER_STAGES: LedgerStage[] = [...STAGES, "filter"];

export const DEFAULT_STAGE_CAPS: Record<LedgerStage, number> = {
  "0": 8,
  "1-2": 13,
  "3": 3,
  "4": 4,
  "setup-rounds": 3,
  "turn-rounds": 2,
  migration: 1.2,
  filter: 0.3,
  "plan-refresh": 0.1,
  reruns: 0.6,
  "setup-retests": 0.1,
  groups: 0.4,
  "form-gate": 0.4,
  "final-check": 0.6,
};
/** The owner's hard cap: $30, raised to $33 on 2026-09-27 and to $40 on 2026-09-28. */
export const HARD_CEILING = 40;
export const DEFAULT_GLOBAL_CAP = HARD_CEILING;

/** The ledger total when the round stages opened (2026-09-27): $26.39 of the then $33 hard cap, $6.61 left. */
export const LEDGER_WHEN_ROUNDS_OPENED = 26.39;

/** The ledger total when the feedback workflow's stages opened (2026-09-28): $31.99 of the $40 hard cap. */
export const LEDGER_WHEN_FEEDBACK_OPENED = 31.99;

/**
 * What the ledger may not record: Stage 4's 43 hung GPT-6 calls are booked at
 * their estimate, and if OpenAI billed them as 300 s replies the real total is
 * about $1.3 higher (open since 2026-09-26; the owner went on regardless on
 * 2026-09-28). The feedback stages' caps fit the $40 with it on top.
 */
export const UNRECORDED_STAGE4_USD = 1.3;

/** Why each stage's cap is what it is (printed by the dry run beside the spend). */
export const STAGE_CAP_REASONS: Record<LedgerStage, string> = {
  "0": "probe, case building and both baselines (owner, 2026-09-26)",
  "1-2": "the model and effort matrix of Round 1 (owner, 2026-09-26)",
  "3": "the Stage 3 trims; closed with $2.26 spent",
  "4": "the Stage 4 rewrite; closed, its 4b count fix ran on the owner's one-off $6 raise",
  "setup-rounds":
    "coordinator, 2026-09-27: setup rounds 1 to 3 on Luna low, with Sol low in round 1 (about $0.95 for nine premises) and a two-sample Luna noise run per round (about $0.11); the setup doc's three rounds came to $2.63",
  "turn-rounds":
    "coordinator, 2026-09-27: turn rounds 1 and 2 on Luna medium turns and Luna low planners, with the judged checks and their calibration (turn doc: about $0.90), plus retries and cold caches",
  migration:
    "production's GPT-6 defaults on today's prompts at two samples, and the single-player chains: dry run $0.75, plus AI Iteration (--role iteration, about $0.02) and setup estimates that read about 30% low",
  filter: "the content filter's fixed test set; its calls cost fractions of a cent",
  "plan-refresh":
    "coordinator, 2026-09-28 (the owner's feedback, $40 hard cap): planner v2c's chapter plans on the planning cases, which the reruns' chapter turns are written from; about $0.0013 a plan, 38 plans a sample",
  reruns:
    "coordinator, 2026-09-28: turn round 1's page rebuilt with new outputs (the framed chapter turn on planner v2c's plans and today's form beside it, chapter steps and chain openings) and their judged checks; round 1's two turn forms and chains came to about $0.80 at two samples",
  "setup-retests":
    "coordinator, 2026-09-28: the setup retests (the Casablanca clause, about $0.011, and any setup sentence the feedback adds), a few Luna low setups at about $0.006 each",
  groups: "coordinator, 2026-09-28: the group turn round (B10), about $0.18 at one sample (turn round 3's estimate), with room for today's group form beside it",
  "form-gate":
    "coordinator, 2026-09-28: the request form's gate (B9: chapter-step p95 at or under 45 s), about $0.20 (turn round 3's estimate) plus today's form rerun beside it for the waits",
  "final-check":
    "coordinator, 2026-09-28: the paid final check on production's own code (the adopted variant, under a new prompt state): one sample of the 44 stored single-player turns and both planners, about $0.22, plus group turns and chains",
};

export type Caps = {
  stageCaps: Record<LedgerStage, number>;
  globalCap: number;
  /** Per invocation (--max-spend) */
  maxSpend?: number;
};

export type BudgetOverride = {
  at: string;
  stage?: LedgerStage;
  stageCap?: number;
  globalCap?: number;
  reason: string;
  /** A paid run's --arms: the arms the raise pays for */
  arms?: string[];
};

export type CapArgs = {
  stage?: LedgerStage;
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

export type SpendRecord = { stage: LedgerStage; costUsd: number };

export type Spend = { byStage: Record<LedgerStage, number>; total: number };

export function spentByStage(records: SpendRecord[]): Spend {
  const byStage = Object.fromEntries(LEDGER_STAGES.map((stage) => [stage, 0])) as Record<LedgerStage, number>;
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
  stage: LedgerStage,
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
