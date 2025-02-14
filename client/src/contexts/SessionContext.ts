import { createContext } from "react";
import type { ClientStoryState } from "../../../shared/types/story";

export type SessionContextType = {
  storyState: ClientStoryState | null;
  setStoryState: (state: ClientStoryState | null) => void;
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