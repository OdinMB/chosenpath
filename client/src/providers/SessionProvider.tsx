import { useState, useEffect, useRef } from "react";
import type { ClientStoryState } from "../../../shared/types/story";
import type {
  WSServerMessage,
  RateLimitInfo,
} from "../../../shared/types/websocket";
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
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [connectionStale, setConnectionStale] = useState<string | null>(null);

  // Use a ref to track the loading state without causing effect reruns
  const isLoadingRef = useRef(isLoading);

  // Keep the ref updated with the latest value
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    wsService.clearMessageHandlers();

    wsService.onMessage("create_session_response", (data: WSServerMessage) => {
      if (
        data.type === "create_session_response" &&
        "data" in data &&
        data.data.sessionId
      ) {
        console.log("[SessionProvider] Session created:", data.data.sessionId);
        setSessionId(data.data.sessionId);
        localStorage.setItem("sessionId", data.data.sessionId);
        wsService.setSessionId(data.data.sessionId);

        // Ensure we mark connection as complete
        setIsConnecting(false);
        console.log(
          "[SessionProvider] Connection complete, isConnecting set to false"
        );
      }
    });

    wsService.onMessage(
      "state_update_notification",
      (data: WSServerMessage) => {
        if (data.type === "state_update_notification" && "state" in data) {
          console.log("[SessionProvider] Received state update:", {
            state: data.state,
            trigger: data.trigger,
          });
          setStoryState(data.state);
          setIsLoading(false);
        }
      }
    );

    wsService.onMessage(
      "initialize_story_response",
      (data: WSServerMessage) => {
        if (data.type === "initialize_story_response") {
          console.log("[SessionProvider] Story initialization acknowledged");
        }
      }
    );

    wsService.onMessage("exit_story_response", (data: WSServerMessage) => {
      if (data.type === "exit_story_response") {
        console.log("[SessionProvider] Story exit confirmed");
        setStoryState(null);
        setSessionId(null);
        setStoryCodes(null);
        localStorage.removeItem("sessionId");
      }
    });

    wsService.onMessage("rate_limited", (data: WSServerMessage) => {
      if ("rateLimit" in data) {
        console.log("[SessionProvider] Rate limited:", data.rateLimit);
        setRateLimit(data.rateLimit);
        setIsLoading(false);
      }
    });

    wsService.onMessage("error", (data: WSServerMessage) => {
      if (data.type === "error") {
        if ("error" in data && typeof data.error === "string") {
          if (data.error === "Session not found") {
            console.warn("[SessionProvider] Session not found - reconnecting");
            return;
          }
          console.error(
            `[SessionProvider] WebSocket error${
              "operationType" in data && data.operationType
                ? ` (${data.operationType})`
                : ""
            }:`,
            data.error
          );
          setError(data.error);
        }

        setIsLoading(false);
      }
    });

    wsService.onMessage("story_codes_notification", (data: WSServerMessage) => {
      if (data.type === "story_codes_notification" && "codes" in data) {
        console.log(
          "[SessionProvider] Received player codes notification:",
          data.codes
        );
        setStoryCodes(data.codes);
        setIsLoading(false);
      }
    });

    wsService.onMessage("verify_code_response", (data: WSServerMessage) => {
      if (data.type === "verify_code_response") {
        console.log("[SessionProvider] Code verification response:", data);
        if ("data" in data && data.data.state) {
          setStoryState(data.data.state);
          setIsLoading(false);
          setIsConnecting(false);
        } else if ("errorMessage" in data) {
          console.log(
            "[SessionProvider] Code verification failed:",
            data.errorMessage
          );
          setError(data.errorMessage);
          setIsLoading(false);

          setStoryState(null);
        }
      }
    });

    wsService.onMessage("connection_stale", (data: WSServerMessage) => {
      if (data.type === "connection_stale" && "message" in data) {
        console.log("[SessionProvider] Connection stale:", data.message);
        setConnectionStale(data.message as string);
        setIsLoading(false);
      }
    });

    const savedSessionId = localStorage.getItem("sessionId");
    wsService.connect(savedSessionId || undefined);

    return () => {
      wsService.disconnect();
      wsService.clearMessageHandlers();
    };
  }, []); // intentionally empty to run only on mount

  useEffect(() => {
    if (rateLimit && rateLimit.timeRemaining > 0) {
      const timer = setTimeout(() => {
        setRateLimit(null);
      }, rateLimit.timeRemaining);

      return () => clearTimeout(timer);
    }
  }, [rateLimit]);

  useEffect(() => {
    if (connectionStale) {
      // Show a notification to the user that they need to refresh
      // This could trigger a UI overlay or other notification
      // You could also add logic here to auto-refresh if desired
      // window.location.reload();
    }
  }, [connectionStale]);

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
    rateLimit,
    setRateLimit,
    connectionStale,
    setConnectionStale,
    isRequestPending: (type: string) => wsService.isRequestPending(type),
    isOperationRunning: (type: string) => wsService.isOperationRunning(type),
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
