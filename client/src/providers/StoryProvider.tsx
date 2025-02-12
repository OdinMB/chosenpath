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
    // Clear any existing handlers
    wsService.clearMessageHandlers();

    // Set up message handlers
    wsService.onMessage("session_created", (data: WSServerMessage) => {
      if (data.type === "session_created" && data.sessionId) {
        console.log('[StoryProvider] Session created:', data.sessionId);
        
        // Clear previous state if this was due to session expiry
        if (data.error === "Previous session expired") {
          console.log('[StoryProvider] Previous session expired, clearing state');
          setStoryState(null);
          localStorage.removeItem('sessionId');
        }
        
        setSessionId(data.sessionId);
        localStorage.setItem('sessionId', data.sessionId);
        wsService.setSessionId(data.sessionId);
      }
    });

    wsService.onMessage("state_update", (data: WSServerMessage) => {
      if (data.type === "state_update" && data.state) {
        console.log('[StoryProvider] Received state update:', {
          currentTurn: data.state.currentTurn,
          beatHistoryLength: data.state.beatHistory.length,
          lastBeat: data.state.beatHistory[data.state.beatHistory.length - 1],
          sessionId: savedSessionId
        });
        setStoryState(data.state);
        setIsLoading(false);
      }
    });

    wsService.onMessage("error", (data: WSServerMessage) => {
      if (data.type === "error") {
        console.error("[StoryProvider] WebSocket error:", data.error);
        setIsLoading(false);
      }
    });

    // Set up connection handler
    wsService.onOpen(() => {
      console.log('[StoryProvider] WebSocket connected, checking for saved session');
      const savedSessionId = localStorage.getItem('sessionId');
      if (savedSessionId) {
        console.log('[StoryProvider] Found saved session:', savedSessionId);
        setSessionId(savedSessionId);
        wsService.sendMessage({ type: "join", sessionId: savedSessionId });
      } else {
        console.log('[StoryProvider] No saved session, creating new one');
        wsService.sendMessage({ type: "create_session" });
      }
    });

    // Connect
    const savedSessionId = localStorage.getItem('sessionId');
    if (savedSessionId) {
      console.log('[StoryProvider] Initializing with saved session:', savedSessionId);
      setSessionId(savedSessionId); // Set sessionId during initial load
    }
    wsService.connect(savedSessionId || undefined);

    // Cleanup on unmount
    return () => {
      wsService.disconnect();
      wsService.clearMessageHandlers();
    };
  }, []); // Empty dependency array

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