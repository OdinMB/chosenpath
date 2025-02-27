import {
  type Beat,
  type SuccessFailureOption,
  type BeatOption,
  type ProbabilityDistribution,
  type StepResolutionType,
  type OptionType,
  type OutcomeResult,
} from "shared/types/beat.js";
import { type Thread } from "shared/types/thread.js";

export class OutcomeService {
  /**
   * Default probability distribution (33/34/33)
   */
  private static DEFAULT_DISTRIBUTION: ProbabilityDistribution = {
    favorable: 33,
    mixed: 34,
    unfavorable: 33,
  };

  /**
   * Calculate the probability distribution based on points and option type
   */
  static calculateDistribution(
    points: number,
    optionType: OptionType
  ): ProbabilityDistribution {
    console.log(
      `[OutcomeService] Calculating distribution - Points: ${points}, Option Type: ${optionType}`
    );

    // Start with the base distribution based on option type
    const distribution = this.getBaseDistributionByOptionType(optionType);
    console.log(
      `[OutcomeService] Base distribution for ${optionType}: F:${distribution.favorable}% / M:${distribution.mixed}% / U:${distribution.unfavorable}%`
    );

    // Apply the algorithm to calculate the distribution
    const result = this.applyPointsToDistribution(
      distribution,
      points,
      optionType
    );
    console.log(
      `[OutcomeService] Final distribution: F:${result.favorable}% / M:${result.mixed}% / U:${result.unfavorable}%`
    );

    return result;
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
        return { favorable: 25, mixed: 50, unfavorable: 25 };
      case "risky":
        return { favorable: 40, mixed: 20, unfavorable: 40 };
      default:
        return { ...this.DEFAULT_DISTRIBUTION };
    }
  }

  /**
   * Apply points to shift the probability distribution
   *
   * Principles:
   * - Positive points: Take away from unfavorable until none are left; then mixed
   * - Negative points: Take away from favorable until none are left; then mixed
   * - Normal: distribute equally to the remaining categories
   * - Safe: distribute to mixed first
   * - Risky: distribute to favorable/unfavorable first
   */
  private static applyPointsToDistribution(
    distribution: ProbabilityDistribution,
    points: number,
    optionType: OptionType
  ): ProbabilityDistribution {
    const result = { ...distribution };

    if (points === 0) {
      return result;
    }

    console.log(`[OutcomeService] Applying ${points} points to distribution`);

    if (points > 0) {
      // Positive points: reduce unfavorable, then mixed
      this.applyPositivePoints(result, points, optionType);
    } else {
      // Negative points: reduce favorable, then mixed
      this.applyNegativePoints(result, Math.abs(points), optionType);
    }

    // Ensure all values are integers and sum to 100
    this.normalizeDistribution(result);
    return result;
  }

  /**
   * Apply positive points to the distribution
   */
  private static applyPositivePoints(
    distribution: ProbabilityDistribution,
    points: number,
    optionType: OptionType
  ): void {
    // First, take points from unfavorable
    const pointsFromUnfavorable = Math.min(points, distribution.unfavorable);
    distribution.unfavorable -= pointsFromUnfavorable;

    // Distribute these points based on risk type
    if (optionType === "normal") {
      // Normal: distribute equally
      const toFavorable = Math.floor(pointsFromUnfavorable / 2);
      const toMixed = pointsFromUnfavorable - toFavorable;
      distribution.favorable += toFavorable;
      distribution.mixed += toMixed;
      console.log(
        `[OutcomeService] Normal: ${pointsFromUnfavorable} from unfavorable → ${toFavorable} to favorable, ${toMixed} to mixed`
      );
    } else if (optionType === "safe") {
      // Safe: distribute to mixed first
      distribution.mixed += pointsFromUnfavorable;
      console.log(
        `[OutcomeService] Safe: ${pointsFromUnfavorable} from unfavorable → all to mixed`
      );
    } else if (optionType === "risky") {
      // Risky: distribute to favorable first
      distribution.favorable += pointsFromUnfavorable;
      console.log(
        `[OutcomeService] Risky: ${pointsFromUnfavorable} from unfavorable → all to favorable`
      );
    }

    // If we still have points, take from mixed
    const remainingPoints = points - pointsFromUnfavorable;
    if (remainingPoints > 0) {
      const pointsFromMixed = Math.min(remainingPoints, distribution.mixed);
      distribution.mixed -= pointsFromMixed;
      distribution.favorable += pointsFromMixed;
      console.log(
        `[OutcomeService] ${pointsFromMixed} from mixed → all to favorable`
      );
    }
  }

  /**
   * Apply negative points to the distribution
   */
  private static applyNegativePoints(
    distribution: ProbabilityDistribution,
    points: number,
    optionType: OptionType
  ): void {
    // First, take points from favorable
    const pointsFromFavorable = Math.min(points, distribution.favorable);
    distribution.favorable -= pointsFromFavorable;

    // Distribute these points based on risk type
    if (optionType === "normal") {
      // Normal: distribute equally
      const toUnfavorable = Math.floor(pointsFromFavorable / 2);
      const toMixed = pointsFromFavorable - toUnfavorable;
      distribution.unfavorable += toUnfavorable;
      distribution.mixed += toMixed;
      console.log(
        `[OutcomeService] Normal: ${pointsFromFavorable} from favorable → ${toUnfavorable} to unfavorable, ${toMixed} to mixed`
      );
    } else if (optionType === "safe") {
      // Safe: distribute to mixed first
      distribution.mixed += pointsFromFavorable;
      console.log(
        `[OutcomeService] Safe: ${pointsFromFavorable} from favorable → all to mixed`
      );
    } else if (optionType === "risky") {
      // Risky: distribute to unfavorable first
      distribution.unfavorable += pointsFromFavorable;
      console.log(
        `[OutcomeService] Risky: ${pointsFromFavorable} from favorable → all to unfavorable`
      );
    }

    // If we still have points, take from mixed
    const remainingPoints = points - pointsFromFavorable;
    if (remainingPoints > 0) {
      const pointsFromMixed = Math.min(remainingPoints, distribution.mixed);
      distribution.mixed -= pointsFromMixed;
      distribution.unfavorable += pointsFromMixed;
      console.log(
        `[OutcomeService] ${pointsFromMixed} from mixed → all to unfavorable`
      );
    }
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
  static calculateTotalPoints(option: SuccessFailureOption): number {
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
   * Determine the outcome based on the probability distribution
   */
  static determineOutcome(
    distribution: ProbabilityDistribution
  ): StepResolutionType {
    const roll = Math.random() * 100;
    console.log(`[OutcomeService] Random roll: ${roll.toFixed(2)}`);

    let outcome: StepResolutionType;
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
   * Process a beat to determine its outcome
   */
  static processBeatOutcome(
    beat: Beat,
    previousBeat: Beat | null
  ): OutcomeResult {
    console.log(`[OutcomeService] Processing outcome for beat: ${beat.title}`);

    // Get the chosen option
    const chosenOption = beat.options[beat.choice];
    console.log(`[OutcomeService] Chosen option: "${chosenOption.text}"`);

    // Default to normal option type if not a success/failure option
    const optionType =
      chosenOption.optionType === "successFailure"
        ? chosenOption.riskType
        : "normal";
    console.log(`[OutcomeService] Option type: ${optionType}`);

    // Calculate points based on the option and previous beat
    let points = 0;

    if (chosenOption.optionType === "successFailure") {
      // Add base points from the option
      points += this.calculateTotalPoints(chosenOption);

      // Add bonus points based on previous beat outcome
      if (previousBeat?.resolution) {
        const previousBeatPoints = this.getPointsFromPreviousBeat(
          previousBeat.resolution
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
    const resolution = this.determineOutcome(distribution);

    const result = {
      distribution,
      resolution,
      points,
      optionType,
    };

    console.log(`[OutcomeService] Final outcome result:`, result);
    return result;
  }

  /**
   * Get bonus points based on the previous beat's outcome
   */
  private static getPointsFromPreviousBeat(
    previousResolution: StepResolutionType
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

  /**
   * Compare outcomes between sides in a contested thread
   */
  static compareContestedOutcomes(
    sideAOutcome: StepResolutionType,
    sideBOutcome: StepResolutionType
  ): StepResolutionType {
    console.log(
      `[OutcomeService] Comparing contested outcomes - Side A: ${sideAOutcome}, Side B: ${sideBOutcome}`
    );

    // Convert outcomes to numeric values for comparison
    const outcomeValues = {
      favorable: 2,
      mixed: 1,
      unfavorable: 0,
    };

    const sideAValue = outcomeValues[sideAOutcome];
    const sideBValue = outcomeValues[sideBOutcome];

    let result: StepResolutionType;
    if (sideAValue > sideBValue) {
      result = "favorable"; // Side A wins
    } else if (sideAValue < sideBValue) {
      result = "unfavorable"; // Side B wins
    } else {
      result = "mixed"; // Draw
    }

    console.log(`[OutcomeService] Contest result: ${result.toUpperCase()}`);
    return result;
  }
}
