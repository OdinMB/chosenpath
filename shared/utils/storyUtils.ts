import type { StoryState } from '../types/story.js';
import type { PlayerSlot } from '../types/players.js';

/**
 * Get the current turn number (1-based) from the story state
 */
export const getCurrentTurn = (state: StoryState): number => {
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