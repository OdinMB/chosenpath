import { getThreadType } from "core/types/thread.js";
import type { Resolution, Thread } from "core/types/index.js";
import type { Story } from "core/models/Story.js";

/**
 * Service for determining thread resolutions based on step outcomes
 */
export class ThreadResolutionService {
  /**
   * Determines the resolution for a thread based on its type and step resolutions
   * @param thread The thread to determine resolution for
   * @param story The story to determine the resolution for
   * @returns The calculated resolution
   */
  static getThreadResolution(thread: Thread, story: Story): Resolution {
    const threadType = getThreadType(thread);
    // console.log(
    //   `[ThreadResolutionService] Determining resolution for thread ${thread.id} of type ${threadType}`
    // );

    if (threadType === "challenge") {
      return this.determineChallengeThreadResolution(thread, story);
    } else if (threadType === "contest") {
      return this.determineContestThreadResolution(thread, story);
    } else {
      return this.determineExplorationThreadResolution(thread, story);
    }
  }

  private static determineExplorationThreadResolution(
    thread: Thread,
    story: Story
  ): Resolution {
    // console.log(
    //   `[ThreadResolutionService] Determining exploration thread resolution for ${thread.id}`
    // );
    // for now, just choose whatever the (hopefully) one player in the thread chose
    const playerSlot = thread.playersSideA[0];
    if (!playerSlot) {
      console.log(
        `[ThreadResolutionService] ERROR: No playerSlot found in thread ${thread.id}, defaulting to "mixed"`
      );
      return "mixed";
    }
    const step = story.getCurrentBeat(playerSlot);

    // If step is null or resolution is null, default to "mixed"
    if (!step || step.resolution === null) {
      console.log(
        `[ThreadResolutionService] ERROR: No valid step or resolution found, defaulting to "mixed"`
      );
      return "mixed";
    }

    return step.resolution;
  }

  private static determineChallengeThreadResolution(
    thread: Thread,
    story: Story
  ): Resolution {
    // console.log(
    //   `[ThreadResolutionService] Determining Challenge thread resolution for ${thread.id}`
    // );

    // Count the number of each resolution type
    let favorableCount = 0;
    let mixedCount = 0;
    let unfavorableCount = 0;

    // Go through all steps in the thread progression
    thread.playersSideA.forEach((playerSlot) => {
      const step = story.getCurrentBeat(playerSlot);
      if (!step || step.resolution === null) {
        console.log(
          `[ThreadResolutionService] ERROR: No valid step or resolution found for player ${playerSlot} in thread ${thread.id}, defaulting to "mixed"`
        );
        return;
      }

      if (step.resolution === "favorable") {
        favorableCount++;
      } else if (step.resolution === "mixed") {
        mixedCount++;
      } else if (step.resolution === "unfavorable") {
        unfavorableCount++;
      }
    });

    // console.log(
    //   `[ThreadResolutionService] Counts - Favorable: ${favorableCount}, Mixed: ${mixedCount}, Unfavorable: ${unfavorableCount}`
    // );

    // Calculate resolution based on counts
    const totalResolutions = favorableCount + mixedCount + unfavorableCount;

    // If no valid resolutions, default to mixed
    if (totalResolutions === 0) {
      console.log(
        `[ThreadResolutionService] ERROR: No valid resolutions found, defaulting to "mixed"`
      );
      return "mixed";
    }

    const netFavorable = favorableCount - unfavorableCount;
    const extremeEqualsFavorable = netFavorable >= 0;
    const netExtreme = Math.abs(netFavorable);
    const chanceForExtreme = (netExtreme / totalResolutions) * 100;
    const randomValue = Math.random() * 100;
    // console.log(
    //   `[ThreadResolutionService] Chance for extreme: ${chanceForExtreme}%, random value: ${randomValue}`
    // );
    let result: Resolution | null = null;
    if (randomValue < chanceForExtreme) {
      if (extremeEqualsFavorable) {
        result = "favorable";
      } else {
        result = "unfavorable";
      }
    } else {
      result = "mixed";
    }
    // console.log(
    //   `[ThreadResolutionService] Thread ${thread.id} resolution: ${result}`
    // );
    return result;
  }

