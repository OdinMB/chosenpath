import {
  Beat,
  ChallengeOption,
  ProbabilityDistribution,
  OptionRiskType,
  ResolutionDetails,
  DEFAULT_DISTRIBUTION,
  SAFE_DISTRIBUTION,
  RISKY_DISTRIBUTION,
  ResolutionChallenge,
  Resolution,
  ResolutionExploration,
} from "@core/types/index.js";
import {
  POINTS_FOR_FAVORABLE_RESOLUTION,
  POINTS_FOR_MIXED_RESOLUTION,
  POINTS_FOR_UNFAVORABLE_RESOLUTION,
} from "@core/config.js";

export interface ChallengeResolutionResult {
  resolution: ResolutionChallenge;
  details: ResolutionDetails;
}
export class BeatResolutionService {
  static getExplorationBeatResolution(beat: Beat): ResolutionExploration {
    // For exploration beats, the resolution is based on the option index
    // Get the total number of available options
    const numOptions = beat.options.length;

    // Calculate the resolution index (1-based) based on the chosen option
    // This ensures we map correctly regardless of how many options there are
    const resolutionIndex = (beat.choice % numOptions) + 1;

    const resolution = `resolution${resolutionIndex}` as ResolutionExploration;
    console.log(
      `[BeatResolutionService] Exploration resolution: ${resolution}`
    );
    return resolution;
  }

  /**
   * Determine the challenge beat resolution and details for visualization
   * @param beat The beat to process
   * @param previousResolution The previous thread resolution, if any
   * @returns The resolution result including outcome and visualization details
   */
  static getChallengeBeatResolution(
    beat: Beat,
    previousResolution: Resolution | null
  ): ChallengeResolutionResult {
    console.log(
      `[BeatResolutionService] Processing outcome for beat: ${beat.title}`
    );

    // Get the chosen option
    const chosenOption = beat.options[beat.choice];
    console.log(
      `[BeatResolutionService] Chosen option: "${chosenOption.text}"`
    );

    if (chosenOption.optionType !== "challenge") {
      throw new Error("Beat resolution service only supports challenge beats");
    }

    // Challenge Beats
    const optionType = chosenOption.riskType;
    console.log(`[BeatResolutionService] Option type: ${optionType}`);

    // Calculate points based on the option and previous beat
    let points = 0;

    // Add base points from the option
    points += this.calculateTotalPoints(chosenOption);

    // Add bonus points based on previous resolution
    if (previousResolution) {
      const previousStepResolutionPoints =
        this.getPointsFromPreviousResolution(previousResolution);
      points += previousStepResolutionPoints;
      console.log(
        `[BeatResolutionService] Previous resolution (${previousResolution}): ${previousStepResolutionPoints} points`
      );
    }

    console.log(
      `[BeatResolutionService] Final points for distribution calculation: ${points}`
    );

    // Calculate the probability distribution
    const distribution = this.calculateDistribution(points, optionType);

    // Generate a random roll between 0 and 100
    const roll = Math.random() * 100;
    console.log(`[BeatResolutionService] Random roll: ${roll.toFixed(2)}`);

    // Determine the outcome based on the roll
    let outcome: ResolutionChallenge;
    if (roll < distribution.favorable) {
      outcome = "favorable";
    } else if (roll < distribution.favorable + distribution.mixed) {
      outcome = "mixed";
    } else {
      outcome = "unfavorable";
    }

    console.log(`[BeatResolutionService] Final resolution:`, outcome);

    // Create resolution details for visualization
    const resolutionDetails: ResolutionDetails = {
      distribution,
      roll,
      points,
    };

    // Return both the resolution and details
    return {
      resolution: outcome,
      details: resolutionDetails,
    };
  }

