import {
  StoryState,
  ClientStoryState,
  GameMode,
  Guidelines,
  StoryPhase,
  PlayerState,
} from "shared/types/story.js";
import { PlayerCount, PlayerSlot } from "shared/types/player.js";
import { StoryElement } from "shared/types/storyElement.js";
import { Outcome } from "shared/types/outcome.js";
import { Stat, ClientStat } from "shared/types/stat.js";
import { Beat, BeatType, ResolutionDetails } from "shared/types/beat.js";
import { SwitchAnalysis } from "shared/types/switch.js";
import { ThreadAnalysis, Thread, Resolution } from "shared/types/thread.js";
import { Image } from "shared/types/image.js";
import { Change } from "shared/types/change.js";
import { ChangeService } from "./ChangeService.js";
import { replacePronounPlaceholders } from "shared/utils/playerUtils.js";

/**
 * Comprehensive manager for story state
 * Encapsulates all story state management logic and provides a clean interface
 */
export class Story {
  private state: StoryState;
  private static changeService = new ChangeService();

  constructor(state: StoryState) {
    this.state = state;
  }
  static create(state: StoryState): Story {
    return new Story(state);
  }
  clone(updatedState: Partial<StoryState> = {}): Story {
    return new Story({
      ...this.state,
      ...updatedState,
    });
  }

  applyStoryChanges(changes: Change[]): Story {
    return Story.changeService.applyChanges(this, changes);
  }

  getTitle(): string {
    return this.state.title;
  }
  getState(): StoryState {
    return this.state;
  }
  getGameMode(): GameMode {
    return this.state.gameMode;
  }
  getGuidelines(): Guidelines {
    return this.state.guidelines;
  }
  getStoryElements(): StoryElement[] {
    return this.state.storyElements;
  }
  getWorldFacts(): string[] {
    return this.state.worldFacts;
  }
  getSharedOutcomes(): Outcome[] {
    return this.state.sharedOutcomes;
  }

  /**
   * Get an outcome by its ID from both shared outcomes and player outcomes
   * @param outcomeId The ID of the outcome to retrieve
   * @returns The outcome with the specified ID, or null if not found
   */
  getOutcomeById(outcomeId: string): Outcome | null {
    // First check shared outcomes
    const sharedOutcome = this.state.sharedOutcomes.find(
      (outcome) => outcome.id === outcomeId
    );
    if (sharedOutcome) {
      return sharedOutcome;
    }

    // Then check player outcomes
    for (const playerSlot of Object.keys(this.state.players) as PlayerSlot[]) {
      const player = this.state.players[playerSlot];
      if (player.outcomes) {
        const playerOutcome = player.outcomes.find(
          (outcome) => outcome.id === outcomeId
        );
        if (playerOutcome) {
          return playerOutcome;
        }
      }
    }

    return null;
  }

  getSharedStats(): Stat[] {
    return this.state.sharedStats;
  }
  getImages(): Image[] {
    return this.state.images;
  }
  getPlayerCodes(): Record<PlayerSlot, string> {
    return this.state.playerCodes;
  }
  getPlayerSlots(): PlayerSlot[] {
    return Object.keys(this.state.players) as PlayerSlot[];
  }
  getNumberOfPlayers(): PlayerCount {
    return Object.keys(this.state.players).length as PlayerCount;
  }
  getPlayers(): Record<PlayerSlot, PlayerState> {
    return this.state.players;
  }
  getPlayer(playerSlot: PlayerSlot): PlayerState | null {
    return this.state.players[playerSlot] || null;
  }

  getCurrentBeat(playerSlot: PlayerSlot): Beat | null {
    const player = this.getPlayer(playerSlot);
    if (!player) return null;
    return player.beatHistory[this.getCurrentTurn() - 1] || null;
  }
  getPreviousBeat(playerSlot: PlayerSlot): Beat | null {
    const player = this.getPlayer(playerSlot);
    if (!player) return null;
    return player.beatHistory[player.beatHistory.length - 2] || null;
  }

