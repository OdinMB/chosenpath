import { useEffect, useState, useCallback } from "react";
import { useSession } from "shared/useSession";
import { wsService } from "shared/WebSocketService";
import { GameLayout } from "game/components/GameLayout";
import { gameService } from "game/GameService";
import { RateLimitNotification } from "components/RateLimitNotification";
import { ContentModerationNotification } from "shared/components/ContentModerationNotification";
import { Logger } from "shared/logger";

// Game-related view states
type ViewState = "CONNECTING" | "GAME";

function App() {
  const {
    setStoryState,
    setIsLoading,
    storyState,
    sessionId,
    setSessionId,
    error,
    setError,
    rateLimit,
    setRateLimit,
    contentModeration,
    setContentModeration,
    isRequestPending,
    isConnecting,
  } = useSession();
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [viewState, setViewState] = useState<ViewState>("CONNECTING");

  // Generate a unique ID for this tab if it doesn't exist
  const [tabId] = useState(
    () =>
      sessionStorage.getItem("tabId") ||
      Math.random().toString(36).substring(2, 15)
  );

  // Store tab-specific storage key for player code
  const playerCodeKey = `playerCode_${tabId}`;

  // Store tabId in sessionStorage when tab opens
  useEffect(() => {
    sessionStorage.setItem("tabId", tabId);
  }, [tabId]);

  // Wrap loggedSetViewState in useCallback
  const loggedSetViewState = useCallback(
    (newState: ViewState) => {
      Logger.App.log(`View state changing from ${viewState} to ${newState}`);
      setViewState(newState);
    },
    [viewState]
  );

  // Monitor WebSocket connection status
  useEffect(() => {
    const checkConnection = () => {
      if (!wsService.isConnected()) {
        Logger.App.log("WebSocket not connected, reconnecting");
        wsService.connect();
      }
    };

    // Check connection status periodically
    const interval = setInterval(checkConnection, 2000);

    return () => clearInterval(interval);
  }, []);

  // Monitor session status and request if needed
  useEffect(() => {
    const checkSession = () => {
      if (
        wsService.isConnected() &&
        !sessionId &&
        !isCreatingSession &&
        !isRequestPending("create_session")
      ) {
        Logger.App.log("Connected but no session, requesting new session");
        setIsCreatingSession(true);
        wsService.sendMessage({ type: "create_session" });
      }
    };

    // Check immediately
    checkSession();

    // Set up interval to check session status
    const interval = setInterval(checkSession, 1000);

    return () => clearInterval(interval);
  }, [sessionId, isCreatingSession, isRequestPending]);

  useEffect(() => {
    if (sessionId) {
      setIsCreatingSession(false);
    }
  }, [sessionId]);

  // Add logging for isConnecting changes
  useEffect(() => {
    Logger.App.log(`isConnecting state changed: ${isConnecting}`);
  }, [isConnecting]);

  // Debug sessionId changes
  useEffect(() => {
    Logger.App.log(`sessionId changed: ${sessionId}`);
  }, [sessionId]);

  // Effects specifically for game state management
  useEffect(() => {
    // Once we're done connecting, check if we have a story state to restore
    if (isConnecting) {
      if (viewState !== "CONNECTING") {
        loggedSetViewState("CONNECTING");
      }
      return;
    }

    // If connection is ready and we have a story state, go to GAME
    if (viewState === "CONNECTING" && storyState) {
      loggedSetViewState("GAME");
      return;
    }
  }, [isConnecting, storyState, viewState, loggedSetViewState]);

  const handleExitGame = () => {
    Logger.App.log("handleExitGame called, exiting game");
    gameService.exitStory();
    setStoryState(null);
    setSessionId(null);
    localStorage.removeItem(playerCodeKey);

    // Navigate to home after exiting game
    window.location.href = "/";
  };

  const handlePlayerChoice = (optionIndex: number) => {
    if (!storyState) {
      Logger.App.warn("Cannot make choice: missing storyState");
      return;
    }

    Logger.App.log("Processing player choice:", { optionIndex });

    setIsLoading(true);
    gameService.makeChoice(optionIndex);
  };

  const handleCharacterSelected = (
    identityIndex: number,
    backgroundIndex: number
  ) => {
    if (!storyState) {
      Logger.App.warn("Cannot select character: missing storyState");
      return;
    }

    Logger.App.log("Processing character selection:", {
      identityIndex,
      backgroundIndex,
    });

    setIsLoading(true);
    gameService.selectCharacter(identityIndex, backgroundIndex);
  };

  // Get the current view content
  const getCurrentView = () => {
    Logger.App.log(`getCurrentView called with viewState: ${viewState}`);
    switch (viewState) {
      case "CONNECTING":
        return (
          <div className="app flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-primary-600">Connecting...</p>
            </div>
          </div>
        );

      case "GAME":
        return (
          <div className="app">
            <GameLayout
              onExitGame={handleExitGame}
              onChoiceSelected={handlePlayerChoice}
              onCharacterSelected={handleCharacterSelected}
            />
          </div>
        );

      default:
        return null;
    }
  };

  // Add error and rate limit display
  const Notifications = () => (
    <>
      {error ? (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-primary border border-accent text-white px-4 py-3 rounded z-50 flex items-center shadow-lg max-w-2xl">
          <div className="mr-2 whitespace-pre-wrap">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-accent hover:text-tertiary ml-auto"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      ) : null}

      {/* Show all rate limit notifications centrally */}
      {rateLimit && (
        <>
          {/* Full screen overlay with solid backdrop */}
          <div className="fixed inset-0 bg-black bg-opacity-75 z-[999] flex items-center justify-center">
            <div className="max-w-md w-full mx-4">
              <RateLimitNotification
                rateLimit={rateLimit}
                onTimeout={() => setRateLimit(null)}
                className="border-2 bg-white"
              />
            </div>
          </div>
        </>
      )}

      {/* Show content moderation notifications centrally */}
      {contentModeration && (
        <>
          {/* Full screen overlay with solid backdrop */}
          <div className="fixed inset-0 bg-black bg-opacity-75 z-[999] flex items-center justify-center">
            <div className="max-w-md w-full mx-4">
              <ContentModerationNotification
                contentModeration={contentModeration}
                onClose={() => setContentModeration(null)}
                className="border-2 bg-white"
              />
            </div>
          </div>
        </>
      )}
    </>
  );

  // Render
  return (
    <>
      <Notifications />
      {getCurrentView()}
    </>
  );
}

export default App;
