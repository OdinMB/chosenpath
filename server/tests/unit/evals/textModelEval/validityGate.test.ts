import {
  modelAttemptsByStep,
  validityReading,
  validityVerdict,
  type ValidityReading,
} from "../../../../src/evals/textModelEval/validityGate.js";
import type { Outcome } from "../../../../src/evals/textModelEval/responseCheck.js";
import { record } from "./fixtures.js";

/** One call's attempts, in order; a status marks a transport failure. */
function call(id: string, attempts: (Outcome | 429)[]) {
  return attempts.map((attempt, i) =>
    record({
      jobKey: `${id}|arm|postfix|s1`,
      caseId: id,
      attempt: i + 1,
      final: i === attempts.length - 1,
      outcome: attempt === 429 ? "http-error" : attempt,
      status: attempt === 429 ? 429 : 200,
    })
  );
}

function reading(calls: number, invalidFirstAttempts: number, overrides: Partial<ValidityReading> = {}): ValidityReading {
  return {
    calls,
    firstAttemptValid: calls - invalidFirstAttempts,
    invalidFirstAttempts,
    validWithinRetries: calls,
    transportOnly: 0,
    ...overrides,
  };
}

describe("validityReading", () => {
  it("leaves transport failures out of the first attempt", () => {
    const result = validityReading([...call("a", [429, "valid"]), ...call("b", [429, 429])]);
    expect(result).toEqual({ calls: 1, firstAttemptValid: 1, invalidFirstAttempts: 0, validWithinRetries: 1, transportOnly: 1 });
    expect(modelAttemptsByStep(call("a", [429, "valid"])).calls[0].map((r) => r.attempt)).toEqual([2]);
  });

  it("counts a repaired first attempt as invalid, and valid only within production's retries", () => {
    const result = validityReading([
      ...call("third", ["repaired", "invalid-json", "valid"]),
      ...call("fourth", ["invalid-json", "invalid-json", "length", "valid"]),
    ]);
    expect(result).toMatchObject({ calls: 2, firstAttemptValid: 0, invalidFirstAttempts: 2, validWithinRetries: 1 });
  });
});

describe("validityVerdict", () => {
  it("does not call one invalid reply in 100 worse than a clean baseline", () => {
    const v = validityVerdict(reading(100, 1), reading(115, 0));
    expect(v.pWorse).toBeCloseTo(0.465, 3);
    expect(v).toMatchObject({ worseThanBaseline: false, pass: true });
  });

  it("calls six invalid replies in 100 worse than a clean baseline", () => {
    const v = validityVerdict(reading(100, 6), reading(115, 0));
    expect(v.pWorse).toBeCloseTo(0.0093, 4);
    expect(v.worseThanBaseline).toBe(true);
  });

  it("fails below the 98% floor, on a call never valid within the retries, and when worse than the baseline", () => {
    expect(validityVerdict(reading(100, 3))).toMatchObject({ firstAttemptOk: false, pass: false });
    expect(validityVerdict(reading(100, 2))).toMatchObject({ firstAttemptOk: true, pass: true });
    expect(validityVerdict(reading(100, 0, { validWithinRetries: 99 }))).toMatchObject({ withinRetriesOk: false, pass: false });
    // 98% clears the floor, but 20 in 1000 against 2 in 1000 is beyond noise
    const worse = validityVerdict(reading(1000, 20), reading(1000, 2));
    expect(worse).toMatchObject({ firstAttemptOk: true, withinRetriesOk: true, worseThanBaseline: true, pass: false });
  });
});
