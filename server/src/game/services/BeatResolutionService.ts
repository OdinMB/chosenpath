import {
  Beat,
  ChallengeOption,
  ResolutionDetails,
  ResolutionChallenge,
  Resolution,
  ResolutionExploration,
} from "core/types/index.js";
import {
  POINTS_FOR_FAVORABLE_RESOLUTION,
  POINTS_FOR_MIXED_RESOLUTION,
  POINTS_FOR_UNFAVORABLE_RESOLUTION,
} from "core/config.js";
import { calculateDistribution } from "core/utils/beatResolutionUtils.js";

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
    const distribution = calculateDistribution(points, optionType);
    console.log(
      `[BeatResolutionService] Final distribution: ${JSON.stringify(
        distribution
      )}`
    );

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
