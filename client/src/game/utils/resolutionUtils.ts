import {
  ChallengeOption,
  ResolutionDetails,
  Beat,
  ClientStoryState,
} from "core/types";
import {
  POINTS_FOR_FAVORABLE_RESOLUTION,
  POINTS_FOR_MIXED_RESOLUTION,
  POINTS_FOR_UNFAVORABLE_RESOLUTION,
} from "core/config";

/**
 * Enhances ResolutionDetails with readable point modifiers
 * for display in the UI
 *
 * @param details The original resolution details
 * @param option The challenge option selected
 * @param beatIndex The index of the beat in the beat history
 * @returns Enhanced resolution details with readable point modifiers
 */
export function enhanceResolutionDetails(
  details: ResolutionDetails,
  option: ChallengeOption,
  beatIndex: number,
  beatHistory: Beat[]
): ResolutionDetails {
  // If pointModifiers already exist, return as is
  if (details.readablePointModifiers) return details;

  const modifiers: Array<[string, number]> = [];

  // Add base points from the option with appropriate label based on resourceType
  let basePointLabel = "Choice";
  if (option.resourceType === "sacrifice") {
    basePointLabel = "Sacrifice";
  } else if (option.resourceType === "reward") {
    basePointLabel = "Reward";
  }
  modifiers.push([basePointLabel, option.basePoints]);

  // Add stat modifiers with readable names
  if (option.modifiersToSuccessRate) {
    option.modifiersToSuccessRate.forEach((mod) => {
      // Get the stat name from the ID
      const statName = getStatNameById(mod.statId);

      if (mod.effect !== 0) {
        modifiers.push([`${statName}`, mod.effect]);
      }
    });
  }

  // Add resolution effect from previous beat (if there was one)
  // Beats create momentum - favorable outcomes make it easier to succeed in following beats
  if (beatIndex > 1) {
    const previousBeat = beatHistory[beatIndex - 2];

    // Only add momentum if the previous beat had a resolution
    if (previousBeat && previousBeat.resolution) {
      let resolutionEffect = 0;

      switch (previousBeat.resolution) {
        case "favorable":
          resolutionEffect = POINTS_FOR_FAVORABLE_RESOLUTION;
          break;
        case "mixed":
          resolutionEffect = POINTS_FOR_MIXED_RESOLUTION;
          break;
        case "unfavorable":
          resolutionEffect = POINTS_FOR_UNFAVORABLE_RESOLUTION;
          break;
      }

      if (resolutionEffect !== 0) {
        modifiers.push([`Previous beat`, resolutionEffect]);
      }
    }
  }

  // Return enhanced details with modifiers
  return {
    ...details,
    readablePointModifiers: modifiers,
  };
}

/**
 * Helper function to get stat name by ID
 *
 * @param statId The ID of the stat
 * @returns The human-readable name of the stat
 */
export function getStatNameById(
  statId: string,
  storyState?: ClientStoryState
): string {
  if (!storyState) return formatStatId(statId);

  // Check player stats
  for (const stat of storyState.playerStats || []) {
    if (stat.id === statId) {
      return stat.name;
    }
  }

  // Check shared stats
  if (storyState.sharedStats) {
    for (const stat of storyState.sharedStats) {
      if (stat.id === statId) {
        return stat.name;
      }
    }
  }

  // If we don't find the stat, return a formatted version of the ID
  return formatStatId(statId);
}

/**
 * Format a stat ID into a readable name
 */
function formatStatId(statId: string): string {
  return statId
    .split("_")
    .slice(1)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
