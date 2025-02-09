import { ReactNode, useState } from "react";
import { StoryState } from "../types/story";
import { StoryContext } from "./storyContext";

export function StoryProvider({ children }: { children: ReactNode }) {
  const [storyState, setStoryState] = useState<StoryState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <StoryContext.Provider
      value={{
        storyState,
        setStoryState,
        isLoading,
        setIsLoading,
      }}
    >
      {children}
    </StoryContext.Provider>
  );
}
