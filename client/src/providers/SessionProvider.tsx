import { useState, useEffect } from "react";
import type { ClientStoryState } from "../../../shared/types/story";
import type { WSServerMessage } from "../../../shared/types/websocket";
import { wsService } from "../services/WebSocketService.js";
import { SessionContext } from "../contexts/SessionContext.js";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [storyState, setStoryState] = useState<ClientStoryState | null>(null);
  const [storyCodes, setStoryCodes] = useState<Record<string, string> | null>(
    null
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wsService.clearMessageHandlers();

    wsService.onMessage("session_created", (data: WSServerMessage) => {
      if (data.type === "session_created" && data.sessionId) {
        console.log("[SessionProvider] Session created:", data.sessionId);
        setSessionId(data.sessionId);
        localStorage.setItem("sessionId", data.sessionId);
        wsService.setSessionId(data.sessionId);
        setIsConnecting(false);
      }
    });

    wsService.onMessage("state_update", (data: WSServerMessage) => {
      if (data.type === "state_update" && data.state) {
        console.log("[SessionProvider] Received state update:", {
          state: data.state,
        });
        setStoryState(data.state);
        setIsLoading(false);
      }
    });

    wsService.onMessage("exit_story_response", (data: WSServerMessage) => {
      if (data.type === "exit_story_response") {
        console.log("[SessionProvider] Story exit confirmed");
        setStoryState(null);
        setSessionId(null);
        setStoryCodes(null);
        localStorage.removeItem("sessionId");
      }
    });

    wsService.onMessage("error", (data: WSServerMessage) => {
      if (data.type === "error") {
        if (data.error === "Session not found") {
          console.warn("[SessionProvider] Session not found - reconnecting");
          return;
        }
        console.error("[SessionProvider] WebSocket error:", data.error);
        setError(data.error);
        setIsLoading(false);
      }
    });

    wsService.onMessage("story_codes", (data: WSServerMessage) => {
      if (data.type === "story_codes") {
        console.log("[SessionProvider] Received player codes:", data.codes);
        setStoryCodes(data.codes);
        setIsLoading(false);
      }
    });

    wsService.onMessage("verify_code_response", (data: WSServerMessage) => {
      if (data.type === "verify_code_response") {
        console.log("[SessionProvider] Code verification response:", data);
        if (data.state) {
          setStoryState(data.state);
          setIsLoading(false);
          setIsConnecting(false);
        } else if (data.error) {
          setError(data.error);
          setIsLoading(false);
        }
      }
    });

    // Connect to WebSocket
    const savedSessionId = localStorage.getItem("sessionId");
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
    isConnecting,
    storyCodes,
    setStoryCodes,
    error,
    setError,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
