import { useState, useEffect, useRef, useCallback } from "react";
import type {
  ClientStoryState,
  WSServerMessage,
  RateLimitInfo,
  ContentModerationInfo,
} from "core/types";
import { wsService } from "./WebSocketService.js";
import { SessionContext, StoredCodeSet } from "./SessionContext.js";
import {
  storeCodeSet,
  getStoredCodeSets,
  deleteStoredCodeSet,
  updateStoredSetWithCode,
} from "./codeSetUtils.ts";
import { Logger } from "./logger.js";

// Create a dedicated logger for session operations
const logger = Logger.App;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [storyState, setStoryState] = useState<ClientStoryState | null>(null);
  const [storyCodes, setStoryCodes] = useState<Record<string, string> | null>(
    null
  );
  const [transientStoryCodes, setTransientStoryCodes] = useState<Record<
    string,
    string
  > | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  const [contentModeration, setContentModeration] =
    useState<ContentModerationInfo | null>(null);
  const [connectionStale, setConnectionStale] = useState<string | null>(null);
  const [storyReady, setStoryReady] = useState(false);
  const [storedCodeSets, setStoredCodeSets] = useState<StoredCodeSet[]>(
    getStoredCodeSets()
  );

  // Use refs to track states without causing effect reruns
  const isLoadingRef = useRef(isLoading);
  const transientStoryCodesRef = useRef(transientStoryCodes);

  // Keep the refs updated with the latest values
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    transientStoryCodesRef.current = transientStoryCodes;
  }, [transientStoryCodes]);

  // Function to update the storedCodeSets state after changes
  const refreshStoredCodeSets = useCallback(() => {
    setStoredCodeSets(getStoredCodeSets());
  }, []);

  useEffect(() => {
    wsService.clearMessageHandlers();

    wsService.onMessage("create_session_response", (data: WSServerMessage) => {
      if (
        data.type === "create_session_response" &&
        "data" in data &&
        data.data.sessionId
      ) {
        logger.info("[SessionProvider] Session created:", data.data.sessionId);
        setSessionId(data.data.sessionId);
        localStorage.setItem("sessionId", data.data.sessionId);
        wsService.setSessionId(data.data.sessionId);

        // Ensure we mark connection as complete
        setIsConnecting(false);
        logger.info(
          "[SessionProvider] Connection complete, isConnecting set to false"
        );
      }
    });

    wsService.onMessage(
      "state_update_notification",
      (data: WSServerMessage) => {
        if (data.type === "state_update_notification" && "state" in data) {
          logger.info("[SessionProvider] Received state update:", {
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
          logger.info("[SessionProvider] Story initialization acknowledged");
        }
      }
    );

    wsService.onMessage("exit_story_response", (data: WSServerMessage) => {
      if (data.type === "exit_story_response") {
        logger.info("[SessionProvider] Story exit confirmed");
        setStoryState(null);
        setSessionId(null);
        setStoryCodes(null);
        setTransientStoryCodes(null);
        localStorage.removeItem("sessionId");
      }
    });

    wsService.onMessage("rate_limited", (data: WSServerMessage) => {
      if ("rateLimit" in data) {
        logger.info("[SessionProvider] Rate limited:", data.rateLimit);
        setRateLimit(data.rateLimit);
        setIsLoading(false);
      }
    });

    wsService.onMessage("content_moderation", (data: WSServerMessage) => {
      if ("contentModeration" in data) {
        logger.info(
          "[SessionProvider] Content moderation:",
          data.contentModeration
        );
        setContentModeration(data.contentModeration as ContentModerationInfo);
        setIsLoading(false);
      }
    });

    wsService.onMessage("error", (data: WSServerMessage) => {
      if (data.type === "error") {
        if ("error" in data && typeof data.error === "string") {
          if (data.error === "Session not found") {
            logger.warn("[SessionProvider] Session not found - reconnecting");
            return;
          }
          logger.error(
            `[SessionProvider] WebSocket error${
              "operationType" in data && data.operationType
                ? ` (${data.operationType})`
                : ""
            }:`,
            data.error
          );

          // Simply set the error - let components handle cleanup
          setError(data.error);
        }

        setIsLoading(false);
      }
    });

    wsService.onMessage("story_codes_notification", (data: WSServerMessage) => {
      if (data.type === "story_codes_notification" && "codes" in data) {
        logger.info(
          "[SessionProvider] Received player codes notification:",
          data.codes
        );
        setStoryCodes(data.codes);
        setTransientStoryCodes(data.codes);
        logger.info(
          "[SessionProvider] Updated transientStoryCodes with new codes"
        );

        // Always mark the story as not ready initially
        // The server will send a story_ready_notification when it's ready
        logger.info("[SessionProvider] Waiting for story ready notification");
        setStoryReady(false);

        // Store codes in localStorage
        storeCodeSet(data.codes);
        refreshStoredCodeSets();
      }
    });

    wsService.onMessage("story_ready_notification", (data: WSServerMessage) => {
      if (data.type === "story_ready_notification") {
        logger.info(
          "[SessionProvider] Story generation completed and ready to join"
        );
        setStoryReady(true);
        setIsLoading(false);
      }
    });

    wsService.onMessage("verify_code_response", (data: WSServerMessage) => {
      if (data.type === "verify_code_response") {
        logger.info("[SessionProvider] Code verification response:", data);
        if ("data" in data && data.data.state) {
          setStoryState(data.data.state);
          setIsLoading(false);
          setIsConnecting(false);

          // Try to find the player role from the data directly or compute it
          let playerRole = "player1"; // Default fallback
          if (data.data.state.players) {
            // Find the first and only player in ClientStoryState
            const playerKeys = Object.keys(data.data.state.players);
            if (playerKeys.length > 0) {
              playerRole = playerKeys[0];
            }
          }

          const title = data.data.state.title;

          // Store or update the code
          updateStoredSetWithCode(data.data.code, playerRole, title, true);
          refreshStoredCodeSets();
        } else if ("errorMessage" in data) {
          logger.info(
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
        logger.info("[SessionProvider] Connection stale:", data.message);
        setConnectionStale(data.message as string);
        setIsLoading(false);
      }
    });

    const savedSessionId = localStorage.getItem("sessionId");
    wsService.connect(savedSessionId || undefined);

    // Auto-reconnect when becoming visible if connection is lost
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wsService.isConnected()) {
        logger.info(
          "[SessionProvider] Tab became visible, reconnecting if needed"
        );
        wsService.connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wsService.disconnect();
      wsService.clearMessageHandlers();
    };
  }, [refreshStoredCodeSets]);

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
    transientStoryCodes,
    setTransientStoryCodes,
    storyReady,
    setStoryReady,
    error,
    setError,
    rateLimit,
    setRateLimit,
    contentModeration,
    setContentModeration,
    connectionStale,
    setConnectionStale,
    isRequestPending: (type: string) => wsService.isRequestPending(type),
    isOperationRunning: (type: string) => wsService.isOperationRunning(type),
    storedCodeSets,
    refreshStoredCodeSets,
    deleteCodeSet: (timestamp: number) => {
      deleteStoredCodeSet(timestamp);
      refreshStoredCodeSets();
    },
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
