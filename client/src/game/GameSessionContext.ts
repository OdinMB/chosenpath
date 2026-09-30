import { createContext } from "react";
import type { ClientStoryState, RateLimitInfo } from "core/types";
import type { TurnFailure } from "./turnFailure";

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
  /** "Try again": clears the failure and sends what the story is missing */
  tryAgain: () => void;
}

// Create the context
export const GameSessionContext = createContext<GameSessionContextType | null>(
  null
);
