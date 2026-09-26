import { z } from "zod";
import { makeArm, type Arm, type EvalRole, type Stage } from "../../../../src/evals/textModelEval/arms.js";
import type { CaseTags, EvalCase } from "../../../../src/evals/textModelEval/cases.js";
import type { ExecutedCall } from "../../../../src/evals/textModelEval/executor.js";
import type { Outcome } from "../../../../src/evals/textModelEval/responseCheck.js";
import type { CallRecord, Job, PlannedCall } from "../../../../src/evals/textModelEval/runner.js";

export const BASELINE = makeArm({ model: "gpt-4.1-mini", temperature: 0.2 }, "prod", true);
export const LUNA = makeArm({ model: "gpt-6-luna", reasoningEffort: "low" });
export const SOL = makeArm({ model: "gpt-6-sol", reasoningEffort: "low" });

export function tags(overrides: Partial<CaseTags> = {}): CaseTags {
  return {
    players: 1,
    gameMode: "single-player",
    images: true,
    multiplayer: false,
    kids: false,
    dark: false,
    subset15: false,
    hasStoredOutput: false,
    firstBeat: false,
    ending: false,
    analysisTurn: false,
    source: "stored",
    ...overrides,
  };
}

export function evalCase(id: string, role: EvalRole, overrides: Partial<EvalCase> = {}): EvalCase {
  return { id, role, tags: tags(), ...overrides };
}

export function plannedCall(role: EvalRole, arm: Arm, costUsd = 0.01, prompt = "prompt"): PlannedCall {
  return {
    role,
    arm,
    players: 1,
    estimate: { inputTokens: 100, outputTokens: 100, costUsd },
    request: () => ({ prompt, schema: z.object({ ok: z.boolean() }) }),
  };
}

export function job(caseId: string, role: EvalRole, arm: Arm, overrides: Partial<Job> = {}): Job {
  return {
    stage: "0",
    promptState: "prefix",
    caseId,
    armKey: arm.key,
    sample: 1,
    baseline: arm.baseline,
    group: role,
    first: plannedCall(role, arm),
    ...overrides,
  };
}

export function executed(outcome: Outcome, overrides: Partial<ExecutedCall["check"]> = {}, promptHash = "hash"): ExecutedCall {
  const ok = outcome === "valid" || outcome === "repaired";
  return {
    capture: { status: overrides.status ?? (ok ? 200 : undefined) },
    latencyMs: 1_000,
    check: { outcome, rejectedParam: false, junkChars: 0, parsed: ok ? { ok: true } : undefined, ...overrides },
    metrics: {
      inputTokens: ok ? 100 : 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: ok ? 100 : 0,
      reasoningTokens: 0,
      refusal: false,
    },
    promptHash,
    outputFile: "outputs/x.json",
  };
}

export function record(overrides: Partial<CallRecord> = {}): CallRecord {
  const stage: Stage = overrides.stage ?? "0";
  return {
    jobKey: "c|arm|prefix|s1",
    stage,
    promptState: "prefix",
    role: "beat",
    group: "beat",
    caseId: "c",
    armKey: BASELINE.key,
    callArmKey: BASELINE.key,
    model: BASELINE.model,
    baseline: true,
    sample: 1,
    players: 1,
    step: 1,
    attempt: 1,
    final: true,
    jobFinal: true,
    startedAt: "2026-09-26T00:00:00.000Z",
    outcome: "valid",
    latencyMs: 10_000,
    junkChars: 0,
    inputTokens: 1_000,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 500,
    reasoningTokens: 0,
    costUsd: 0.01,
    costSource: "usage",
    estimateUsd: 0.01,
    outputFile: "outputs/x.json",
    ...overrides,
  };
}
