import {
  resolveTextModelConfig,
  settingsFor,
  type Env,
  type ReasoningEffort,
  type TextModelSettings,
  type TextRole,
} from "shared/llm/textModelSettings.js";
import type { VariantId } from "./variants.js";

/*
 * The arm matrix per stage and role, the price table, and the cost and
 * estimate functions. Arms and prices are hard-coded here; the baseline
 * follows production config (resolveTextModelConfig), so "as in production"
 * is literal.
 */

export type EvalRole = "setup" | "beat" | "switch" | "thread" | "iteration";
export const EVAL_ROLES: EvalRole[] = ["setup", "beat", "switch", "thread", "iteration"];

export type Stage = "0" | "1-2" | "3" | "4";
export const STAGES: Stage[] = ["0", "1-2", "3", "4"];

export type Arm = TextModelSettings & {
  key: string;
  variant: VariantId;
  baseline: boolean;
};

/** Which cases an arm runs on, and how many samples per case. */
export type ArmPlan = {
  arm: Arm;
  samples: number;
  /** subset15 narrows beats only; single-player leaves out multiplayer cases of any role */
  scope: "all" | "subset15" | "single-player";
  /** Only these cases (still intersected with --cases) */
  caseIds?: string[];
  /** Rare-failure batch: this many extra single-sample calls spread over the cases */
  extraCalls?: number;
};

export type Usage = {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  /** Includes reasoning tokens */
  outputTokens: number;
  reasoningTokens?: number;
};

const PRODUCTION_ROLE: Record<EvalRole, TextRole> = {
  setup: "setup",
  beat: "beat",
  switch: "switchAnalysis",
  thread: "threadAnalysis",
  iteration: "templateIteration",
};

export function productionRole(role: EvalRole): TextRole {
  return PRODUCTION_ROLE[role];
}

/** `<model>@<effort | t<temperature>>[+v<verbosity>]/<variant>` */
export function armKey(settings: TextModelSettings, variant: VariantId): string {
  const setting = settings.reasoningEffort ?? `t${settings.temperature ?? "default"}`;
  const verbosity = settings.verbosity ? `+v${settings.verbosity}` : "";
  return `${settings.model}@${setting}${verbosity}/${variant}`;
}

/**
 * The full form of a trimmed arm: the same model and setting with the
 * "prod" variant. Undefined for a prod key and for anything that is not
 * an arm key (a pipeline chain's key, for one).
 */
export function prodSiblingKey(key: string): string | undefined {
  const match = /^([^@/>]+@[^@/>]+)\/(\w+)$/.exec(key);
  if (!match || match[2] === "prod") return undefined;
  return `${match[1]}/prod`;
}

/** A pipeline chain's key: "pipeline:<analysis arm key>><beat arm key>". */
export function chainKey(analysisKey: string, beatKey: string): string {
  return `pipeline:${analysisKey}>${beatKey}`;
}

/** The two arm keys of a chain key; undefined for anything else. */
export function chainSides(key: string): { analysis: string; beat: string } | undefined {
  const match = /^pipeline:([^>]+)>([^>]+)$/.exec(key);
  return match ? { analysis: match[1], beat: match[2] } : undefined;
}

export function makeArm(
  settings: TextModelSettings,
  variant: VariantId = "prod",
  baseline = false
): Arm {
  return { ...settings, key: armKey(settings, variant), variant, baseline };
}

export function armSettings(arm: Arm): TextModelSettings {
  const { model, temperature, reasoningEffort, verbosity } = arm;
  return { model, temperature, reasoningEffort, verbosity };
}

/** Today's production settings for this role. */
export function baselineArm(role: EvalRole, multiplayer: boolean, env: Env = process.env): Arm {
  const config = resolveTextModelConfig(env, () => undefined);
  return makeArm(settingsFor(config, productionRole(role), { multiplayer }), "prod", true);
}

const luna = (effort: ReasoningEffort, variant: VariantId = "prod") =>
  makeArm({ model: "gpt-6-luna", reasoningEffort: effort }, variant);
