import { GameModes } from "core/types";
import type { Beat, ClientStoryState, PlayerState } from "core/types";
import type { GameSessionContextType } from "../../src/game/GameSessionContext";

/** A beat with the given title; choice -1 means the player has not chosen yet. */
export function beat(title: string, choice = 0): Beat {
  return {
    plan: {
      forPlayer: "player1 - Suzie",
      developmentsToNarrate: "",
      beatTypeConsiderations: "",
      otherBeats: "single-player",
      worldBuilding: "",
      newGameElements: [],
      showDontTellPreviousDecision: "",
      showDontTell: [],
      newIntroductionsOfStoryElements: [],
      establishedFacts: [],
      optionConsiderations: "",
    },
    title,
    text: `Text of ${title}`,
    summary: "",
    options: [],
    interludes: [],
    choice,
    resolution: null,
  };
}

export function player(
  beatHistory: Beat[] = [],
  identityChoice = 0
): PlayerState {
  return {
    name: "Suzie",
    pronouns: {
      personal: "she",
      object: "her",
      possessive: "her",
      reflexive: "herself",
    },
    appearance: "",
    fluff: "",
    outcomes: [],
    statValues: [],
    knownStoryElements: [],
    beatHistory,
    previousTypesOfThreads: [],
    identityChoice,
    backgroundChoice: 0,
  };
}

export function clientStoryState(
  overrides: Partial<ClientStoryState> = {}
): ClientStoryState {
  return {
    id: "story-1",
    title: "A story",
    gameMode: GameModes.SinglePlayer,
    difficultyLevel: { title: "Balanced", modifier: 0 },
    sharedStats: [],
    sharedStatValues: [],
    playerStats: [],
    players: { player1: player() },
    maxTurns: 10,
    characterSelectionCompleted: true,
    characterSelectionOptions: {},
    characterSelectionIntroduction: { title: "", text: "" },
    generateImages: false,
    images: [],
    pendingPlayers: [],
    gameOver: false,
    ...overrides,
  };
}

/** A game session holding the given story, with no request pending. */
export function gameSession(
  storyState: ClientStoryState
): GameSessionContextType {
  const noop = () => undefined;
  return {
    storyState,
    setStoryState: noop,
    sessionId: "session-1",
    setSessionId: noop,
    isLoading: false,
    setIsLoading: noop,
    storyCodes: null,
    setStoryCodes: noop,
    connectionStale: null,
    setConnectionStale: noop,
    error: null,
    setError: noop,
    rateLimit: null,
    setRateLimit: noop,
    isConnecting: false,
    isRequestPending: () => false,
    isOperationRunning: () => false,
  };
}
