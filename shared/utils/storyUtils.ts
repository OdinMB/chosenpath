import type { StoryState } from '../types/story.js';
import type { PlayerSlot } from '../types/players.js';
import type { ClientStoryState } from '../types/story.ts';

/**
 * Get the current turn number (1-based) from the story state
 */
export const getCurrentTurn = (state: StoryState | ClientStoryState): number => {
  // Get the maximum length of any player's beat history
  return Math.max(
    ...Object.values(state.players).map(p => p.beatHistory.length),
    0
  ) + 1;
};

/**
 * Check if the story has reached its maximum turns
 */
export const isStoryComplete = (state: StoryState): boolean => {
  return getCurrentTurn(state) > state.maxTurns;
};

/**
 * Get players who haven't submitted a choice for the current turn
 */
export const getPendingPlayers = (state: StoryState): PlayerSlot[] => {
  const currentTurn = getCurrentTurn(state);
  return Object.entries(state.players)
    .filter(([_, player]) => {
      const currentBeat = player.beatHistory[currentTurn - 1];
      return currentBeat?.choice === -1;
    })
    .map(([slot]) => slot as PlayerSlot);
};

/**
 * Check if all players have submitted their choices for the current turn
 */
export const areAllChoicesSubmitted = (state: StoryState): boolean => {
  return getPendingPlayers(state).length === 0;
};

export const getPlayerSlotByCode = (state: StoryState, code: string): PlayerSlot | null => {
  for (const [slot, playerCode] of Object.entries(state.playerCodes)) {
    if (playerCode === code) {
      return slot as PlayerSlot;
    }
  }
  return null;
};

export const filterStateForPlayer = (state: StoryState, playerSlot: PlayerSlot): ClientStoryState => {
  // Create a deep copy to avoid mutating the original state
  const filteredState = JSON.parse(JSON.stringify(state));

  // Only include the specific player's data
  const playerData = state.players[playerSlot];
  // Filter out hidden player stats
  playerData.characterStats = playerData.characterStats.filter(stat => stat.isVisible !== false);
  filteredState.players = { [playerSlot]: playerData };

  // Filter out hidden world stats
  filteredState.worldStats = state.worldStats.filter(stat => stat.isVisible !== false);
  
  // Remove other players' codes
  filteredState.playerCodes = { [playerSlot]: state.playerCodes[playerSlot] };

  // Remove server-only properties by picking only the properties we want to send
  const {
    players,
    worldStats,
    maxTurns,
    generateImages,
    images
  } = filteredState;

  return {
    players,
    worldStats,    
    maxTurns,
    generateImages,
    images
  };
};