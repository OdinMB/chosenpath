import {
  StoryState,
  Thread,
  ThreadAnalysis,
  Resolution,
  Beat,
  BeatType,
  PlayerSlot,
  ThreadType,
  getThreadType,
} from "../types/index.js";

/**
 * Manages all thread-related operations for Story class
 */
export class ThreadManager {
  constructor(state: StoryState) {
    // Initialize if needed
  }

  /**
   * Get the current beat type based on story phases
   */
  getCurrentBeatType(state: StoryState): BeatType {
    // If there are no phases, return intro
    if (state.storyPhases.length === 0) {
      return "intro";
    }

    const currentPhase = state.storyPhases[state.storyPhases.length - 1];

    // If the current phase is a SwitchAnalysis, return switch
    if (this.isSwitchAnalysis(currentPhase)) {
      return "switch";
    }

    // If the current phase is a ThreadAnalysis, return thread
    if (this.isThreadAnalysis(currentPhase)) {
      // If we've reached the max turns, return ending
      const playerManager = new PlayerManager(state);
      const currentTurn = playerManager.getCurrentTurn(state);
      if (
        currentTurn >= state.maxTurns &&
        this.getCurrentThreadBeatsCompleted(state) >=
          this.getCurrentThreadDuration(state)
      ) {
        return "ending";
      }
      return "thread";
    }

    // Default to intro
    return "intro";
  }

  /**
   * Determine the next beat type based on current state
   */
  determineNextBeatType(state: StoryState): BeatType {
    const lastBeatType = this.getCurrentBeatType(state);
    let nextBeatType: BeatType = "intro";

    if (lastBeatType === "intro") {
      nextBeatType = "switch";
    } else if (lastBeatType === "switch") {
      nextBeatType = "thread";
    } else if (
      lastBeatType === "thread" &&
      this.isCurrentThreadResolved(state)
    ) {
      // Check if we should end the story
      const playerManager = new PlayerManager(state);
      const currentTurn = playerManager.getCurrentTurn(state);
      if (currentTurn >= state.maxTurns) {
        nextBeatType = "ending";
      } else {
        nextBeatType = "switch";
      }
    } else if (lastBeatType === "thread") {
      nextBeatType = "thread";
    }

    console.log("[ThreadManager] Next beat type:", nextBeatType);
    return nextBeatType;
  }

  /**
   * Get the current thread analysis from story phases
   */
  getCurrentThreadAnalysis(state: StoryState): ThreadAnalysis | null {
    const currentPhase = state.storyPhases[state.storyPhases.length - 1];
    return this.isThreadAnalysis(currentPhase) ? currentPhase : null;
  }

  /**
   * Check if a phase is a ThreadAnalysis
   */
  private isThreadAnalysis(phase: any): phase is ThreadAnalysis {
    if (!phase) return false;
    return "threads" in phase;
  }

  /**
   * Check if a phase is a SwitchAnalysis
   */
  private isSwitchAnalysis(phase: any): boolean {
    if (!phase) return false;
    return "switches" in phase;
  }

  /**
   * Get the duration of the current thread
   */
  getCurrentThreadDuration(state: StoryState): number {
    const threadAnalysis = this.getCurrentThreadAnalysis(state);
    return threadAnalysis ? threadAnalysis.duration : 0;
  }

  /**
   * Get the number of completed beats in the current thread
   */
  getCurrentThreadBeatsCompleted(state: StoryState): number {
    const threadAnalysis = this.getCurrentThreadAnalysis(state);
    if (!threadAnalysis || threadAnalysis.threads.length === 0) {
      return 0;
    }

    // All threads in the same ThreadAnalysis have the same number of completed steps
    // So we can just look at the first thread
    const firstThread = threadAnalysis.threads[0];
    return firstThread.progression.filter((step) => step.resolution !== null)
      .length;
  }

  /**
   * Check if the current thread is fully resolved
   */
  isCurrentThreadResolved(state: StoryState): boolean {
    return (
      this.getCurrentThreadBeatsCompleted(state) >=
      this.getCurrentThreadDuration(state)
    );
  }

  /**
   * Get the resolution of the last step for a player in the current thread
   */
  getCurrentThreadLastStepResolution(
    state: StoryState,
    playerSlot: PlayerSlot
  ): Resolution | null {
    const threadAnalysis = this.getCurrentThreadAnalysis(state);
    if (!threadAnalysis || threadAnalysis.threads.length === 0) {
      return null;
    }

    // Find the current thread
    const currentThread = threadAnalysis.threads.find((thread) => {
      // For challenge threads, check if player is in playersSideA
      if (thread.playersSideA.includes(playerSlot)) {
        return true;
      }
      // For contest threads, check if player is in either side
      if (thread.playersSideB.includes(playerSlot)) {
        return true;
      }

      return false;
    });

    if (!currentThread) {
      return null;
    }

    // Get the last completed step
    const completedSteps = currentThread.progression.filter(
      (step) => step.resolution !== null
    );

    if (completedSteps.length === 0) {
      return null;
    }

    const lastStep = completedSteps[completedSteps.length - 1];

    // For contest threads, map the resolution based on which side the player is on
    if (currentThread.playersSideB.length > 0) {
      // This is a contest thread
      if (currentThread.playersSideA.includes(playerSlot)) {
        // Player is on side A
        switch (lastStep.resolution) {
          case "sideAWins":
            return "favorable";
          case "mixed":
            return "mixed";
          case "sideBWins":
            return "unfavorable";
          default:
            return null;
        }
      } else if (currentThread.playersSideB.includes(playerSlot)) {
        // Player is on side B
        switch (lastStep.resolution) {
          case "sideAWins":
            return "unfavorable";
          case "mixed":
            return "mixed";
          case "sideBWins":
            return "favorable";
          default:
            return null;
        }
      }
    } else {
      // This is a challenge thread, return the resolution directly
      return lastStep.resolution;
    }

    return null;
  }

