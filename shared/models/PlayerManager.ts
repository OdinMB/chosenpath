import {
  StoryState,
  PlayerState,
  PlayerSlot,
  PlayerCount,
  Beat,
  Resolution,
  ResolutionDetails,
} from "shared/types/index.js";
import { replacePronounPlaceholders } from "shared/utils/playerUtils.js";

/**
 * Manages all player-related operations for Story class
 */
export class PlayerManager {
  constructor(state: StoryState) {
    // Initialize if needed
  }

  /**
   * Gets all players from the story state
   */
  getPlayers(state: StoryState): Record<PlayerSlot, PlayerState> {
    return state.players;
  }

  /**
   * Gets a specific player by slot
   */
  getPlayer(state: StoryState, playerSlot: PlayerSlot): PlayerState | null {
    return state.players[playerSlot] || null;
  }

  /**
   * Get the number of players in the story
   */
  getNumberOfPlayers(state: StoryState): PlayerCount {
    return Object.keys(state.players).length as PlayerCount;
  }

  /**
   * Get a list of all player slots
   */
  getPlayerSlots(state: StoryState): PlayerSlot[] {
    return Object.keys(state.players) as PlayerSlot[];
  }

  /**
   * Find a player slot by its unique code
   */
  getPlayerSlotByCode(state: StoryState, code: string): PlayerSlot | null {
    const entry = Object.entries(state.playerCodes).find(
      ([_, playerCode]) => playerCode === code
    );
    return entry ? (entry[0] as PlayerSlot) : null;
  }

  /**
   * Get the current beat for a player
   */
  getCurrentBeat(state: StoryState, playerSlot: PlayerSlot): Beat | null {
    const player = this.getPlayer(state, playerSlot);
    if (!player) return null;
    return player.beatHistory[this.getCurrentTurn(state) - 1] || null;
  }

  /**
   * Get the previous beat for a player
   */
  getPreviousBeat(state: StoryState, playerSlot: PlayerSlot): Beat | null {
    const player = this.getPlayer(state, playerSlot);
    if (!player) return null;
    return player.beatHistory[player.beatHistory.length - 2] || null;
  }

  /**
   * Get the current turn number based on the first player's beat history
   */
  getCurrentTurn(state: StoryState): number {
    // If no players, return 0
    if (Object.keys(state.players).length === 0) {
      return 0;
    }

    // Get the first player's beat history length
    const firstPlayerSlot = Object.keys(state.players)[0] as PlayerSlot;
    return state.players[firstPlayerSlot].beatHistory.length;
  }

  /**
   * Get a list of players who haven't made their choice yet
   */
  getPendingPlayers(state: StoryState): PlayerSlot[] {
    const currentTurn = this.getCurrentTurn(state);
    return Object.entries(state.players)
      .filter(([_, player]) => {
        const currentBeat = player.beatHistory[currentTurn - 1];
        return currentBeat?.choice === -1;
      })
      .map(([slot]) => slot as PlayerSlot);
  }

  /**
   * Get a list of players who haven't selected their character yet
   */
  getPendingCharacterSelections(state: StoryState): PlayerSlot[] {
    // If character selection is completed, return empty array
    if (state.characterSelectionCompleted) {
      return [];
    }

    // Return players who haven't selected a character yet
    return Object.entries(state.players)
      .filter(([_, player]) => !player.characterSelected)
      .map(([slot]) => slot as PlayerSlot);
  }

  /**
   * Check if all players have selected their characters
   */
  areAllCharactersSelected(state: StoryState): boolean {
    const playerSlots = this.getPlayerSlots(state);
    return playerSlots.every(
      (slot) => state.players[slot]?.characterSelected === true
    );
  }

  /**
   * Add a new beat to a player's beat history
   */
  addBeatToPlayer(
    state: StoryState,
    playerSlot: PlayerSlot,
    beat: Beat
  ): StoryState {
    const player = this.getPlayer(state, playerSlot);
    if (!player) return state;

    return {
      ...state,
      players: {
        ...state.players,
        [playerSlot]: {
          ...player,
          beatHistory: [...player.beatHistory, beat],
        } as PlayerState,
      },
    };
  }

  /**
   * Update a player's choice for their current beat
   */
  updateChoice(
    state: StoryState,
    playerSlot: PlayerSlot,
    optionIndex: number
  ): StoryState {
    const player = this.getPlayer(state, playerSlot);
    if (!player) {
      console.log(
        "[PlayerManager] Error: No player found to update choice for " +
          playerSlot
      );
      return state;
    }

    return {
      ...state,
      players: {
        ...state.players,
        [playerSlot]: {
          ...player,
          beatHistory: player.beatHistory.map((beat, index) =>
            index === player.beatHistory.length - 1
              ? { ...beat, choice: optionIndex }
              : beat
          ),
        } as PlayerState,
      },
    };
  }

  /**
   * Update a player's current beat with resolution information
   */
  updateBeatResolution(
    state: StoryState,
    playerSlot: PlayerSlot,
    resolution: Resolution
  ): StoryState {
    const player = this.getPlayer(state, playerSlot);
    if (!player) {
      console.error(`Player ${playerSlot} not found`);
      return state;
    }

    if (!player.beatHistory || player.beatHistory.length === 0) {
      console.error(`No beat history for player ${playerSlot}`);
      return state;
    }

    // Get the current beat (last in history)
    const currentBeatIndex = player.beatHistory.length - 1;
    const updatedBeatHistory = [...player.beatHistory];
    updatedBeatHistory[currentBeatIndex] = {
      ...updatedBeatHistory[currentBeatIndex],
      resolution,
    };

    // Update the player with the new beat history
    return {
      ...state,
      players: {
        ...state.players,
        [playerSlot]: {
          ...player,
          beatHistory: updatedBeatHistory,
        },
      },
    };
  }

  /**
   * Update a player's current beat with resolution visualization details
   */
  updateBeatResolutionDetails(
    state: StoryState,
    playerSlot: PlayerSlot,
    resolutionDetails: ResolutionDetails
  ): StoryState {
    const player = this.getPlayer(state, playerSlot);
    if (!player) {
      console.error(`Player ${playerSlot} not found`);
      return state;
    }

    if (!player.beatHistory || player.beatHistory.length === 0) {
      console.error(`No beat history for player ${playerSlot}`);
      return state;
    }

    // Get the current beat (last in history)
    const currentBeatIndex = player.beatHistory.length - 1;
    const updatedBeatHistory = [...player.beatHistory];
    updatedBeatHistory[currentBeatIndex] = {
      ...updatedBeatHistory[currentBeatIndex],
      resolutionDetails,
    };

    // Update the player with the new beat history
    return {
      ...state,
      players: {
        ...state.players,
        [playerSlot]: {
          ...player,
          beatHistory: updatedBeatHistory,
        },
      },
    };
  }

  /**
   * Update a player with character selection information
   */
  updatePlayerCharacter(
    state: StoryState,
    playerSlot: PlayerSlot,
    identity: any,
    background: any
  ): StoryState {
    const player = this.getPlayer(state, playerSlot);
    if (!player) {
      console.error(`Player ${playerSlot} not found`);
      return state;
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
    return {
      ...state,
      players: {
        ...state.players,
        [playerSlot]: updatedPlayer,
      },
    };
  }
}