  includesImages(): boolean {
    return this.state.generateImages;
  }

  getCurrentTurn(): number {
    // If no players, return 0
    if (Object.keys(this.state.players).length === 0) {
      return 0;
    }

    // Get the first player's beat history length
    const firstPlayerSlot = Object.keys(this.state.players)[0] as PlayerSlot;
    return this.state.players[firstPlayerSlot].beatHistory.length;
  }
  getMaxTurns(): number {
    return this.state.maxTurns;
  }
  isFirstBeat(): boolean {
    return this.getCurrentTurn() === 0;
  }
  isStoryComplete(): boolean {
    return this.getCurrentTurn() > this.state.maxTurns;
  }

  isMultiplayer(): boolean {
    return this.getNumberOfPlayers() > 1;
  }

  getPendingPlayers(): PlayerSlot[] {
    const currentTurn = this.getCurrentTurn();
    return Object.entries(this.state.players)
      .filter(([_, player]) => {
        const currentBeat = player.beatHistory[currentTurn - 1];
        return currentBeat?.choice === -1;
      })
      .map(([slot]) => slot as PlayerSlot);
  }

  getPendingCharacterSelections(): PlayerSlot[] {
    // If character selection is completed, return empty array
    if (this.state.characterSelectionCompleted) {
      return [];
    }

    // Return players who haven't selected a character yet
    return Object.entries(this.state.players)
      .filter(([_, player]) => !player.characterSelected)
      .map(([slot]) => slot as PlayerSlot);
  }

  areAllChoicesSubmitted(): boolean {
    return this.getPendingPlayers().length === 0;
  }

  getPlayerSlotByCode(code: string): PlayerSlot | null {
    const entry = Object.entries(this.state.playerCodes).find(
      ([_, playerCode]) => playerCode === code
    );
    return entry ? (entry[0] as PlayerSlot) : null;
  }

  /**
   * Convert a Stat to a ClientStat by removing sensitive fields
   */
  private convertToClientStat(stat: Stat): ClientStat {
    const {
      adjustmentsAfterThreads,
      canBeChangedInBeatResolutions,
      effectOnPoints,
      narrativeImplications,
      optionsToSacrifice,
      optionsToGainAsReward,
      possibleValues,
      ...clientStat
    } = stat;

    return clientStat as ClientStat;
  }

