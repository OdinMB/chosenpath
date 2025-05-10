import { createContext } from "react";
import type { ClientStoryState, RateLimitInfo } from "core/types";
import { StoredCodeSet } from "../shared/SessionContext";

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
  storedCodeSets: StoredCodeSet[];
}

// Create the context
export const GameSessionContext = createContext<GameSessionContextType | null>(
  null
);
