import { useState, useEffect } from "react";
import type { StoryState } from "../../../shared/types/story";
import type { WSServerMessage } from "../../../shared/types/websocket";
import { wsService } from "../services/WebSocketService";
import { StoryContext } from "../contexts/StoryContext";

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const [storyState, setStoryState] = useState<StoryState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    wsService.clearMessageHandlers();

    wsService.onMessage("session_created", (data: WSServerMessage) => {
      if (data.type === "session_created" && data.sessionId) {
        console.log('[StoryProvider] Session created:', data.sessionId);
        setSessionId(data.sessionId);
        localStorage.setItem('sessionId', data.sessionId);
        wsService.setSessionId(data.sessionId);
      }
    });

    wsService.onMessage("state_update", (data: WSServerMessage) => {
      if (data.type === "state_update" && data.state) {
        console.log('[StoryProvider] Received state update:', {
          state: data.state
        });
        setStoryState(data.state);
        setIsLoading(false);
      }
    });

    wsService.onMessage("exit_story_response", (data: WSServerMessage) => {
      if (data.type === "exit_story_response") {
        console.log('[StoryProvider] Story exit confirmed');
        setStoryState(null);
        setSessionId(null);
        localStorage.removeItem('sessionId');
      }
    });

    wsService.onMessage("error", (data: WSServerMessage) => {
      if (data.type === "error") {
        console.error("[StoryProvider] WebSocket error:", data.error);
        setIsLoading(false);
      }
    });

    // Connect to WebSocket
    const savedSessionId = localStorage.getItem('sessionId');
    wsService.connect(savedSessionId || undefined);

    return () => {
      wsService.disconnect();
      wsService.clearMessageHandlers();
    };
  }, []); // Only run once on mount

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