import {
  ProbabilityDistribution,
  OptionRiskType,
  DEFAULT_DISTRIBUTION,
  SAFE_DISTRIBUTION,
  RISKY_DISTRIBUTION,
} from "../types/beat.js";

/**
 * Get the base distribution based on option type
 * - normal: 33/34/33
 * - safe: 25/50/25 (skewed toward mixed results)
 * - risky: 40/20/40 (skewed toward extreme results)
 */
export function getBaseDistributionByOptionRiskType(
  optionRiskType: OptionRiskType
): ProbabilityDistribution {
  switch (optionRiskType) {
    case "normal":
      return { ...DEFAULT_DISTRIBUTION };
    case "safe":
      return { ...SAFE_DISTRIBUTION };
    case "risky":
      return { ...RISKY_DISTRIBUTION };
    default:
      return { ...DEFAULT_DISTRIBUTION };
  }
}

/**
 * Move points from one category to another
 * Returns the new distribution and the number of points left
 * Only full multiples of pointsPerShift can be shifted
 */
export function shiftPoints(
  distribution: ProbabilityDistribution,
  points: number,
  from: "favorable" | "mixed" | "unfavorable",
  to:
    | "favorable"
    | "mixed"
    | "unfavorable"
    | "favorable-mixed"
    | "mixed-unfavorable"
): [ProbabilityDistribution, number] {
  let result = { ...distribution };
  let pointsLeft = points;
  let pointsPerShift = 0;

  if (to === "favorable-mixed" || to === "mixed-unfavorable") {
    pointsPerShift = 3;
  } else if (to === "mixed") {
    pointsPerShift = 1;
  } else if (to === "unfavorable") {
    pointsPerShift = from === "favorable" ? 2 : 1;
  } else if (to === "favorable") {
    pointsPerShift = from === "unfavorable" ? 2 : 1;
  }

  // Calculate how many full shifts we can make based on available points
  const maxShiftsFromPoints = Math.floor(pointsLeft / pointsPerShift);

  // Calculate how many shifts we can make based on source category availability
  const isDoubleShift = to === "favorable-mixed" || to === "mixed-unfavorable";
  const maxShiftsFromSource = Math.floor(
    result[from] / (isDoubleShift ? 2 : 1)
  );

  // Take the minimum of the two constraints
  const adjustment = Math.min(maxShiftsFromPoints, maxShiftsFromSource);

  // Calculate exactly how many points will be used
  const pointsUsed = adjustment * pointsPerShift;

  // Update the distribution
  result[from] -= adjustment * (isDoubleShift ? 2 : 1);

  if (to === "favorable-mixed") {
    result.favorable += adjustment;
    result.mixed += adjustment;
  } else if (to === "mixed-unfavorable") {
    result.mixed += adjustment;
    result.unfavorable += adjustment;
  } else {
    result[to] += adjustment;
  }

  pointsLeft -= pointsUsed;

  return [result, pointsLeft];
}

/**
 * Calculate probability distribution directly from points and risk type
 * @param points The points to apply to the distribution
 * @param optionRiskType The type of option (normal, safe, risky)
 * @returns The final probability distribution
 */
export function calculateDistribution(
  points: number,
  optionRiskType: OptionRiskType
): ProbabilityDistribution {
  // Start with the base distribution for the option type
  const base = getBaseDistributionByOptionRiskType(optionRiskType);
  // Clone the base distribution
  let result: ProbabilityDistribution = { ...base };

  if (points === 0) {
    return result;
  }

  // Calculate how much to adjust each category based on points and risk type
  if (points > 0) {
    // Positive points: increase favorable, decrease unfavorable
    if (optionRiskType === "risky") {
      // Risky: Move points directly from unfavorable to favorable
      [result, points] = shiftPoints(
        result,
        points,
        "unfavorable",
        "favorable"
      );
      // Uneven points: 1 favorable left to move to mixed
      if (points > 0) {
        [result, points] = shiftPoints(result, points, "unfavorable", "mixed");
      }
      if (points > 0) {
        [result, points] = shiftPoints(result, points, "mixed", "favorable");
      }
    } else if (optionRiskType === "safe") {
      // Safe: First move from unfavorable to mixed, then from mixed to favorable
      [result, points] = shiftPoints(result, points, "unfavorable", "mixed");
      if (points > 0) {
        [result, points] = shiftPoints(result, points, "mixed", "favorable");
      }
    } else {
      // Normal: Distribute evenly between favorable and mixed
      [result, points] = shiftPoints(
        result,
        points,
        "unfavorable",
        "favorable-mixed"
      );
      if (points > 0) {
        [result, points] = shiftPoints(result, points, "unfavorable", "mixed");
      }
      if (points > 0) {
        [result, points] = shiftPoints(result, points, "mixed", "favorable");
      }
    }
  } else {
    // Negative points: increase unfavorable, decrease favorable
    let absPoints = Math.abs(points);

    if (optionRiskType === "risky") {
      // Risky: Move points directly from favorable to unfavorable
      [result, absPoints] = shiftPoints(
        result,
        absPoints,
        "favorable",
        "unfavorable"
      );
      // Uneven points: 1 favorable left to move to mixed
      if (absPoints > 0) {
        [result, absPoints] = shiftPoints(
          result,
          absPoints,
          "favorable",
          "mixed"
        );
      }
      if (absPoints > 0) {
        [result, absPoints] = shiftPoints(
          result,
          absPoints,
          "mixed",
          "unfavorable"
        );
      }
    } else if (optionRiskType === "safe") {
      // Safe: First move from favorable to mixed, then from mixed to unfavorable
      [result, absPoints] = shiftPoints(
        result,
        absPoints,
        "favorable",
        "mixed"
      );
      if (absPoints > 0) {
        [result, absPoints] = shiftPoints(
          result,
          absPoints,
          "mixed",
          "unfavorable"
        );
      }
    } else {
      // Normal: Distribute evenly between unfavorable and mixed
      [result, absPoints] = shiftPoints(
        result,
        absPoints,
        "favorable",
        "mixed-unfavorable"
      );
      if (absPoints > 0) {
        [result, absPoints] = shiftPoints(
          result,
          absPoints,
          "favorable",
          "mixed"
        );
      }
      if (absPoints > 0) {
        [result, absPoints] = shiftPoints(
          result,
          absPoints,
          "mixed",
          "unfavorable"
        );
      }
    }
  }

  // Ensure all values are integers and sum to 100
  normalizeDistribution(result);

  return result;
}

/**
 * Ensure the distribution sums to 100 and all values are integers
 */
export function normalizeDistribution(
  distribution: ProbabilityDistribution
): void {
  // Round all values to integers
  distribution.favorable = Math.round(distribution.favorable);
  distribution.mixed = Math.round(distribution.mixed);
  distribution.unfavorable = Math.round(distribution.unfavorable);

  // Calculate the sum
  const sum =
    distribution.favorable + distribution.mixed + distribution.unfavorable;

  // Adjust to ensure sum is 100
  if (sum !== 100) {
    const diff = 100 - sum;

    // Add or subtract the difference from the largest value
    if (
      distribution.favorable >= distribution.mixed &&
      distribution.favorable >= distribution.unfavorable
    ) {
      distribution.favorable += diff;
    } else if (
      distribution.mixed >= distribution.favorable &&
      distribution.mixed >= distribution.unfavorable
    ) {
      distribution.mixed += diff;
    } else {
      distribution.unfavorable += diff;
    }
  }
}
