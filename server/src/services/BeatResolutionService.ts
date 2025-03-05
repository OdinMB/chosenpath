import {
  type Beat,
  type ChallengeOption,
  type ProbabilityDistribution,
  type OptionType,
} from "shared/types/beat.js";
import { ResolutionChallenge } from "shared/types/thread.js";

export class BeatResolutionService {
  /**
   * Default probability distribution (33/34/33)
   */
  private static DEFAULT_DISTRIBUTION: ProbabilityDistribution = {
    favorable: 33,
    mixed: 34,
    unfavorable: 33,
  };
  private static SAFE_DISTRIBUTION: ProbabilityDistribution = {
    favorable: 25,
    mixed: 50,
    unfavorable: 25,
  };
  private static RISKY_DISTRIBUTION: ProbabilityDistribution = {
    favorable: 40,
    mixed: 20,
    unfavorable: 40,
  };

  /**
   * Process a beat to determine its resolution type
   */
  static getBeatResolution(
    beat: Beat,
    previousBeat: Beat | null
  ): ResolutionChallenge {
    console.log(`[OutcomeService] Processing outcome for beat: ${beat.title}`);

    // Get the chosen option
    const chosenOption = beat.options[beat.choice];
    console.log(`[OutcomeService] Chosen option: "${chosenOption.text}"`);

    // Default to normal option type if not a success/failure option
    const optionType =
      chosenOption.optionType === "challenge"
        ? chosenOption.riskType
        : "normal";
    console.log(`[OutcomeService] Option type: ${optionType}`);

    // Calculate points based on the option and previous beat
    let points = 0;

    if (chosenOption.optionType === "challenge") {
      // Add base points from the option
      points += this.calculateTotalPoints(chosenOption);

      // Add bonus points based on previous beat outcome
      if (previousBeat?.resolution) {
        const previousBeatPoints = this.getPointsFromPreviousBeat(
          previousBeat.resolution as ResolutionChallenge
        );
        points += previousBeatPoints;
        console.log(
          `[OutcomeService] Previous beat outcome (${previousBeat.resolution}): ${previousBeatPoints} points`
        );
      }
    }

    console.log(
      `[OutcomeService] Final points for distribution calculation: ${points}`
    );

    // Calculate the probability distribution
    const distribution = this.calculateDistribution(points, optionType);

    // Determine the outcome
    const resolution = this.determineBeatResolution(distribution);

    console.log(`[OutcomeService] Final resolution:`, resolution);
    return resolution;
  }

  /**
   * Get the base distribution based on option type
   * - normal: 33/34/33
   * - safe: 25/50/25 (skewed toward mixed results)
   * - risky: 40/20/40 (skewed toward extreme results)
   */
  private static getBaseDistributionByOptionType(
    optionType: OptionType
  ): ProbabilityDistribution {
    switch (optionType) {
      case "normal":
        return { ...this.DEFAULT_DISTRIBUTION };
      case "safe":
        return { ...this.SAFE_DISTRIBUTION };
      case "risky":
        return { ...this.RISKY_DISTRIBUTION };
      default:
        return { ...this.DEFAULT_DISTRIBUTION };
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

    const adjustment = Math.min(
      Math.floor(pointsLeft / pointsPerShift),
      // If we are shifting to two categories, adjustment represents how much we add to both categories
      result[from] /
        (to === "favorable-mixed" || to === "mixed-unfavorable" ? 2 : 1)
    );
    result[from] -=
      adjustment *
      (to === "favorable-mixed" || to === "mixed-unfavorable" ? 2 : 1);
    if (to === "favorable-mixed") {
      result.favorable += adjustment;
      result.mixed += adjustment;
    } else if (to === "mixed-unfavorable") {
      result.mixed += adjustment;
      result.unfavorable += adjustment;
    } else {
      result[to] += adjustment;
    }
    pointsLeft -= adjustment * pointsPerShift;

    console.log(
      `[OutcomeService] Shifted ${adjustment} %-points from ${from} to ${to}. ${pointsLeft}/${points} points left.`
    );

    return [result, pointsLeft];
  }

  /**
   * Calculate probability distribution directly from points and risk type
   * This is a more elegant approach that replaces the complex point application logic
   */
  private static calculateDistribution(
    points: number,
    optionType: OptionType
  ): ProbabilityDistribution {
    // Start with the base distribution for the option type
    const base = this.getBaseDistributionByOptionType(optionType);
    // Clone the base distribution
    let result: ProbabilityDistribution = { ...base };

    if (points === 0) {
      return result;
    }

    // Calculate how much to adjust each category based on points and risk type
    if (points > 0) {
      // Positive points: increase favorable, decrease unfavorable
      if (optionType === "risky") {
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
      } else if (optionType === "safe") {
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

      if (optionType === "risky") {
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
      } else if (optionType === "safe") {
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
        `[OutcomeService] Distribution sum is ${sum}, adjusting by ${diff}`
      );

      // Add or subtract the difference from the largest value
      if (
        distribution.favorable >= distribution.mixed &&
        distribution.favorable >= distribution.unfavorable
      ) {
        distribution.favorable += diff;
        console.log(`[OutcomeService] Adjusted favorable by ${diff}`);
      } else if (
        distribution.mixed >= distribution.favorable &&
        distribution.mixed >= distribution.unfavorable
      ) {
        distribution.mixed += diff;
        console.log(`[OutcomeService] Adjusted mixed by ${diff}`);
      } else {
        distribution.unfavorable += diff;
        console.log(`[OutcomeService] Adjusted unfavorable by ${diff}`);
      }
    }
  }

  /**
   * Calculate the total points for a beat option
   */
  static calculateTotalPoints(option: ChallengeOption): number {
    // Start with the base points
    let totalPoints = option.basePoints;
    console.log(`[OutcomeService] Base points: ${totalPoints}`);

    // Add points from modifiers
    if (option.modifiers) {
      for (const modifier of option.modifiers) {
        totalPoints += modifier.effect;
        console.log(
          `[OutcomeService] Added modifier: ${modifier.stat} => ${modifier.effect} points`
        );
      }
    }

    console.log(`[OutcomeService] Total points: ${totalPoints}`);
    return totalPoints;
  }

  /**
   * Determine the beat resolution based on the probability distribution
   */
  static determineBeatResolution(
    distribution: ProbabilityDistribution
  ): ResolutionChallenge {
    const roll = Math.random() * 100;
    console.log(`[OutcomeService] Random roll: ${roll.toFixed(2)}`);

    let outcome: ResolutionChallenge;
    if (roll < distribution.favorable) {
      outcome = "favorable";
    } else if (roll < distribution.favorable + distribution.mixed) {
      outcome = "mixed";
    } else {
      outcome = "unfavorable";
    }

    console.log(
      `[OutcomeService] Outcome determined: ${outcome.toUpperCase()}`
    );
    return outcome;
  }

  /**
   * Get bonus points based on the previous beat's outcome
   */
  private static getPointsFromPreviousBeat(
    previousResolution: ResolutionChallenge
  ): number {
    switch (previousResolution) {
      case "favorable":
        return 50; // Significant advantage
      case "mixed":
        return 0; // No advantage or disadvantage
      case "unfavorable":
        return -50; // Significant disadvantage
      default:
        return 0;
    }
  }
}
