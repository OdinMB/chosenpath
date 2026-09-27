import { describe, expect, it } from "@jest/globals";
import { meanMove, momentsOf, rateMove, MOVED_P, MOVED_STANDARD_ERRORS } from "../../../../src/evals/textModelEval/stopRule.js";

describe("the stop rule's thresholds (owner, 2026-09-27)", () => {
  it("reads a rate at p < 0.10 and a mean at 2 standard errors", () => {
    expect(MOVED_P).toBe(0.1);
    expect(MOVED_STANDARD_ERRORS).toBe(2);
  });
});

describe("rateMove: beyond the reference's two-sample difference AND a one-sided Fisher exact p < 0.10", () => {
  it("does not move on two setups in 36 against a clean reference, although that is beyond a zero noise", () => {
    // Setup round 1's 3-4 player stats: 36 -> 34 of 36 (±0). P = (36·35)/(72·71)
    const move = rateMove({ hits: 36, n: 36 }, { hits: 34, n: 36 }, 0);
    expect(move.beyondNoise).toBe("lower");
    expect(move.p).toBeCloseTo(1260 / 5112, 6);
    expect(move.moved).toBeUndefined();
  });

  it("moves on five setups in 36 against a clean reference, in either direction", () => {
    // P = (36·35·34·33·32)/(72·71·70·69·68)
    const p = (36 * 35 * 34 * 33 * 32) / (72 * 71 * 70 * 69 * 68);
    expect(rateMove({ hits: 36, n: 36 }, { hits: 31, n: 36 }, 0)).toEqual({ beyondNoise: "lower", p: expect.closeTo(p, 8), moved: "lower" });
    expect(rateMove({ hits: 31, n: 36 }, { hits: 36, n: 36 }, 0)).toEqual({ beyondNoise: "higher", p: expect.closeTo(p, 8), moved: "higher" });
  });

  it("does not move within the noise, however small p would be", () => {
    expect(rateMove({ hits: 20, n: 100 }, { hits: 40, n: 100 }, 0.3)).toEqual({});
    expect(rateMove({ hits: 20, n: 100 }, { hits: 20, n: 100 }, 0)).toEqual({});
  });

  it("reads nothing without replies on either side", () => {
    expect(rateMove({ hits: 0, n: 0 }, { hits: 3, n: 4 }, 0)).toEqual({});
    expect(rateMove({ hits: 3, n: 4 }, { hits: 0, n: 0 }, 0)).toEqual({});
  });
});

describe("meanMove: beyond the two-sample difference AND at least 2 standard errors", () => {
  const spread = (mean: number, n = 36) => ({ n, mean, variance: 0.25 });

  it("moves when the difference is beyond the noise and 2 standard errors of the difference", () => {
    // SE = sqrt(0.25/36 + 0.25/36)
    const move = meanMove(spread(1), spread(1.5), 0.2);
    expect(move).toEqual({ beyondNoise: "higher", standardErrors: expect.closeTo(0.5 / Math.sqrt(0.5 / 36), 6), moved: "higher" });
    expect(meanMove(spread(1.5), spread(1), 0.2).moved).toBe("lower");
  });

  it("does not move beyond the noise alone, under 2 standard errors", () => {
    const move = meanMove(spread(1), spread(1.2), 0.1);
    expect(move.beyondNoise).toBe("higher");
    expect(move.standardErrors).toBeCloseTo(0.2 / Math.sqrt(0.5 / 36), 6);
    expect(move.moved).toBeUndefined();
  });

  it("does not move within the noise", () => {
    expect(meanMove(spread(1), spread(1.5), 0.6)).toEqual({});
  });

  it("moves a difference with no spread on either side (every reply the same count)", () => {
    expect(meanMove({ n: 9, mean: 3, variance: 0 }, { n: 9, mean: 2, variance: 0 }, 0)).toEqual({
      beyondNoise: "lower",
      standardErrors: Infinity,
      moved: "lower",
    });
  });

  it("reads nothing without replies on either side", () => {
    expect(meanMove({ n: 0, mean: 0, variance: 0 }, spread(2), 0)).toEqual({});
  });
});

describe("momentsOf", () => {
  it("gives the mean and the sample variance (n − 1)", () => {
    expect(momentsOf([2, 4])).toEqual({ n: 2, mean: 3, variance: 2 });
    expect(momentsOf([5])).toEqual({ n: 1, mean: 5, variance: 0 });
    expect(momentsOf([])).toEqual({ n: 0, mean: 0, variance: 0 });
  });
});
