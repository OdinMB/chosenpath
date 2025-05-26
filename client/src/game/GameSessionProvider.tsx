import { useState, useEffect, useRef, useCallback } from "react";
import type {
  ClientStoryState,
  WSServerMessage,
  RateLimitInfo,
} from "core/types";
import { wsService } from "./WebSocketService.js";
import { Logger } from "../shared/logger.js";
import { useSession } from "../shared/session/useSession.js";
import { GameSessionContext } from "./GameSessionContext";

// Create a dedicated logger for game session operations
const logger = Logger.App;

export function GameSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sessionId, setSessionId, isLoading, setIsLoading } = useSession();

  const [storyState, setStoryState] = useState<ClientStoryState | null>(null);
  const [storyCodes, setStoryCodes] = useState<Record<string, string> | null>(
    null
  );

  const [isConnecting, setIsConnecting] = useState(true);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  const [connectionStale, setConnectionStale] = useState<string | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  // Use refs to track states without causing effect reruns
  const isLoadingRef = useRef(isLoading);

  // Keep the refs updated with the latest values
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Handler for errors that updates both local and session error states
  const handleError = useCallback(
    (errorMsg: string | null) => {
      logger.warn("[GameSessionProvider] handleError called with:", errorMsg);
      setGameError(errorMsg);
    },
    [setGameError]
  );

  useEffect(() => {
    const handleWsRawConnect = () => {
      logger.info("[GameSessionProvider] WebSocket raw connect event.");
      setIsConnecting(false); // Socket is connected
    };
    const handleWsRawDisconnect = (reason: string) => {
      logger.info(
        `[GameSessionProvider] WebSocket raw disconnect event. Reason: ${reason}`
      );
      // Only set isConnecting to true if it's not an intentional client disconnect
      // or if we expect an automatic reconnection attempt for this reason.
      if (reason !== "io client disconnect") {
        setIsConnecting(true); // Socket is disconnected, so we are "connecting" or trying to.
      }
    };

    wsService.subscribeToConnect(handleWsRawConnect);
    wsService.subscribeToDisconnect(handleWsRawDisconnect);

    // Ensure WebSocket service is connected when the provider mounts
    if (!wsService.isConnected()) {
      logger.info(
        "[GameSessionProvider] WebSocket not connected, attempting to connect."
      );
      // Pass the current sessionId from context (via useSession) to wsService.connect
      // wsService should use this sessionId for its operations (e.g. rejoin attempts)
      // instead of its own potentially stale localStorage copy.
      wsService.connect(sessionId || undefined);
    } else {
      // If already connected, ensure wsService has the latest sessionId
      if (sessionId && wsService.getSessionId() !== sessionId) {
        logger.info(
          `[GameSessionProvider] Syncing wsService sessionId to: ${sessionId}`
        );
        wsService.setSessionId(sessionId);
      }
      // If already connected, we are not "connecting"
      setIsConnecting(false);
    }

    // Message Handlers Setup (onMessage calls)
    wsService.clearMessageHandlers();

    wsService.onMessage("create_session_response", (data: WSServerMessage) => {
      if (
        data.type === "create_session_response" &&
        "data" in data &&
        data.data.sessionId
      ) {
        logger.info(
          "[GameSessionProvider] Session created:",
          data.data.sessionId
        );
        setSessionId(data.data.sessionId);
        localStorage.setItem("sessionId", data.data.sessionId);
        wsService.setSessionId(data.data.sessionId);
      }
    });

    wsService.onMessage(
      "state_update_notification",
      (data: WSServerMessage) => {
        if (data.type === "state_update_notification" && "state" in data) {
          logger.info("[GameSessionProvider] Received state update:", {
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
          logger.info(
            "[GameSessionProvider] Story initialization acknowledged"
          );
        }
      }
    );

    wsService.onMessage("exit_story_response", (data: WSServerMessage) => {
      if (data.type === "exit_story_response") {
        logger.info("[GameSessionProvider] Story exit confirmed");
        setStoryState(null);
        setSessionId(null);
        setStoryCodes(null);
        localStorage.removeItem("sessionId");
      }
    });

    wsService.onMessage("rate_limited", (data: WSServerMessage) => {
      if ("rateLimit" in data) {
        logger.info("[GameSessionProvider] Rate limited:", data.rateLimit);
        setRateLimit(data.rateLimit);
        setIsLoading(false);
      }
    });

    wsService.onMessage("error", (data: WSServerMessage) => {
      if (data.type === "error") {
        if ("error" in data && typeof data.error === "string") {
          if (data.error === "Session not found") {
            logger.warn(
              "[GameSessionProvider] Session not found - reconnecting"
            );
            return;
          }
          logger.error(
            `[GameSessionProvider] WebSocket error${
              "operationType" in data && data.operationType
                ? ` (${data.operationType})`
                : ""
            }:`,
            data.error
          );

          // Use the handleError function to set both errors
          handleError(data.error);
        }

        setIsLoading(false);
      }
    });

    wsService.onMessage("verify_code_response", (data: WSServerMessage) => {
      if (data.type === "verify_code_response") {
        logger.info("[GameSessionProvider] Code verification response:", data);
        if ("data" in data && data.data.state) {
          setStoryState(data.data.state);
          setIsLoading(false);
          // setIsConnecting(false); // Ensure this is correctly handled if needed elsewhere

          // The logic to store the code (data.data.code) has been moved to GamePage.tsx
          // It will use addCodeSetToStorage([joinCodeFromUrlParams]) after storyState is set.
          // No need to call updateStoredSetWithCode or similar here anymore.
          // Example: data.data.code is the verified code, data.data.state.title is available.
          // GamePage will use the joinCode from URL params to store.
        } else if ("errorMessage" in data) {
          logger.info(
            "[GameSessionProvider] Code verification failed:",
            data.errorMessage
          );
          handleError(data.errorMessage);
          setIsLoading(false);
          // setIsConnecting(false); // No longer needed here
          setStoryState(null);
        }
      }
    });

    wsService.onMessage("connection_stale", (data: WSServerMessage) => {
      if (data.type === "connection_stale" && "message" in data) {
        logger.info("[GameSessionProvider] Connection stale:", data.message);
        setConnectionStale(data.message as string);
        setIsLoading(false);
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wsService.isConnected()) {
        logger.info(
          "[GameSessionProvider] Tab became visible, reconnecting if needed"
        );
        wsService.connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wsService.unsubscribeFromConnect(handleWsRawConnect);
      wsService.unsubscribeFromDisconnect(handleWsRawDisconnect);
      wsService.clearMessageHandlers();
    };
  }, [sessionId, setSessionId, setIsLoading, handleError]);

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

    error: gameError,
    setError: handleError,
    rateLimit,
    setRateLimit,

    connectionStale,
    setConnectionStale,
    isRequestPending: (type: string) => wsService.isRequestPending(type),
    isOperationRunning: (type: string) => wsService.isOperationRunning(type),
  };

  return (
    <GameSessionContext.Provider value={value}>
      {children}
    </GameSessionContext.Provider>
  );
}