const sol = (effort: ReasoningEffort, variant: VariantId = "prod") =>
  makeArm({ model: "gpt-6-sol", reasoningEffort: effort }, variant);

export const RARE_FAILURE_CALLS_PER_ARM = 50;

/**
 * Stage 3's Sol setup premises: 3 per player count, every multiplayer game
 * mode, a Kids premise and three dark ones (frozen setup case ids).
 */
export const STAGE3_SETUP_PREMISES = [
  "setup-pretend-er-doctor",
  "setup-custom-neo-tokyo",
  "setup-learn-lemonade",
  "setup-fiction-bounty-hunters",
  "setup-kids-animal-rescue",
  "setup-flexible-soul-flat",
  "setup-vent-berlin-flat",
  "setup-flexible-secret-society",
  "setup-pretend-cofounders",
];

/**
 * Candidate arms (the baseline runs separately, first), one static matrix per
 * stage. Stage 1-2 follows the owner decisions of 2026-09-26, Stage 3 the
 * coordinator's carry-forward (Milestone 3). Stage 4 has no arms yet.
 */
export function armsFor(stage: Stage, role: EvalRole): ArmPlan[] {
  switch (stage) {
    case "1-2":
      return stage12Arms(role);
    case "3":
      return stage3Arms(role);
    default:
      return [];
  }
}

function stage12Arms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "setup":
      return [
        { arm: sol("low"), samples: 2, scope: "all" },
        { arm: sol("medium"), samples: 1, scope: "all" },
        { arm: sol("none"), samples: 1, scope: "all" },
        { arm: luna("none"), samples: 2, scope: "all" },
        { arm: luna("low"), samples: 2, scope: "all" },
        { arm: luna("medium"), samples: 2, scope: "all" },
      ];
    case "beat":
      return [
        { arm: luna("medium"), samples: 2, scope: "all", extraCalls: RARE_FAILURE_CALLS_PER_ARM },
        { arm: luna("none"), samples: 2, scope: "all", extraCalls: RARE_FAILURE_CALLS_PER_ARM },
        { arm: luna("low"), samples: 2, scope: "all", extraCalls: RARE_FAILURE_CALLS_PER_ARM },
        { arm: luna("high"), samples: 2, scope: "subset15" },
        { arm: sol("low"), samples: 1, scope: "subset15" },
      ];
    case "switch":
    case "thread":
      // Analysis follows the Luna beat arms; no Sol analysis (owner, 2026-09-26)
      return [
        { arm: luna("none"), samples: 2, scope: "all" },
        { arm: luna("low"), samples: 2, scope: "all" },
        { arm: luna("medium"), samples: 2, scope: "all" },
      ];
    case "iteration":
      return [];
  }
}

/**
 * Stage 3: the trimmed variants (slim, minimal) of the carry-forward arms.
 * Their full forms are the Stage 1-2 prod arms. In this order, so a cap stop
 * cuts the Luna none control first.
 */
function stage3Arms(role: EvalRole): ArmPlan[] {
  switch (role) {
    case "setup":
      return [
        { arm: sol("low", "minimal"), samples: 1, scope: "all", caseIds: STAGE3_SETUP_PREMISES },
        { arm: luna("low", "minimal"), samples: 2, scope: "all" },
      ];
    case "beat":
      return [
        { arm: luna("medium", "minimal"), samples: 2, scope: "single-player" },
        { arm: luna("medium", "slim"), samples: 2, scope: "single-player" },
        { arm: luna("low", "minimal"), samples: 2, scope: "single-player" },
        { arm: luna("low", "slim"), samples: 2, scope: "single-player" },
        { arm: luna("none", "minimal"), samples: 2, scope: "single-player" },
      ];
    case "switch":
    case "thread":
      return [{ arm: luna("low", "minimal"), samples: 2, scope: "all" }];
    case "iteration":
      return [];
  }
}

/** Pipeline chains: this analysis arm, then each beat arm built from its output. */
export type PipelinePlan = { analysis: Arm; beats: Arm[]; samples: number; scope: ArmPlan["scope"] };

