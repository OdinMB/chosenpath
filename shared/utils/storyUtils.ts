import type { StoryState } from "../types/story.js";
import type { PlayerSlot } from "../types/player.js";
import type { ClientStoryState } from "../types/story.ts";
import type { BeatType } from "../types/beat.js";

/**
 * Get the current turn number (1-based) from the story state
 */
export function getCurrentTurn(state: StoryState): number {
  if (!state.players || Object.keys(state.players).length === 0) {
    return 0;
  }

  // Get the first player's beat history length
  // This represents the current turn (1-based)
  const firstPlayer = Object.values(state.players)[0];
  return firstPlayer.beatHistory.length;
}

export function isFirstBeat(state: StoryState): boolean {
  return getCurrentTurn(state) === 0;
}

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
export function areAllChoicesSubmitted(state: StoryState): boolean {
  // Early return if no players
  if (!state.players || Object.keys(state.players).length === 0) {
    return false;
  }

  // Check each player's current beat
  const result = Object.entries(state.players).every(([_, player]) => {
    const currentBeat = player.beatHistory[player.beatHistory.length - 1];
    return currentBeat && currentBeat.choice !== -1;
  });

  console.log("[areAllChoicesSubmitted] Result:", result);
  return result;
}

export const getPlayerSlotByCode = (
  state: StoryState,
  code: string
): PlayerSlot | null => {
  for (const [slot, playerCode] of Object.entries(state.playerCodes)) {
    if (playerCode === code) {
      return slot as PlayerSlot;
    }
  }
  return null;
};

export const filterStateForPlayer = (
  state: StoryState,
  playerSlot: PlayerSlot
): ClientStoryState => {
  // Create a deep copy to avoid mutating the original state
  const filteredState = JSON.parse(JSON.stringify(state));

  // Only include the specific player's data
  const playerData = state.players[playerSlot];
  // Filter out hidden player stats
  playerData.characterStats = playerData.characterStats.filter(
    (stat) => stat.isVisible !== false
  );
  filteredState.players = { [playerSlot]: playerData };

  // Filter out hidden shared stats
  filteredState.sharedStats = state.sharedStats.filter(
    (stat) => stat.isVisible !== false
  );

  // Get pending players
  const pendingPlayers = getPendingPlayers(state);

  // Remove other players' codes
  filteredState.playerCodes = { [playerSlot]: state.playerCodes[playerSlot] };

  // Pick only the properties we want to send
  const { players, sharedStats, maxTurns, generateImages, images, gameMode } =
    filteredState;

  return {
    numberOfPlayers: Object.keys(state.players).length,
    players,
    gameMode,
    sharedStats,
    maxTurns,
    generateImages,
    images,
    pendingPlayers,
    gameOver: state.currentBeatType === "ending",
  };
};

/**
 * Determine the next beat type based on the current story state
 */
export function determineNextBeatType(state: StoryState): BeatType {
  const lastBeatType = state.currentBeatType;

  let currentBeatType: BeatType = "intro";

  if (lastBeatType === "intro") {
    currentBeatType = "switch";
    // console.log("[StoryUtils] Intro beat = switch");
  } else if (lastBeatType === "switch") {
    currentBeatType = "thread";
    // console.log("[StoryUtils] Last beat was switch, next beat will be thread");
  } else if (
    lastBeatType === "thread" &&
    state.currentThreadMaxBeats === state.currentThreadBeatsCompleted
  ) {
    // Check if we should end the story
    if (getCurrentTurn(state) >= state.maxTurns) {
      currentBeatType = "ending";
      // console.log("[StoryUtils] Max turns reached, ending story");
    } else {
      currentBeatType = "switch";
      // console.log("[StoryUtils] Thread completed, next beat will be switch");
    }
  } else if (lastBeatType === "thread") {
    currentBeatType = "thread";
    // console.log("[StoryUtils] Continuing thread");
  }

  console.log("[StoryUtils] Next beat type:", currentBeatType);
  return currentBeatType;
}
