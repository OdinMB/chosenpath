import { createContext, useContext } from "react";
import { StoryState } from "../types/story";

export interface StoryContextType {
  storyState: StoryState | null;
  setStoryState: (state: StoryState | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const StoryContext = createContext<StoryContextType | undefined>(
  undefined
);

export function useStory() {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error("useStory must be used within a StoryProvider");
  }
  return context;
}