  /**
   * Update a thread with a resolution for a specific step
   */
  updateThreadResolution(
    state: StoryState,
    thread: Thread,
    resolution: Resolution
  ): StoryState {
    const threadAnalysis = this.getCurrentThreadAnalysis(state);
    if (!threadAnalysis) {
      console.log(
        "[ThreadManager] No thread analysis found to update resolutions"
      );
      return state;
    }

    // Get the current step index that needs to be updated
    const currentStepIndex = this.getCurrentThreadBeatsCompleted(state);

    console.log(
      `[ThreadManager] Updating thread ${thread.id} resolution at step ${
        currentStepIndex + 1
      } to ${resolution}`
    );

    // Update the thread with the resolution
    const updatedThread = this.updateThreadWithResolution(
      thread,
      resolution,
      currentStepIndex
    );

    // Update the thread analysis and story state
    return this.updateThreadInAnalysis(state, updatedThread, threadAnalysis);
  }

  /**
   * Update a thread's milestone text
   */
  updateThreadMilestone(
    state: StoryState,
    thread: Thread,
    milestone: string
  ): StoryState {
    const threadAnalysis = this.getCurrentThreadAnalysis(state);
    if (!threadAnalysis) {
      console.log(
        "[ThreadManager] No thread analysis found to update milestone"
      );
      return state;
    }

    // Update the thread with the milestone
    const updatedThread: Thread = {
      ...thread,
      milestone,
    };

    // Update the thread analysis and story state
    return this.updateThreadInAnalysis(state, updatedThread, threadAnalysis);
  }

  /**
   * Helper to update a thread with a resolution at a specific step
   */
  private updateThreadWithResolution(
    thread: Thread,
    resolution: Resolution,
    stepIndex: number
  ): Thread {
    // Create a new progression array with the updated step
    const updatedProgression = [...thread.progression];
    if (stepIndex >= 0 && stepIndex < updatedProgression.length) {
      updatedProgression[stepIndex] = {
        ...updatedProgression[stepIndex],
        resolution,
      };
    }

    // Create updated thread with the new progression
    return {
      ...thread,
      progression: updatedProgression,
      // If this is the last step, also update the thread's overall resolution
      resolution:
        stepIndex === thread.progression.length - 1
          ? resolution
          : thread.resolution,
    };
  }

  /**
   * Helper to update a thread in the current thread analysis
   */
  private updateThreadInAnalysis(
    state: StoryState,
    thread: Thread,
    threadAnalysis: ThreadAnalysis
  ): StoryState {
    // Create updated thread analysis with the updated thread
    const updatedThreadAnalysis: ThreadAnalysis = {
      ...threadAnalysis,
      threads: threadAnalysis.threads.map((t) =>
        t.id === thread.id ? thread : t
      ),
    };

    // Replace the current thread analysis in the story phases
    const updatedStoryPhases = [...state.storyPhases];
    const currentPhaseIndex = updatedStoryPhases.length - 1;

    if (currentPhaseIndex >= 0) {
      updatedStoryPhases[currentPhaseIndex] = updatedThreadAnalysis;
    }

    // Update the state with the new story phases
    return {
      ...state,
      storyPhases: updatedStoryPhases,
    };
  }

  /**
   * Get the beat texts for each player in a thread
   */
  getThreadBeatTexts(
    state: StoryState,
    thread: Thread
  ): Record<string, Beat[]> {
    const result: Record<string, Beat[]> = {};
    const playerManager = new PlayerManager(state);

    // Collect beat texts for all players in the thread
    [...thread.playersSideA, ...thread.playersSideB].forEach((playerSlot) => {
      const playerState = playerManager.getPlayer(state, playerSlot);
      if (!playerState) return;

      // Get the beat history for this player
      const beatHistory = playerState.beatHistory || [];

      // Find the beats that belong to this thread
      // This is a simplification - in a real implementation, you would need to
      // match beats to thread steps more precisely
      result[playerSlot] = beatHistory.slice(-thread.duration);
    });

    return result;
  }

  /**
   * Get the last beat text for each player in a thread
   */
  getThreadLastBeatTexts(
    state: StoryState,
    thread: Thread
  ): Record<string, Beat | null> {
    const result: Record<string, Beat | null> = {};
    const threadBeatTexts = this.getThreadBeatTexts(state, thread);

    Object.entries(threadBeatTexts).forEach(([playerSlot, beats]) => {
      result[playerSlot] = beats.length > 0 ? beats[beats.length - 1] : null;
    });

    return result;
  }

  /**
   * Get the type of the current thread (challenge, contest, or exploration)
   */
  getCurrentThreadType(state: StoryState): ThreadType | null {
    const threadAnalysis = this.getCurrentThreadAnalysis(state);
    if (!threadAnalysis || threadAnalysis.threads.length === 0) {
      return null;
    }

    // Get the first thread from the current analysis
    // All threads in the same analysis should be of the same type
    const currentThread = threadAnalysis.threads[0];
    return getThreadType(currentThread);
  }
}

// Helper import for PlayerManager - put at the end to avoid circular dependency
import { PlayerManager } from "./PlayerManager.js";
