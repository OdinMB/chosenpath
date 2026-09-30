import { createContext } from "react";
import type { ClientStoryState, RateLimitInfo } from "core/types";
import type { TryAgainRequest, TurnFailure } from "./turnFailure";

// Define the GameSessionContext type
export interface GameSessionContextType {
  storyState: ClientStoryState | null;
  setStoryState: (state: ClientStoryState | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  storyCodes: Record<string, string> | null;
  setStoryCodes: (codes: Record<string, string> | null) => void;
  connectionStale: string | null;
  setConnectionStale: (stale: string | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  rateLimit: RateLimitInfo | null;
  setRateLimit: (rateLimit: RateLimitInfo | null) => void;
  isConnecting: boolean;
  isRequestPending: (type: string) => boolean;
  isOperationRunning: (type: string) => boolean;
  /** A turn, choice or character selection that failed, shown where the game waited (TurnFailedNotice) */
  turnFailure: TurnFailure | null;
  /** "Try again": clears the failure and sends what the story is missing; returns what it sent (null with no story on screen) */
  tryAgain: () => TryAgainRequest | null;
  /**
   * The player sends their own choice or character again through the game's
   * controls: the failure notice goes, so its "Try again" can't send the same
   * again beside it (it comes back if that send is rate limited)
   */
  clearTurnFailure: () => void;
}

// Create the context
export const GameSessionContext = createContext<GameSessionContextType | null>(
  null
);