/** The stage's candidate chains (the baseline chain runs in every stage). */
export function pipelinePlan(stage: Stage): PipelinePlan | undefined {
  switch (stage) {
    case "1-2":
      // Luna low analysis, as in the lead configurations
      return { analysis: luna("low"), beats: [luna("none"), luna("low"), luna("medium")], samples: 2, scope: "all" };
    case "3":
      return {
        analysis: luna("low", "minimal"),
        beats: [luna("medium", "minimal"), luna("low", "minimal")],
        samples: 1,
        scope: "single-player",
      };
    default:
      return undefined;
  }
}

type Price = { input: number; cached: number; cacheWrite: number; output: number };

/** US$ per 1M tokens (test plan §2.1). Longest matching prefix wins. */
const PRICES: [string, Price][] = [
  ["gpt-4.1-mini", { input: 0.4, cached: 0.1, cacheWrite: 0, output: 1.6 }],
  ["gpt-4.1", { input: 2.0, cached: 0.5, cacheWrite: 0, output: 8.0 }],
  ["gpt-6-sol", { input: 2.0, cached: 0.2, cacheWrite: 2.5, output: 10.0 }],
  ["gpt-6-luna", { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5 }],
];

function priceFor(model: string): Price {
  const match = PRICES.filter(([prefix]) => model.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length
  )[0];
  if (!match) {
    throw new Error(`No price for model ${model}`);
  }
  return match[1];
}

/** (I − C − W)·p_in + C·p_cached + W·p_write + O·p_out; O already includes reasoning. */
export function costFromUsage(model: string, usage: Usage): number {
  const price = priceFor(model);
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens - usage.cacheWriteTokens);
  return (
    (uncached * price.input +
      usage.cachedTokens * price.cached +
      usage.cacheWriteTokens * price.cacheWrite +
      usage.outputTokens * price.output) /
    1_000_000
  );
}

/** Visible output tokens per call (test plan §2.2). */
function visibleOutputTokens(role: EvalRole, players: number): number {
  switch (role) {
    case "beat":
      return 2_100 * players;
    case "setup":
      return 5_000 + 1_000 * players;
    case "switch":
      return 500;
    case "thread":
      return 850;
    case "iteration":
      return 3_000;
  }
}

/** Reasoning tokens per call (test plan §2.2; Luna high is a guess). */
function reasoningTokens(arm: Arm): number {
  const effort = arm.reasoningEffort;
  if (!effort || effort === "none") {
    return 0;
  }
  const isSol = arm.model.startsWith("gpt-6-sol");
  if (effort === "low") return isSol ? 700 : 500;
  if (effort === "medium") return isSol ? 2_400 : 6_200;
  return 12_000;
}

export const MIN_MEASURED_RECORDS = 3;

export type Estimate = { inputTokens: number; outputTokens: number; costUsd: number };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Input from the prompt and schema length (4 characters per token;
 * `promptChars` must include the schema, see `requestChars`). Output and reasoning
 * from the §2.2 table until MIN_MEASURED_RECORDS measured outputs exist for
 * this role, model and effort; from then on, their median.
 */
export function estimateCall(input: {
  role: EvalRole;
  arm: Arm;
  promptChars: number;
  players: number;
  measuredOutputTokens?: number[];
}): Estimate {
  const inputTokens = Math.ceil(input.promptChars / 4);
  const measured = input.measuredOutputTokens ?? [];
  const outputTokens =
    measured.length >= MIN_MEASURED_RECORDS
      ? median(measured)
      : visibleOutputTokens(input.role, input.players) + reasoningTokens(input.arm);
  const costUsd = costFromUsage(input.arm.model, {
    inputTokens,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens,
  });
  return { inputTokens, outputTokens, costUsd };
}

/** Rough output speed (tokens/s) for duration estimates (test plan §2.6). */
export function outputTokensPerSecond(model: string): number {
  if (model.startsWith("gpt-6-luna")) return 130;
  if (model.startsWith("gpt-6-sol")) return 90;
  if (model.startsWith("gpt-4.1-mini")) return 130;
  return 140;
}
