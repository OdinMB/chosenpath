import { fisherGreaterP } from "./validityGate.js";

/*
 * The stop rule's "moved" reading (owner, 2026-09-27), for every round from
 * then on. A check (a pass rate, or a pooled share of counted items) counts
 * as moved only when its difference from the reference exceeds the
 * reference's two-sample difference AND a one-sided Fisher exact test on the
 * counts gives p < 0.10. A mean counts as moved only when its difference
 * exceeds the two-sample difference AND at least 2 standard errors of the
 * difference (Welch: each side's sample variance over its n). Before this, a
 * reading beyond the noise alone counted, so one setup in 36 against a noise
 * of zero moved a check.
 *
 * The noise is the reference's sample 1 against its sample 2 on the matched
 * cases (variantComparison.ts). A pooled share's items cluster within a
 * reply, so its Fisher p reads optimistic; read a share beside the checks
 * that count replies.
 */

export const MOVED_P = 0.1;
export const MOVED_STANDARD_ERRORS = 2;

export type Direction = "lower" | "higher";

/** Hits among n: a check's passes over the replies it applies to, or a pooled share's numerator over its denominator. */
export type Tally = { hits: number; n: number };

/** A count's replies, mean and sample variance (n − 1). */
export type Moments = { n: number; mean: number; variance: number };

/** beyondNoise: beyond the two-sample difference alone; moved: that, and p < MOVED_P. p is read only beyond the noise. */
export type RateMove = { beyondNoise?: Direction; p?: number; moved?: Direction };
/** beyondNoise: beyond the two-sample difference alone; moved: that, and at least MOVED_STANDARD_ERRORS. */
export type MeanMove = { beyondNoise?: Direction; standardErrors?: number; moved?: Direction };

const EPSILON = 1e-9;

function beyond(reference: number, arm: number, noise: number): Direction | undefined {
  if (arm < reference - noise - EPSILON) return "lower";
  if (arm > reference + noise + EPSILON) return "higher";
  return undefined;
}

export function momentsOf(values: number[]): Moments {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, variance: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n < 2 ? 0 : values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  return { n, mean, variance };
}

/** A rate against the reference's: beyond the noise, then the one-sided Fisher test in that direction. */
export function rateMove(reference: Tally, arm: Tally, noise: number): RateMove {
  if (reference.n === 0 || arm.n === 0) return {};
  const direction = beyond(reference.hits / reference.n, arm.hits / arm.n, noise);
  if (!direction) return {};
  // "Failures" are the outcome the direction counts: misses when the arm reads lower, hits when higher
  const p =
    direction === "lower"
      ? fisherGreaterP(arm.n - arm.hits, arm.n, reference.n - reference.hits, reference.n)
      : fisherGreaterP(arm.hits, arm.n, reference.hits, reference.n);
  return { beyondNoise: direction, p, ...(p < MOVED_P ? { moved: direction } : {}) };
}

/** A mean against the reference's: beyond the noise, then at least 2 standard errors of the difference. */
export function meanMove(reference: Moments, arm: Moments, noise: number): MeanMove {
  if (reference.n === 0 || arm.n === 0) return {};
  const direction = beyond(reference.mean, arm.mean, noise);
  if (!direction) return {};
  const standardError = Math.sqrt(reference.variance / reference.n + arm.variance / arm.n);
  // No spread on either side: every reply carries the same count, so the difference is certain
  const standardErrors = standardError === 0 ? Infinity : Math.abs(arm.mean - reference.mean) / standardError;
  return { beyondNoise: direction, standardErrors, ...(standardErrors >= MOVED_STANDARD_ERRORS ? { moved: direction } : {}) };
}