  private static determineContestThreadResolution(
    thread: Thread,
    story: Story
  ): Resolution {
    // console.log(
    //   `[ThreadResolutionService] Determining Contest thread resolution for ${thread.id}`
    // );

    // Count the number of each resolution type
    let sideAFavorableCount = 0;
    let sideAMixedCount = 0;
    let sideAUnfavorableCount = 0;
    let sideBFavorableCount = 0;
    let sideBMixedCount = 0;
    let sideBUnfavorableCount = 0;

    // Go through all steps in the thread progression
    thread.playersSideA.forEach((playerSlot) => {
      const step = story.getCurrentBeat(playerSlot);
      if (!step || step.resolution === null) {
        console.log(
          `[ThreadResolutionService] ERROR: No valid step or resolution found for player ${playerSlot} in thread ${thread.id}, defaulting to "mixed"`
        );
        return;
      }

      if (step.resolution === "favorable") {
        sideAFavorableCount++;
      } else if (step.resolution === "mixed") {
        sideAMixedCount++;
      } else if (step.resolution === "unfavorable") {
        sideAUnfavorableCount++;
      }
    });

    thread.playersSideB.forEach((playerSlot) => {
      const step = story.getCurrentBeat(playerSlot);
      if (!step || step.resolution === null) {
        console.log(
          `[ThreadResolutionService] ERROR: No valid step or resolution found for player ${playerSlot} in thread ${thread.id}, defaulting to "mixed"`
        );
        return;
      }

      if (step.resolution === "favorable") {
        sideBFavorableCount++;
      } else if (step.resolution === "mixed") {
        sideBMixedCount++;
      } else if (step.resolution === "unfavorable") {
        sideBUnfavorableCount++;
      }
    });

    // console.log(
    //   `[ThreadResolutionService] Counts - Side A: Favorable: ${sideAFavorableCount}, Mixed: ${sideAMixedCount}, Unfavorable: ${sideAUnfavorableCount}, Side B: Favorable: ${sideBFavorableCount}, Mixed: ${sideBMixedCount}, Unfavorable: ${sideBUnfavorableCount}`
    // );

    // Check if we have any valid resolutions
    const totalResolutions =
      sideAFavorableCount +
      sideAMixedCount +
      sideAUnfavorableCount +
      sideBFavorableCount +
      sideBMixedCount +
      sideBUnfavorableCount;

    if (totalResolutions === 0) {
      console.log(
        `[ThreadResolutionService] ERROR: No valid resolutions found, defaulting to "mixed"`
      );
      return "mixed";
    }

    let tugOfWar: number = 0;
    tugOfWar += sideAFavorableCount;
    tugOfWar -= sideAUnfavorableCount;
    tugOfWar -= sideBFavorableCount;
    tugOfWar += sideBUnfavorableCount;

    let result: Resolution;
    if (tugOfWar > 0) {
      result = "sideAWins";
    } else if (tugOfWar < 0) {
      result = "sideBWins";
    } else {
      result = "mixed";
    }
    // console.log(
    //   `[ThreadResolutionService] Thread ${thread.id} resolution: ${result}`
    // );
    return result;
  }

  /**
   * Gets the milestone for a thread based on its resolution
   * @param thread The thread to get the milestone for
   * @param resolution The thread's resolution
   * @returns The milestone string or null if no milestone applies
   */
  static getMilestone(thread: Thread, resolution: Resolution): string | null {
    if (
      "favorable" in thread.possibleMilestones &&
      (resolution === "favorable" ||
        resolution === "mixed" ||
        resolution === "unfavorable")
    ) {
      const milestone = thread.possibleMilestones[resolution];
      // console.log(
      //   `[ThreadResolutionService] Thread ${thread.id} milestone set to: ${milestone}`
      // );
      return milestone;
    } else if (
      "sideAWins" in thread.possibleMilestones &&
      (resolution === "sideAWins" ||
        resolution === "mixed" ||
        resolution === "sideBWins")
    ) {
      const milestone = thread.possibleMilestones[resolution];
      // console.log(
      //   `[ThreadResolutionService] Thread ${thread.id} milestone set to: ${milestone}`
      // );
      return milestone;
    }

    return null;
  }
}
