import { PRODUCTION_MAX_RETRIES } from "shared/llm/chatModel.js";
import { isRetryable, type CallRecord } from "./runner.js";

/*
 * The owner's validity gate (2026-09-26): at least 98% of an arm's calls
 * valid on the first model attempt, every call valid within production's 2
 * retries, and "no worse than the baseline" judged beyond noise: worse only
 * when a one-sided Fisher exact test on first-attempt failures gives
 * p < 0.05 (1 invalid in 100 against 0 in 115 gives p = 0.47, so a single
 * bad reply does not fail an arm by itself). Transport failures (429, 5xx,
 * timeouts, dropped connections) say nothing about the reply and are left out.
 */

export const FIRST_ATTEMPT_FLOOR = 0.98;
const WORSE_THAN_BASELINE_P = 0.05;

export type ValidityReading = {
  /** Calls with at least one model attempt */
  calls: number;
  firstAttemptValid: number;
  invalidFirstAttempts: number;
  /** Calls with a valid reply among their first 1 + PRODUCTION_MAX_RETRIES model attempts */
  validWithinRetries: number;
  /** Calls made only of transport failures, left out of the counts above */
  transportOnly: number;
};

export type ValidityVerdict = {
  firstAttemptOk: boolean;
  withinRetriesOk: boolean;
  /** One-sided Fisher exact p that the arm fails more often on the first attempt than the baseline */
  pWorse?: number;
  worseThanBaseline?: boolean;
  pass: boolean;
};

/**
 * Each call's model attempts in attempt order (one entry per job and step),
 * transport failures dropped; calls left with none are counted as transport-only.
 */
export function modelAttemptsByStep(records: CallRecord[]): { calls: CallRecord[][]; transportOnly: number } {
  const byStep = new Map<string, CallRecord[]>();
  for (const record of records) {
    const key = `${record.jobKey}|${record.step}`;
    byStep.set(key, [...(byStep.get(key) ?? []), record]);
  }
  const calls: CallRecord[][] = [];
  let transportOnly = 0;
  for (const attempts of byStep.values()) {
    const model = attempts.filter((r) => !isRetryable(r)).sort((a, b) => a.attempt - b.attempt);
    if (model.length === 0) transportOnly++;
    else calls.push(model);
  }
  return { calls, transportOnly };
}

/** "repaired" counts as invalid: production's parse fails on text after the JSON. */
export function validityReading(records: CallRecord[]): ValidityReading {
  const { calls, transportOnly } = modelAttemptsByStep(records);
  const firstAttemptValid = calls.filter((attempts) => attempts[0].outcome === "valid").length;
  const validWithinRetries = calls.filter((attempts) =>
    attempts.slice(0, 1 + PRODUCTION_MAX_RETRIES).some((r) => r.outcome === "valid")
  ).length;
  return {
    calls: calls.length,
    firstAttemptValid,
    invalidFirstAttempts: calls.length - firstAttemptValid,
    validWithinRetries,
    transportOnly,
  };
}

/** P(X >= failuresA) for X ~ Hypergeometric: the one-sided Fisher exact test that group A fails more often than group B. */
function fisherGreaterP(failuresA: number, callsA: number, failuresB: number, callsB: number): number {
  const total = callsA + callsB;
  const failures = failuresA + failuresB;
  const logFactorial = [0];
  for (let i = 1; i <= total; i++) logFactorial[i] = logFactorial[i - 1] + Math.log(i);
  const logChoose = (n: number, k: number) => logFactorial[n] - logFactorial[k] - logFactorial[n - k];
  let p = 0;
  for (let x = failuresA; x <= Math.min(failures, callsA); x++) {
    p += Math.exp(logChoose(failures, x) + logChoose(total - failures, callsA - x) - logChoose(total, callsA));
  }
  return Math.min(1, p);
}

/** Without a baseline reading the verdict rests on the floor and the retries alone. */
export function validityVerdict(arm: ValidityReading, baseline?: ValidityReading): ValidityVerdict {
  const firstAttemptOk = arm.calls > 0 && arm.firstAttemptValid / arm.calls >= FIRST_ATTEMPT_FLOOR;
  const withinRetriesOk = arm.calls > 0 && arm.validWithinRetries === arm.calls;
  if (!baseline) {
    return { firstAttemptOk, withinRetriesOk, pass: firstAttemptOk && withinRetriesOk };
  }
  const pWorse = fisherGreaterP(arm.invalidFirstAttempts, arm.calls, baseline.invalidFirstAttempts, baseline.calls);
  const worseThanBaseline = pWorse < WORSE_THAN_BASELINE_P;
  return {
    firstAttemptOk,
    withinRetriesOk,
    pWorse,
    worseThanBaseline,
    pass: firstAttemptOk && withinRetriesOk && !worseThanBaseline,
  };
}