  filterStateForPlayer(playerSlot: PlayerSlot): ClientStoryState {
    // Create a deep copy to avoid mutating the original state
    let filteredState = JSON.parse(JSON.stringify(this.state));

    // Only include the specific player's data
    let playerData = filteredState.players[playerSlot];
    // Filter out outcomes if they exist
    if (playerData.outcomes) {
      delete playerData.outcomes;
    }
    // Filter out sensitive data from beat history
    if (playerData.beatHistory && playerData.beatHistory.length > 0) {
      playerData.beatHistory = playerData.beatHistory.map((beat) => {
        const filteredBeat = { ...beat };

        // Remove plan and summary from beats
        delete filteredBeat.plan;
        delete filteredBeat.summary;

        // Filter options if they exist
        if (filteredBeat.options && filteredBeat.options.length > 0) {
          filteredBeat.options = filteredBeat.options.map((option) => {
            const filteredOption = { ...option };

            // Remove statConsequences from all option types
            delete filteredOption.statConsequences;

            // Remove properties specific to challenge options
            if (filteredOption.optionType === "challenge") {
              delete filteredOption.basePoints;
              delete filteredOption.modifiersToSuccessRate;
              delete filteredOption.riskType;
            }

            return filteredOption;
          });
        }

        return filteredBeat;
      });
    }
    filteredState.players = { [playerSlot]: playerData };

    // Filter out hidden player stats and certain stat attributes
    filteredState.playerStats = filteredState.playerStats
      .filter((stat: Stat) => stat.isVisible !== false)
      .map((stat: Stat) => this.convertToClientStat(stat));

    // Filter out hidden shared stats and certain stat attributes
    filteredState.sharedStats = filteredState.sharedStats
      .filter((stat: Stat) => stat.isVisible !== false)
      .map((stat: Stat) => this.convertToClientStat(stat));

    // Filter characterSelectionOptions to only include data for this player
    if (filteredState.characterSelectionOptions) {
      filteredState.characterSelectionOptions = {
        [playerSlot]: filteredState.characterSelectionOptions[playerSlot],
      };
    }

    // Get pending players
    const pendingPlayers = this.getPendingPlayers();

    // Get pending character selections if in character selection mode
    const pendingCharacterSelections =
      !filteredState.characterSelectionCompleted
        ? this.getPendingCharacterSelections()
        : [];

    // Remove other players' codes
    filteredState.playerCodes = {
      [playerSlot]: filteredState.playerCodes[playerSlot],
    };

    // Return only the properties needed for the client
    return {
      title: filteredState.title,
      numberOfPlayers: Object.keys(this.state.players).length,
      gameMode: filteredState.gameMode,
      sharedStats: filteredState.sharedStats,
      sharedStatValues: filteredState.sharedStatValues,
      playerStats: filteredState.playerStats,
      players: filteredState.players,
      maxTurns: filteredState.maxTurns,
      characterSelectionCompleted: filteredState.characterSelectionCompleted,
      characterSelectionOptions: filteredState.characterSelectionOptions,
      characterSelectionIntroduction:
        filteredState.characterSelectionIntroduction,
      generateImages: filteredState.generateImages,
      images: filteredState.images,
      pendingPlayers: filteredState.characterSelectionCompleted
        ? pendingPlayers
        : pendingCharacterSelections,
      gameOver: this.getCurrentBeatType() === "ending",
    } as ClientStoryState;
  }

  getCurrentPhase(): StoryPhase | null {
    if (this.state.storyPhases.length === 0) {
      return null;
    }
    return this.state.storyPhases[this.state.storyPhases.length - 1];
  }
  getPreviousPhase(): StoryPhase | null {
    if (this.state.storyPhases.length < 2) {
      return null;
    }
    return this.state.storyPhases[this.state.storyPhases.length - 2];
  }
  getCurrentBeatType(): BeatType | null {
    // If there are no phases, return intro
    if (this.state.storyPhases.length === 0) {
      return "intro";
    }

    const currentPhase = this.getCurrentPhase();

    // If the current phase is a SwitchAnalysis, return switch
    if (this.isSwitchAnalysis(currentPhase)) {
      return "switch";
    }

    // If the current phase is a ThreadAnalysis, return thread
    if (this.isThreadAnalysis(currentPhase)) {
      // If we've reached the max turns, return ending
      if (
        this.getCurrentTurn() >= this.state.maxTurns &&
        this.getCurrentThreadBeatsCompleted() >= this.getCurrentThreadDuration()
      ) {
        return "ending";
      }
      return "thread";
    }

    // Default to intro
    return "intro";
  }
  determineNextBeatType(): BeatType {
    const lastBeatType = this.getCurrentBeatType();

    let nextBeatType: BeatType = "intro";

    if (lastBeatType === "intro") {
      nextBeatType = "switch";
    } else if (lastBeatType === "switch") {
      nextBeatType = "thread";
    } else if (lastBeatType === "thread" && this.isCurrentThreadResolved()) {
      // Check if we should end the story
      if (this.getCurrentTurn() >= this.state.maxTurns) {
        nextBeatType = "ending";
      } else {
        nextBeatType = "switch";
      }
    } else if (lastBeatType === "thread") {
      nextBeatType = "thread";
    }

    console.log("[Story] Next beat type:", nextBeatType);
    return nextBeatType;
  }
  private isSwitchAnalysis(phase: StoryPhase | null): phase is SwitchAnalysis {
    if (!phase) return false;
    return "switches" in phase;
  }
  private isThreadAnalysis(phase: StoryPhase | null): phase is ThreadAnalysis {
    if (!phase) return false;
    return "threads" in phase;
  }
  getCurrentSwitchAnalysis(): SwitchAnalysis | null {
    const currentPhase = this.getCurrentPhase();
    return this.isSwitchAnalysis(currentPhase) ? currentPhase : null;
  }
  getCurrentThreadAnalysis(): ThreadAnalysis | null {
    const currentPhase = this.getCurrentPhase();
    return this.isThreadAnalysis(currentPhase) ? currentPhase : null;
  }
  getPreviousThreadAnalysis(): ThreadAnalysis | null {
    // Look through phases in reverse order to find the most recent ThreadAnalysis
    // that isn't the current phase
    const currentPhase = this.getCurrentPhase();

    for (let i = this.state.storyPhases.length - 2; i >= 0; i--) {
      const phase = this.state.storyPhases[i];
      if (this.isThreadAnalysis(phase) && phase !== currentPhase) {
        return phase;
      }
    }

    return null;
  }

