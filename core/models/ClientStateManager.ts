import {
  StoryState,
  ClientStoryState,
  PlayerSlot,
  Stat,
  ClientStat,
  Beat,
  BeatType,
} from "../types/index.js";

/**
 * Manages client state filtering operations for Story class
 */
export class ClientStateManager {
  constructor() {
    // No initialization needed
  }

  /**
   * Filter the state for a specific player, removing sensitive data
   */
  filterStateForPlayer(
    state: StoryState,
    playerSlot: PlayerSlot,
    currentBeatType: BeatType,
    pendingPlayers: PlayerSlot[],
    pendingCharacterSelections: PlayerSlot[]
  ): ClientStoryState {
    // Create a deep copy to avoid mutating the original state
    let filteredState = JSON.parse(JSON.stringify(state));

    // Only include the specific player's data
    let playerData = filteredState.players[playerSlot];
    // Filter out outcomes if they exist
    if (playerData.outcomes) {
      delete playerData.outcomes;
    }

    // Filter out sensitive data from beat history
    if (playerData.beatHistory && playerData.beatHistory.length > 0) {
      playerData.beatHistory = playerData.beatHistory.map((beat: Beat) => {
        // Create a new filtered beat without sensitive properties
        const { plan, summary, ...filteredBeat } = beat;

        // Filter option details for undecided challenge beats
        if (
          filteredBeat.choice &&
          filteredBeat.choice === -1 &&
          filteredBeat.options &&
          filteredBeat.options.length > 0
        ) {
          filteredBeat.options = filteredBeat.options.map((option) => {
            const optionCopy = { ...option };
            if (optionCopy.optionType === "challenge") {
              // Safe to delete these properties as we're working with a copy
              delete (optionCopy as any).basePoints;
              delete (optionCopy as any).modifiersToSuccessRate;
              delete (optionCopy as any).riskType;
            }
            return optionCopy;
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

    // Remove other players' codes
    filteredState.playerCodes = {
      [playerSlot]: filteredState.playerCodes[playerSlot],
    };

    // Return only the properties needed for the client
    return {
      title: filteredState.title,
      numberOfPlayers: Object.keys(state.players).length,
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
      gameOver: currentBeatType === "ending",
    } as ClientStoryState;
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
}
