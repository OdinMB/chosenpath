import { createContext, useContext, useState, useEffect } from "react";
import type { StoryState } from "../../../shared/types/story";
import { wsService } from "../services/WebSocketService";

interface StoryContextType {
  storyState: StoryState | null;
  setStoryState: (state: StoryState | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const [storyState, setStoryState] = useState<StoryState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (sessionId) {
      wsService.connect(sessionId);
      wsService.onMessage("stateUpdate", (data) => {
        setStoryState(data.state);
      });
    } else {
      wsService.disconnect();
    }

    return () => {
      wsService.disconnect();
    };
  }, [sessionId]);

  const value = {
    storyState,
    setStoryState,
    sessionId,
    setSessionId,
    isLoading,
    setIsLoading,
  };

  return (
    <StoryContext.Provider value={value}>{children}</StoryContext.Provider>
  );
}

export function useStory() {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error("useStory must be used within a StoryProvider");
  }
  return context;
}
