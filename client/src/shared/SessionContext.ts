import { createContext } from "react";
import { ExtendedStoryMetadata } from "core/types/api.js";

export type SessionContextType = {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  // Stored code sets - now an array of string arrays
  storedCodeSets: string[][];
  refreshStoredCodeSets: () => void;
  deleteCodeSet: (codeSetToRemove: string[]) => void; // Parameter changed to string[]
  // New story feed properties
  storyFeed: Record<string, ExtendedStoryMetadata>;
  fetchStoryFeed: () => Promise<void>;
  clearStoryFeed: () => void;
};

export const SessionContext = createContext<SessionContextType>({
  sessionId: null,
  setSessionId: () => {},
  isLoading: false,
  setIsLoading: () => {},
  storedCodeSets: [], // Default to empty array of arrays
  refreshStoredCodeSets: () => {},
  deleteCodeSet: () => {}, // Parameter changed
  // Default values for new story feed properties
  storyFeed: {},
  fetchStoryFeed: async () => {},
  clearStoryFeed: () => {},
});
