import type { Arm, EvalRole } from "./arms.js";
import { textCostFromUsage as costFromUsage } from "../../spend/prices.js";

/*
 * What a call costs: the cost of measured usage and the pre-run estimate of a
 * planned call. The price table (test plan §2.1) is the app's own, in
 * spend/prices.ts, re-exported here under its old names; arms.ts never
 * imports this module.
 */

export type { TextUsage as Usage } from "../../spend/prices.js";
export { costFromUsage };

/** Today's Sol or GPT-6.1 Sol, which estimates read alike until measured (Artificial Analysis: the same pace at low). */
function isSol(model: string): boolean {
  return model.startsWith("gpt-6-sol") || model.startsWith("gpt-6.1-sol");
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
  const sol = isSol(arm.model);
  if (effort === "low") return sol ? 700 : 500;
  if (effort === "medium") return sol ? 2_400 : 6_200;
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
  if (isSol(model)) return 90;
  if (model.startsWith("gpt-4.1-mini")) return 130;
  return 140;
}
