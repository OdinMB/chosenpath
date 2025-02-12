import { createContext } from "react";
import type { StoryState } from "../../../shared/types/story";

interface StoryContextType {
  storyState: StoryState | null;
  setStoryState: (state: StoryState | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const StoryContext = createContext<StoryContextType | undefined>(undefined); 