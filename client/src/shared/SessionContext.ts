import { createContext } from "react";
import type {
  ClientStoryState,
  ContentModerationInfo,
  RateLimitInfo,
} from "core/types";

export type StoredCodeSet = {
  codes: Record<string, string>;
  timestamp: number;
  title?: string;
  lastActive: boolean;
};

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
  transientStoryCodes: Record<string, string> | null;
  setTransientStoryCodes: (codes: Record<string, string> | null) => void;
  storyReady: boolean;
  setStoryReady: (ready: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  // Rate limiting
  rateLimit: RateLimitInfo | null;
  setRateLimit: (rateLimit: RateLimitInfo | null) => void;
  contentModeration: ContentModerationInfo | null;
  setContentModeration: (
    contentModeration: ContentModerationInfo | null
  ) => void;
  // Request status utilities
  isRequestPending: (type: string) => boolean;
  isOperationRunning: (type: string) => boolean;
  // Stored code sets
  storedCodeSets: StoredCodeSet[];
  refreshStoredCodeSets: () => void;
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
  transientStoryCodes: null,
  setTransientStoryCodes: () => {},
  storyReady: false,
  setStoryReady: () => {},
  error: null,
  setError: () => {},
  rateLimit: null,
  setRateLimit: () => {},
  contentModeration: null,
  setContentModeration: () => {},
  isRequestPending: () => false,
  isOperationRunning: () => false,
  storedCodeSets: [],
  refreshStoredCodeSets: () => {},
  deleteCodeSet: () => {},
});
