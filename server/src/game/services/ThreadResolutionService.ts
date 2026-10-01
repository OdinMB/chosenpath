import { getThreadType } from "core/types/thread.js";
import type { Resolution, Thread } from "core/types/index.js";
import type { Story } from "core/models/Story.js";

/**
 * Service for determining thread resolutions based on step outcomes
 */
export class ThreadResolutionService {
  /**
   * Before the next beat: when the current thread phase is not resolved yet,
   * resolves each thread's latest step and, once the threads are resolved,
   * sets their milestones. Returns the story unchanged otherwise.
   */
  static resolveCurrentThreads(story: Story): Story {
    if (
      story.getCurrentBeatType() !== "thread" ||
      story.isCurrentThreadResolved()
    ) {
      return story;
    }

    let updatedStory: Story = story.clone();
    const threadAnalysis = updatedStory.getCurrentThreadAnalysis();

    if (!threadAnalysis) {
      console.log(
        "[ThreadResolutionService] ERROR: No thread analysis found, returning story unchanged"
      );
      return story;
    }

    for (const thread of threadAnalysis.threads) {
      const resolution = this.getThreadResolution(thread, updatedStory);
      updatedStory = updatedStory.updateThreadResolution(thread, resolution);
    }

    if (!updatedStory.isCurrentThreadResolved()) {
      return updatedStory;
    }

    const updatedThreadAnalysis = updatedStory.getCurrentThreadAnalysis();
    if (!updatedThreadAnalysis) {
      console.log(
        "[ThreadResolutionService] ERROR: No thread analysis found after resolution"
      );
      return updatedStory;
    }

    for (const thread of updatedThreadAnalysis.threads) {
      if (!thread.resolution) {
        console.log(
          `[ThreadResolutionService] ERROR: Thread ${thread.id} has no resolution, skipping milestone`
        );
        continue;
      }
      const milestone = this.getMilestone(thread, thread.resolution);
      if (milestone) {
        updatedStory = updatedStory.updateThreadMilestone(thread, milestone);
      } else {
        console.log(
          `[ThreadResolutionService] ERROR: No milestone generated for thread ${thread.id}`
        );
      }
    }

    return updatedStory;
  }

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

  /**
   * An exploration step's result is a choice, not a roll. A thread on one
   * player's own outcome goes the way that player chose when they are in it;
   * any other thread goes the way most of its players chose, a tie by the
   * game's dice among the tied choices. Until 2026-09-30 the first player in
   * the thread decided for everyone, so in a group thread on another player's
   * outcome player1's choice wrote that player's milestone (the playthroughs'
   * food truck and space pirates stories).
   */
  private static determineExplorationThreadResolution(
    thread: Thread,
    story: Story
  ): Resolution {
    const picks = thread.playersSideA.flatMap((slot) => {
      const step = story.getCurrentBeat(slot);
      return step && step.resolution !== null ? [{ slot, resolution: step.resolution }] : [];
    });
    if (picks.length === 0) {
      console.log(
        `[ThreadResolutionService] ERROR: No valid step or resolution found in thread ${thread.id}, defaulting to "mixed"`
      );
      return "mixed";
    }

    const owner = this.outcomeOwner(story, thread.outcomeId);
    const ownersPick = picks.find((pick) => pick.slot === owner);
    if (ownersPick) return ownersPick.resolution;

    // The most chosen, in the order the thread lists its players; the dice only on a tie
    const counts = new Map<Resolution, number>();
    for (const { resolution } of picks) counts.set(resolution, (counts.get(resolution) ?? 0) + 1);
    const most = Math.max(...counts.values());
    const tied = [...counts.entries()].filter(([, count]) => count === most).map(([resolution]) => resolution);
    return tied.length === 1 ? tied[0] : tied[Math.floor(Math.random() * tied.length)];
  }

  /** The slot whose own outcome this is; undefined for a shared outcome or an id no player holds. */
  private static outcomeOwner(story: Story, outcomeId: string): string | undefined {
    if (story.getSharedOutcomes().some((outcome) => outcome.id === outcomeId)) return undefined;
    return story.getPlayerSlots().find((slot) => (story.getPlayer(slot)?.outcomes ?? []).some((outcome) => outcome.id === outcomeId));
  }

  /**
   * The player whose roll alone decides a challenge or contest step of this
   * thread: the owner of the thread's outcome, when it is one player's own and
   * that owner is in the thread; undefined where every roll in the thread
   * pools (a shared outcome, an id no player holds, an owner elsewhere). Read
   * before anyone rolls, so the group's lever lines (optionRules.ts) give no
   * lever to a player whose roll the step will discard.
   */
  static rollingOwner(thread: Thread, story: Story): string | undefined {
    const owner = this.outcomeOwner(story, thread.outcomeId);
    return owner !== undefined && (thread.playersSideA.includes(owner) || thread.playersSideB.includes(owner)) ? owner : undefined;
  }

  /**
   * Whose rolls decide a challenge or contest step: on one player's own
   * outcome, only that owner's, when the owner is in the thread and their step
   * has a result (the owner's decision of 2026-10-01: "Yes, only count the
   * owner's roll."; rollingOwner); otherwise every player's in the thread,
   * pooled. The second playthroughs' estate agents, chapter 6: a group
   * challenge on Nia's own protégé outcome, her roll unfavorable and Rory's
   * favorable, pooled into the mixed result her milestone records. A single
   * player is always the owner of their outcomes, so their result is unchanged.
   */
  private static rollingSides(thread: Thread, story: Story): { sideA: string[]; sideB: string[] } {
    const owner = this.rollingOwner(thread, story);
    if (!owner || (story.getCurrentBeat(owner)?.resolution ?? null) === null) {
      return { sideA: thread.playersSideA, sideB: thread.playersSideB };
    }
    return thread.playersSideA.includes(owner) ? { sideA: [owner], sideB: [] } : { sideA: [], sideB: [owner] };
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

    // Go through all steps in the thread progression: the owner's alone on their own outcome
    this.rollingSides(thread, story).sideA.forEach((playerSlot) => {
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

    // Go through all steps in the thread progression: the owner's alone on their own outcome
    const rolling = this.rollingSides(thread, story);
    rolling.sideA.forEach((playerSlot) => {
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

    rolling.sideB.forEach((playerSlot) => {
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
    } else if (
      "resolution1" in thread.possibleMilestones &&
      (resolution === "resolution1" ||
        resolution === "resolution2" ||
        resolution === "resolution3")
    ) {
      return thread.possibleMilestones[resolution];
    }

    return null;
  }
}
