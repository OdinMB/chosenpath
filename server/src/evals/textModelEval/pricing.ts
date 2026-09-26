import type { Arm, EvalRole } from "./arms.js";

/*
 * What a call costs: the per-model price table, the cost of measured usage,
 * and the pre-run estimate of a planned call. Prices are hard-coded here
 * (test plan §2.1); arms.ts never imports this module.
 */

export type Usage = {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  /** Includes reasoning tokens */
  outputTokens: number;
  reasoningTokens?: number;
};

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