  getCurrentThreadDuration(): number {
    const threadAnalysis = this.getCurrentThreadAnalysis();
    return threadAnalysis ? threadAnalysis.duration : 0;
  }
  getCurrentThreadBeatsCompleted(): number {
    const threadAnalysis = this.getCurrentThreadAnalysis();
    if (!threadAnalysis || threadAnalysis.threads.length === 0) {
      return 0;
    }

    // All threads in the same ThreadAnalysis have the same number of completed steps
    // So we can just look at the first thread
    const firstThread = threadAnalysis.threads[0];
    return firstThread.progression.filter((step) => step.resolution !== null)
      .length;
  }
  getCurrentThreadLastStepResolution(
    playerSlot: PlayerSlot
  ): Resolution | null {
    const threadAnalysis = this.getCurrentThreadAnalysis();
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
  isCurrentThreadResolved(): boolean {
    return (
      this.getCurrentThreadBeatsCompleted() >= this.getCurrentThreadDuration()
    );
  }

  addPhase(phase: StoryPhase): Story {
    const updatedState = {
      ...this.state,
      storyPhases: [...this.state.storyPhases, phase],
    };
    return new Story(updatedState);
  }

  /**
   * Updates the current thread analysis with resolved threads
   * @param thread The thread to update
   * @param resolution The resolution of the thread
   * @returns Updated Story instance
   */
  updateThreadResolution(thread: Thread, resolution: Resolution): Story {
    const threadAnalysis = this.getCurrentThreadAnalysis();
    if (!threadAnalysis) {
      console.log("[Story] No thread analysis found to update resolutions");
      return this;
    }

    // Get the current step index that needs to be updated
    const currentStepIndex = this.getCurrentThreadBeatsCompleted();

    console.log(
      `[Story] Updating thread ${thread.id} resolution at step ${
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
    return this.updateThreadInAnalysis(updatedThread, threadAnalysis);
  }

  updateThreadMilestone(thread: Thread, milestone: string): Story {
    const threadAnalysis = this.getCurrentThreadAnalysis();
    if (!threadAnalysis) {
      console.log("[Story] No thread analysis found to update milestone");
      return this;
    }

    // Update the thread with the milestone
    const updatedThread: Thread = {
      ...thread,
      milestone,
    };

    // Update the thread analysis and story state
    return this.updateThreadInAnalysis(updatedThread, threadAnalysis);
  }

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
   * Helper method to update a thread in the current thread analysis
   * @param thread The updated thread
   * @param threadAnalysis The current thread analysis
   * @returns Updated Story instance
   */
  private updateThreadInAnalysis(
    thread: Thread,
    threadAnalysis: ThreadAnalysis
  ): Story {
    // Create updated thread analysis with the updated thread
    const updatedThreadAnalysis: ThreadAnalysis = {
      ...threadAnalysis,
      threads: threadAnalysis.threads.map((t) =>
        t.id === thread.id ? thread : t
      ),
    };

    // Replace the current thread analysis in the story phases
    const updatedStoryPhases = [...this.state.storyPhases];
    const currentPhaseIndex = updatedStoryPhases.length - 1;

    if (currentPhaseIndex >= 0) {
      updatedStoryPhases[currentPhaseIndex] = updatedThreadAnalysis;
    }

    // Update the state with the new story phases
    const updatedState = {
      ...this.state,
      storyPhases: updatedStoryPhases,
    };

    return new Story(updatedState);
  }

  updatePlayers(players: Record<PlayerSlot, any>): Story {
    return new Story({
      ...this.state,
      players,
    });
  }

  applyChanges(updatedState: Partial<StoryState>): Story {
    return new Story({
      ...this.state,
      ...updatedState,
    });
  }

  addBeatToPlayer(playerSlot: PlayerSlot, beat: Beat): Story {
    const player = this.state.players[playerSlot];
    return new Story({
      ...this.state,
      players: {
        ...this.state.players,
        [playerSlot]: {
          ...player,
          beatHistory: [...player.beatHistory, beat],
        } as PlayerState,
      },
    });
  }

  updateChoice(playerSlot: PlayerSlot, optionIndex: number): Story {
    const player = this.getPlayer(playerSlot);
    if (!player) {
      console.log(
        "[Story] Error: No player found to update choice for " + playerSlot
      );
      return this;
    }

    return new Story({
      ...this.state,
      players: {
        ...this.state.players,
        [playerSlot]: {
          ...player,
          beatHistory: player.beatHistory.map((beat, index) =>
            index === player.beatHistory.length - 1
              ? { ...beat, choice: optionIndex }
              : beat
          ),
        } as PlayerState,
      },
    });
  }

  updateBeatResolution(playerSlot: PlayerSlot, resolution: Resolution): Story {
    const player = this.getPlayer(playerSlot);
    if (!player) {
      console.error(`Player ${playerSlot} not found`);
      return this;
    }

    if (!player.beatHistory || player.beatHistory.length === 0) {
      console.error(`No beat history for player ${playerSlot}`);
      return this;
    }

    // Get the current beat (last in history)
    const currentBeatIndex = player.beatHistory.length - 1;
    const updatedBeatHistory = [...player.beatHistory];
    updatedBeatHistory[currentBeatIndex] = {
      ...updatedBeatHistory[currentBeatIndex],
      resolution,
    };

    // Update the player with the new beat history
    const updatedPlayers = {
      ...this.state.players,
      [playerSlot]: {
        ...player,
        beatHistory: updatedBeatHistory,
      },
    };

    return this.clone({
      players: updatedPlayers,
    });
  }

  /**
   * Update the current beat with resolution details for visualization
   * @param playerSlot The player slot
   * @param resolutionDetails Details about the resolution including distribution and roll
   * @returns Updated Story instance
   */
  updateBeatResolutionDetails(
    playerSlot: PlayerSlot,
    resolutionDetails: ResolutionDetails
  ): Story {
    const player = this.getPlayer(playerSlot);
    if (!player) {
      console.error(`Player ${playerSlot} not found`);
      return this;
    }

    if (!player.beatHistory || player.beatHistory.length === 0) {
      console.error(`No beat history for player ${playerSlot}`);
      return this;
    }

    // Get the current beat (last in history)
    const currentBeatIndex = player.beatHistory.length - 1;
    const updatedBeatHistory = [...player.beatHistory];
    updatedBeatHistory[currentBeatIndex] = {
      ...updatedBeatHistory[currentBeatIndex],
      resolutionDetails,
    };

    // Update the player with the new beat history
    const updatedPlayers = {
      ...this.state.players,
      [playerSlot]: {
        ...player,
        beatHistory: updatedBeatHistory,
      },
    };

    return this.clone({
      players: updatedPlayers,
    });
  }

  /**
   * Add a new image to the story's image library
   * @param image The image to add
   * @returns Updated Story instance
   */
  addImage(image: Image): Story {
    return new Story({
      ...this.state,
      images: [...this.state.images, image],
    });
  }

  /**
   * Update an existing image in the story's image library
   * @param imageId ID of the image to update
   * @param updates Partial image object with fields to update
   * @returns Updated Story instance
   */
  updateImage(imageId: string, updates: Partial<Image>): Story {
    return new Story({
      ...this.state,
      images: this.state.images.map((image) =>
        image.id === imageId
          ? {
              ...image,
              ...updates,
              status: updates.url ? "ready" : image.status,
            }
          : image
      ),
    });
  }

  /**
   * Set the image for a player's current beat
   * @param playerSlot The player slot
   * @param imageId ID of the image to associate with the beat
   * @returns Updated Story instance
   */
  setCurrentBeatImage(playerSlot: PlayerSlot, imageId: string): Story {
    const player = this.getPlayer(playerSlot);
    if (!player) return this;

    const currentTurn = this.getCurrentTurn();
    if (currentTurn <= 0) return this;

    return new Story({
      ...this.state,
      players: {
        ...this.state.players,
        [playerSlot]: {
          ...player,
          beatHistory: player.beatHistory.map((beat, index) =>
            index === player.beatHistory.length - 1
              ? { ...beat, imageId }
              : beat
          ),
        },
      },
    });
  }

  /**
   * Gets the beat texts for a specific thread
   * @param thread The thread to get beat texts for
   * @returns A record mapping player slots to their beat history for this thread
   */
  getThreadBeatTexts(thread: Thread): Record<string, Beat[]> {
    const result: Record<string, Beat[]> = {};

    // Collect beat texts for all players in the thread
    [...thread.playersSideA, ...thread.playersSideB].forEach((playerSlot) => {
      const playerState = this.getPlayer(playerSlot);
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
   * Gets the last beat text for each player in a thread
   * @param thread The thread to get the last beat text for
   * @returns A record mapping player slots to their last beat in this thread
   */
  getThreadLastBeatTexts(thread: Thread): Record<string, Beat | null> {
    const result: Record<string, Beat | null> = {};
    const threadBeatTexts = this.getThreadBeatTexts(thread);

    Object.entries(threadBeatTexts).forEach(([playerSlot, beats]) => {
      result[playerSlot] = beats.length > 0 ? beats[beats.length - 1] : null;
    });

    return result;
  }

  updatePlayerCharacter(
    playerSlot: PlayerSlot,
    identity: any,
    background: any
  ): Story {
    const player = this.getPlayer(playerSlot);
    if (!player) {
      console.error(`Player ${playerSlot} not found`);
      return this;
    }

    // Update player with selected character information
    const updatedPlayer = {
      ...player,
      name: identity.name,
      pronouns: identity.pronouns,
      appearance: identity.appearance,
      fluff: replacePronounPlaceholders(background.fluffTemplate, identity),
      statValues: background.initialPlayerStatValues,
      characterSelected: true,
    };

    // Update the players object with the updated player
    const updatedPlayers = {
      ...this.state.players,
      [playerSlot]: updatedPlayer,
    };

    return this.clone({
      players: updatedPlayers,
    });
  }

  areAllCharactersSelected(): boolean {
    const playerSlots = this.getPlayerSlots();
    return playerSlots.every(
      (slot) => this.getPlayer(slot)?.characterSelected === true
    );
  }

  completeCharacterSelection(): Story {
    return this.clone({
      characterSelectionCompleted: true,
    });
  }
}
