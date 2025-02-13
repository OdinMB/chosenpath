import { createContext } from "react";
import type { StoryState } from "../../../shared/types/story";

export type SessionContextType = {
  storyState: StoryState | null;
  setStoryState: (state: StoryState | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isConnecting: boolean;
  storyCodes: Record<string, string> | null;
  error: string | null;
  setError: (error: string | null) => void;
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
  error: null,
  setError: () => {},
}); 