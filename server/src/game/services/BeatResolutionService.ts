import {
  Beat,
  ChallengeOption,
  ResolutionDetails,
  ResolutionChallenge,
  Resolution,
  ResolutionExploration,
  DifficultyLevel,
} from "core/types/index.js";
import {
  POINTS_FOR_FAVORABLE_RESOLUTION,
  POINTS_FOR_MIXED_RESOLUTION,
  POINTS_FOR_UNFAVORABLE_RESOLUTION,
} from "core/config.js";
import { calculateDistribution } from "core/utils/beatResolutionUtils.js";
import { Story } from "core/models/Story.js";

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
   * @param difficultyLevel The difficulty level for the beat
   * @param story The story object, used for stat lookups
   * @returns The resolution result including outcome and visualization details
   */
  static getChallengeBeatResolution(
    beat: Beat,
    previousResolution: Resolution | null,
    difficultyLevel: DifficultyLevel,
    story: Story
  ): ChallengeResolutionResult {
    console.log(
      `[BeatResolutionService] Processing outcome for beat: ${beat.title}`
    );

    const chosenOption = beat.options[beat.choice];
    console.log(
      `[BeatResolutionService] Chosen option: "${chosenOption.text}"`
    );

    if (chosenOption.optionType !== "challenge") {
      throw new Error("Beat resolution service only supports challenge beats");
    }

    const optionType = chosenOption.riskType;
    console.log(`[BeatResolutionService] Option type: ${optionType}`);

    const orderedReadablePointModifiers: Array<{
      name: string;
      value: number;
      tooltip?: string;
    }> = [];
    let totalPointsForDistribution = 0;

    // 1. Add bonus points based on previous resolution (New Order: First)
    if (previousResolution) {
      const previousStepResolutionPoints =
        this.getPointsFromPreviousResolution(previousResolution);
      totalPointsForDistribution += previousStepResolutionPoints;
      if (previousStepResolutionPoints !== 0) {
        orderedReadablePointModifiers.push({
          name: "Previous Beat",
          value: previousStepResolutionPoints,
          tooltip:
            previousStepResolutionPoints > 0
              ? "You put yourself in a good position"
              : "Things didn't go well up to this point",
        });
        console.log(
          `[BeatResolutionService] Applied Previous resolution effect (${previousResolution}): ${previousStepResolutionPoints} points. Current total: ${totalPointsForDistribution}`
        );
      } else {
        console.log(
          `[BeatResolutionService] Previous resolution (${previousResolution}) had no point effect. Current total: ${totalPointsForDistribution}`
        );
      }
    }

    // 2. & 3. Add points from the chosen option (base points and stat modifiers) (New Order: Second)
    const optionSpecificModifiers: Array<{
      name: string;
      value: number;
      tooltip?: string;
    }> = [];
    const pointsFromOption = this.calculateTotalPoints(
      chosenOption,
      optionSpecificModifiers,
      story
    );
    totalPointsForDistribution += pointsFromOption;
    orderedReadablePointModifiers.push(...optionSpecificModifiers);
    console.log(
      `[BeatResolutionService] Applied points from option: ${pointsFromOption}. Current total: ${totalPointsForDistribution}`
    );

    // 4. Add story difficulty modifier (New Order: Last)
    totalPointsForDistribution += difficultyLevel.modifier;

    if (difficultyLevel.modifier !== 0) {
      orderedReadablePointModifiers.push({
        name: difficultyLevel.title,
        value: difficultyLevel.modifier,
        tooltip: "Difficulty level for this story",
      });
      console.log(
        `[BeatResolutionService] Applied Story difficulty modifier ('${difficultyLevel.title}'): ${difficultyLevel.modifier} points. Current total (after all additions): ${totalPointsForDistribution}`
      );
    } else {
      // Log even if zero, for clarity that it was considered for the sum.
      console.log(
        `[BeatResolutionService] Story difficulty modifier is 0. Current total (after all additions): ${totalPointsForDistribution}`
      );
    }

    console.log(
      `[BeatResolutionService] Final points for distribution calculation: ${totalPointsForDistribution}`
    );

    const distribution = calculateDistribution(
      totalPointsForDistribution,
      optionType
    );
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
      points: totalPointsForDistribution,
      readablePointModifiers: orderedReadablePointModifiers,
    };

    // Return both the resolution and details
    return {
      resolution: outcome,
      details: resolutionDetails,
    };
  }

  /**
   * Calculate the total points for a beat option and populate its specific modifiers.
   * Modifiers are added to outOptionSpecificModifiers: ["Choice", basePoints], [statName, effect]
   * @param option The challenge option.
   * @param outOptionSpecificModifiers Array to populate with option's readable modifiers.
   * @param story The story object, used for stat lookups by ID.
   * @returns The sum of points from the option (base + stat effects).
   */
  static calculateTotalPoints(
    option: ChallengeOption,
    outOptionSpecificModifiers: Array<{
      name: string;
      value: number;
      tooltip?: string;
    }>,
    story: Story
  ): number {
    let currentOptionPoints = option.basePoints;
    console.log(
      `[BeatResolutionService] Base points for option: ${currentOptionPoints}`
    );
    let choiceTooltip = "";
    if (option.resourceType === "sacrifice") {
      choiceTooltip = "You gave up something to gain an advantage";
    } else if (option.resourceType === "reward") {
      choiceTooltip = "You knew this would make things more difficult";
    } else {
      // normal
      choiceTooltip =
        option.basePoints >= 0
          ? "Your approach is promising"
          : "Not the most promising approach";
    }
    outOptionSpecificModifiers.push({
      name: "Choice",
      value: option.basePoints,
      tooltip: choiceTooltip,
    });

    if (option.modifiersToSuccessRate) {
      for (const modifier of option.modifiersToSuccessRate) {
        currentOptionPoints += modifier.effect;

        let statName = modifier.statId; // Fallback to ID
        const foundStat = story.getStatById(modifier.statId);
        if (foundStat && foundStat.name) {
          statName = foundStat.name;
        }

        outOptionSpecificModifiers.push({
          name: statName,
          value: modifier.effect,
          tooltip: modifier.reason,
        });
        console.log(
          `[BeatResolutionService] Added option modifier: '${statName}' (${
            modifier.reason || modifier.statId
          }) => ${
            modifier.effect
          } points. Option subtotal: ${currentOptionPoints}`
        );
      }
    }

    console.log(
      `[BeatResolutionService] Total points calculated from option: ${currentOptionPoints}`
    );
    return currentOptionPoints;
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
