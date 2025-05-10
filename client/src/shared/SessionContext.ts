import { createContext } from "react";
import type { ContentModerationInfo, RateLimitInfo } from "core/types";

export type StoredCodeSet = {
  codes: Record<string, string>;
  timestamp: number;
  title?: string;
  lastActive: boolean;
};

export type SessionContextType = {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
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
  // Stored code sets
  storedCodeSets: StoredCodeSet[];
  refreshStoredCodeSets: () => void;
  deleteCodeSet: (timestamp: number) => void;
};

export const SessionContext = createContext<SessionContextType>({
  sessionId: null,
  setSessionId: () => {},
  isLoading: false,
  setIsLoading: () => {},
  storyReady: false,
  setStoryReady: () => {},
  error: null,
  setError: () => {},
  rateLimit: null,
  setRateLimit: () => {},
  contentModeration: null,
  setContentModeration: () => {},
  storedCodeSets: [],
  refreshStoredCodeSets: () => {},
  deleteCodeSet: () => {},
});
