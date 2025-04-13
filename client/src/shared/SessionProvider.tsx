import { useState, useEffect, useRef } from "react";
import type {
  ClientStoryState,
  WSServerMessage,
  RateLimitInfo,
} from "@core/types";
import { wsService } from "./WebSocketService.js";
import { SessionContext, StoredCodeSet } from "./SessionContext.js";

// Function to store codes in localStorage
function storeCodeSet(
  codes: Record<string, string>,
  title?: string,
  lastActive?: boolean
): void {
  const codeSet: StoredCodeSet = {
    codes,
    timestamp: Date.now(),
    title,
    lastActive: lastActive || false,
  };

  // Get existing code sets
  const existingSetsJSON = localStorage.getItem("storyCodes");
  const existingSets: StoredCodeSet[] = existingSetsJSON
    ? JSON.parse(existingSetsJSON)
    : [];

  // Add new code set
  existingSets.push(codeSet);

  // Save back to localStorage
  localStorage.setItem("storyCodes", JSON.stringify(existingSets));
}

// Function to get all stored code sets
function getStoredCodeSets(): StoredCodeSet[] {
  const setsJSON = localStorage.getItem("storyCodes");
  return setsJSON ? JSON.parse(setsJSON) : [];
}

// Function to update a stored set with a new code
function updateStoredSetWithCode(
  code: string,
  playerRole: string,
  title?: string,
  lastActive?: boolean
): void {
  const sets = getStoredCodeSets();

  // Find if any set contains this code
  for (const set of sets) {
    if (Object.values(set.codes).includes(code)) {
      // Update the set with the new player role and code
      set.codes[playerRole] = code;
      // Update title if provided and not already set
      if (title && !set.title) {
        set.title = title;
      }
      if (lastActive !== undefined) {
        set.lastActive = lastActive;
        // If the set is now active, set all other sets to inactive
        if (lastActive) {
          for (const otherSet of sets) {
            if (otherSet !== set) {
              otherSet.lastActive = false;
            }
          }
        }
      }
      localStorage.setItem("storyCodes", JSON.stringify(sets));
      return;
    }
  }

  // If no set contains this code, create a new one
  const newSet: StoredCodeSet = {
    codes: { [playerRole]: code },
    timestamp: Date.now(),
    title,
    lastActive: lastActive || false,
  };
  sets.push(newSet);
  localStorage.setItem("storyCodes", JSON.stringify(sets));
}

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
  const [connectionStale, setConnectionStale] = useState<string | null>(null);
  const [storyReady, setStoryReady] = useState(false);
  const [storedCodeSets, setStoredCodeSets] = useState<StoredCodeSet[]>(
    getStoredCodeSets()
  );

  // Function to delete a code set by timestamp
  function handleDeleteCodeSet(timestamp: number): void {
    const sets = getStoredCodeSets();
    const filteredSets = sets.filter((set) => set.timestamp !== timestamp);
    localStorage.setItem("storyCodes", JSON.stringify(filteredSets));
    setStoredCodeSets(filteredSets);
  }

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
        setTransientStoryCodes(null);
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
        setTransientStoryCodes(data.codes);
        console.log(
          "[SessionProvider] Updated transientStoryCodes with new codes"
        );

        // Always mark the story as not ready initially
        // The server will send a story_ready_notification when it's ready
        console.log("[SessionProvider] Waiting for story ready notification");
        setStoryReady(false);

        // Store codes in localStorage
        storeCodeSet(data.codes);
        setStoredCodeSets(getStoredCodeSets());
      }
    });

    wsService.onMessage("story_ready_notification", (data: WSServerMessage) => {
      if (data.type === "story_ready_notification") {
        console.log(
          "[SessionProvider] Story generation completed and ready to join"
        );
        setStoryReady(true);
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
          setStoredCodeSets(getStoredCodeSets());
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

    // Auto-reconnect when becoming visible if connection is lost
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wsService.isConnected()) {
        console.log(
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
    transientStoryCodes,
    setTransientStoryCodes,
    storyReady,
    setStoryReady,
    error,
    setError,
    rateLimit,
    setRateLimit,
    connectionStale,
    setConnectionStale,
    isRequestPending: (type: string) => wsService.isRequestPending(type),
    isOperationRunning: (type: string) => wsService.isOperationRunning(type),
    storedCodeSets,
    getStoredCodeSets,
    deleteCodeSet: handleDeleteCodeSet,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