  /**
   * Get the base distribution based on option type
   * - normal: 33/34/33
   * - safe: 25/50/25 (skewed toward mixed results)
   * - risky: 40/20/40 (skewed toward extreme results)
   */
  private static getBaseDistributionByOptionRiskType(
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

  private static shiftPoints(
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
    /*
     * Move points from one category to another
     * Returns the new distribution and the number of points left
     * Only full multiples of pointsPerShift can be shifted
     */
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
    const isDoubleShift =
      to === "favorable-mixed" || to === "mixed-unfavorable";
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

    console.log(
      `[BeatResolutionService] Shifted ${adjustment} %-points from ${from} to ${to}. ${pointsLeft}/${points} points left.`
    );

    return [result, pointsLeft];
  }

  /**
   * Calculate probability distribution directly from points and risk type
   * This is a more elegant approach that replaces the complex point application logic
   */
  static calculateDistribution(
    points: number,
    optionRiskType: OptionRiskType
  ): ProbabilityDistribution {
    // Start with the base distribution for the option type
    const base = this.getBaseDistributionByOptionRiskType(optionRiskType);
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
        [result, points] = this.shiftPoints(
          result,
          points,
          "unfavorable",
          "favorable"
        );
        // Uneven points: 1 favorable left to move to mixed
        if (points > 0) {
          [result, points] = this.shiftPoints(
            result,
            points,
            "unfavorable",
            "mixed"
          );
        }
        if (points > 0) {
          [result, points] = this.shiftPoints(
            result,
            points,
            "mixed",
            "favorable"
          );
        }
      } else if (optionRiskType === "safe") {
        // Safe: First move from unfavorable to mixed, then from mixed to favorable
        [result, points] = this.shiftPoints(
          result,
          points,
          "unfavorable",
          "mixed"
        );
        if (points > 0) {
          [result, points] = this.shiftPoints(
            result,
            points,
            "mixed",
            "favorable"
          );
        }
      } else {
        // Normal: Distribute evenly between favorable and mixed
        [result, points] = this.shiftPoints(
          result,
          points,
          "unfavorable",
          "favorable-mixed"
        );
        if (points > 0) {
          [result, points] = this.shiftPoints(
            result,
            points,
            "unfavorable",
            "mixed"
          );
        }
        if (points > 0) {
          [result, points] = this.shiftPoints(
            result,
            points,
            "mixed",
            "favorable"
          );
        }
      }
    } else {
      // Negative points: increase unfavorable, decrease favorable
      let absPoints = Math.abs(points);

      if (optionRiskType === "risky") {
        // Risky: Move points directly from favorable to unfavorable
        [result, absPoints] = this.shiftPoints(
          result,
          absPoints,
          "favorable",
          "unfavorable"
        );
        // Uneven points: 1 favorable left to move to mixed
        if (absPoints > 0) {
          [result, absPoints] = this.shiftPoints(
            result,
            absPoints,
            "favorable",
            "mixed"
          );
        }
        if (absPoints > 0) {
          [result, absPoints] = this.shiftPoints(
            result,
            absPoints,
            "mixed",
            "unfavorable"
          );
        }
      } else if (optionRiskType === "safe") {
        // Safe: First move from favorable to mixed, then from mixed to unfavorable
        [result, absPoints] = this.shiftPoints(
          result,
          absPoints,
          "favorable",
          "mixed"
        );
        if (absPoints > 0) {
          [result, absPoints] = this.shiftPoints(
            result,
            absPoints,
            "mixed",
            "unfavorable"
          );
        }
      } else {
        // Normal: Distribute evenly between unfavorable and mixed
        [result, absPoints] = this.shiftPoints(
          result,
          absPoints,
          "favorable",
          "mixed-unfavorable"
        );
        if (absPoints > 0) {
          [result, absPoints] = this.shiftPoints(
            result,
            absPoints,
            "favorable",
            "mixed"
          );
        }
        if (absPoints > 0) {
          [result, absPoints] = this.shiftPoints(
            result,
            absPoints,
            "mixed",
            "unfavorable"
          );
        }
      }
    }

    // Ensure all values are integers and sum to 100
    this.normalizeDistribution(result);
    console.log(
      `[BeatResolutionService] Final distribution: ${JSON.stringify(result)}`
    );
    return result;
  }

  /**
   * Ensure the distribution sums to 100 and all values are integers
   */
  private static normalizeDistribution(
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
      console.log(
        `[BeatResolutionService] Distribution sum is ${sum}, adjusting by ${diff}`
      );

      // Add or subtract the difference from the largest value
      if (
        distribution.favorable >= distribution.mixed &&
        distribution.favorable >= distribution.unfavorable
      ) {
        distribution.favorable += diff;
        console.log(`[BeatResolutionService] Adjusted favorable by ${diff}`);
      } else if (
        distribution.mixed >= distribution.favorable &&
        distribution.mixed >= distribution.unfavorable
      ) {
        distribution.mixed += diff;
        console.log(`[BeatResolutionService] Adjusted mixed by ${diff}`);
      } else {
        distribution.unfavorable += diff;
        console.log(`[BeatResolutionService] Adjusted unfavorable by ${diff}`);
      }
    }
  }

  /**
   * Calculate the total points for a beat option
   */
  static calculateTotalPoints(option: ChallengeOption): number {
    // Start with the base points
    let totalPoints = option.basePoints;
    console.log(`[BeatResolutionService] Base points: ${totalPoints}`);

    // Add points from modifiers
    if (option.modifiersToSuccessRate) {
      for (const modifier of option.modifiersToSuccessRate) {
        totalPoints += modifier.effect;
        console.log(
          `[BeatResolutionService] Added modifier: ${modifier.statId} (${modifier.reason}) => ${modifier.effect} points`
        );
      }
    }

    console.log(`[BeatResolutionService] Total points: ${totalPoints}`);
    return totalPoints;
  }

  /**
   * Get bonus points based on the previous beat's outcome
   */
  private static getPointsFromPreviousResolution(
    previousResolution: Resolution
  ): number {
    switch (previousResolution) {
      case "favorable":
        return POINTS_FOR_FAVORABLE_RESOLUTION; // Significant advantage
      case "mixed":
        return POINTS_FOR_MIXED_RESOLUTION; // No advantage or disadvantage
      case "unfavorable":
        return POINTS_FOR_UNFAVORABLE_RESOLUTION; // Significant disadvantage
      // Contest resolutions are already mapped to favorable/mixed/unfavorable
      // in the Story.getThreadLastStepResolution method
      case "sideAWins":
      case "sideBWins":
      case "resolution1":
      case "resolution2":
      case "resolution3":
        console.log(
          `[BeatResolutionService] Previous resolution: ${previousResolution}). THIS SHOULD NEVER HAPPEN.`
        );
        return 0;
      default:
        console.log(
          `[BeatResolutionService] Previous resolution: ${previousResolution}. THIS SHOULD NEVER HAPPEN.`
        );
        return 0;
    }
  }
}
