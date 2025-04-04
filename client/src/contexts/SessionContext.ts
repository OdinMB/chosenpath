import { createContext } from "react";
import type { ClientStoryState } from "../../../shared/types/story";
import type { RateLimitInfo } from "../../../shared/types/websocket";

// Interface for story code sets stored in localStorage
export interface StoredCodeSet {
  codes: Record<string, string>;
  timestamp: number;
  title?: string;
  lastActive: boolean;
}

export type SessionContextType = {
  storyState: ClientStoryState | null;
  setStoryState: (state: ClientStoryState | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isConnecting: boolean;
  storyCodes: Record<string, string> | null;
  setStoryCodes: (codes: Record<string, string> | null) => void;
  storyReady: boolean;
  setStoryReady: (ready: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  // Rate limiting
  rateLimit: RateLimitInfo | null;
  setRateLimit: (rateLimit: RateLimitInfo | null) => void;
  // Connection status
  connectionStale: string | null;
  setConnectionStale: (message: string | null) => void;
  // Request status utilities
  isRequestPending: (type: string) => boolean;
  isOperationRunning: (type: string) => boolean;
  // Stored code sets
  storedCodeSets: StoredCodeSet[];
  getStoredCodeSets: () => StoredCodeSet[];
  deleteCodeSet: (timestamp: number) => void;
};

export const SessionContext = createContext<SessionContextType>({
  storyState: null,
  setStoryState: () => {},
  sessionId: null,
  setSessionId: () => {},
  isLoading: false,
  setIsLoading: () => {},
  isConnecting: true,
  storyCodes: null,
  setStoryCodes: () => {},
  storyReady: false,
  setStoryReady: () => {},
  error: null,
  setError: () => {},
  rateLimit: null,
  setRateLimit: () => {},
  connectionStale: null,
  setConnectionStale: () => {},
  isRequestPending: () => false,
  isOperationRunning: () => false,
  storedCodeSets: [],
  getStoredCodeSets: () => [],
  deleteCodeSet: () => {},
});
