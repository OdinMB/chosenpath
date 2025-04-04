import { useSession } from "./hooks/useSession.js";
import { StoryInitializer } from "./components/StoryInitializer.js";
import { GameLayout } from "./components/GameLayout.js";
import { wsService } from "./services/WebSocketService.js";
import { gameService } from "./services/GameService.js";
import { useEffect, useState, useCallback } from "react";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { PlayerCodes } from "./components/PlayerCodes";
import { GameMode } from "../../shared/types/story.js";
import { RateLimitNotification } from "./components/ui/RateLimitNotification";

// Add this type at the top with the imports
type ViewState = "CONNECTING" | "WELCOME" | "SETUP" | "PLAYER_CODES" | "GAME";

function App() {
  const {
    setStoryState,
    setIsLoading,
    storyState,
    sessionId,
    setSessionId,
    storyCodes,
    setStoryCodes,
    storyReady,
    setStoryReady,
    error,
    setError,
    rateLimit,
    setRateLimit,
    connectionStale,
    setConnectionStale,
    isRequestPending,
    isOperationRunning,
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

  // Use tab-specific storage key for player code
  const playerCodeKey = `playerCode_${tabId}`;
  const [playerCode, setPlayerCode] = useState<string | null>(
    localStorage.getItem(playerCodeKey)
  );

  // Store tabId in sessionStorage when tab opens
  useEffect(() => {
    sessionStorage.setItem("tabId", tabId);
  }, [tabId]);

  // Wrap loggedSetViewState in useCallback
  const loggedSetViewState = useCallback(
    (newState: ViewState) => {
      console.log(`[App] View state changing from ${viewState} to ${newState}`);
      setViewState(newState);
    },
    [viewState]
  );

  // Replace all setViewState calls with loggedSetViewState
  useEffect(() => {
    // If we're connecting, stay in connecting state
    if (isConnecting) {
      if (viewState !== "CONNECTING") {
        loggedSetViewState("CONNECTING");
      }
      return;
    }

    // If we have a session or player code, we're in a valid state
    if (sessionId || playerCode) {
      if (viewState === "CONNECTING") {
        loggedSetViewState("WELCOME");
      } else if (viewState === "SETUP") {
        // If we're initializing a story, keep in setup state
        if (
          isRequestPending("initialize_story") ||
          isOperationRunning("initialize_story")
        ) {
          // Stay in setup
        } else if (storyCodes) {
          // If we have story codes, go to player codes view
          loggedSetViewState("PLAYER_CODES");
        }
      } else if (viewState === "PLAYER_CODES") {
        if (storyState) {
          loggedSetViewState("GAME");
        }
      } else if (viewState === "GAME") {
        // If in game view, stay there even during character selection
        if (
          isRequestPending("select_character") ||
          isOperationRunning("select_character")
        ) {
          // Stay in game view while character selection is processing
        }
      } else if (storyState) {
        loggedSetViewState("GAME");
      } else if (viewState !== "WELCOME") {
        loggedSetViewState("WELCOME");
      }
    } else if (wsService.isConnected() && !isConnecting) {
      // If we're connected but have no session or player code, go to welcome
      if (viewState === "CONNECTING") {
        loggedSetViewState("WELCOME");
      }
    }

    // Handle transitions based on story state
    if (viewState === "WELCOME" && storyState) {
      loggedSetViewState("GAME");
    }

    // Handle transitions based on story codes
    if (
      storyCodes &&
      viewState === "SETUP" &&
      !isOperationRunning("initialize_story")
    ) {
      loggedSetViewState("PLAYER_CODES");
    }
  }, [
    sessionId,
    storyState,
    playerCode,
    storyCodes,
    viewState,
    loggedSetViewState,
    isRequestPending,
    isOperationRunning,
    isConnecting,
  ]);

  // Monitor WebSocket connection status
  useEffect(() => {
    const checkConnection = () => {
      if (!wsService.isConnected()) {
        console.log("[App] WebSocket not connected, reconnecting");
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
        console.log("[App] Connected but no session, requesting new session");
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
    console.log("[App] isConnecting state changed:", isConnecting);
  }, [isConnecting]);

  // Debug sessionId changes
  useEffect(() => {
    console.log("[App] sessionId changed:", sessionId);
  }, [sessionId]);

  const handleStorySetup = (options: {
    prompt: string;
    generateImages: boolean;
    playerCount: number;
    maxTurns: number;
    gameMode: GameMode;
  }) => {
    setIsLoading(true);
    setPlayerCode(null);
    setStoryReady(false); // Reset story ready state when starting a new story
    localStorage.removeItem(playerCodeKey);
    gameService.initializeStory(
      options.prompt,
      options.generateImages,
      options.playerCount,
      options.maxTurns,
      options.gameMode
    );
  };

  const handleCodeSubmit = (code: string) => {
    setIsLoading(true);
    gameService.verifyCode(code);
    setPlayerCode(code);
    localStorage.setItem(playerCodeKey, code);
  };

  const handleExitGame = () => {
    gameService.exitStory();
    setStoryState(null);
    setStoryCodes(null);
    setSessionId(null);
    setPlayerCode(null);
    localStorage.removeItem(playerCodeKey);
    loggedSetViewState("WELCOME");
  };

  const handleNewStory = () => {
    setStoryState(null);
    setStoryCodes(null);
    loggedSetViewState("SETUP");
  };

  const handlePlayerChoice = (optionIndex: number) => {
    if (!storyState) {
      console.warn("[App] Cannot make choice: missing storyState");
      return;
    }

    console.log("[App] Processing player choice:", { optionIndex });

    setIsLoading(true);
    gameService.makeChoice(optionIndex);
  };

  const handleCharacterSelected = (
    identityIndex: number,
    backgroundIndex: number
  ) => {
    if (!storyState) {
      console.warn("[App] Cannot select character: missing storyState");
      return;
    }

    console.log("[App] Processing character selection:", {
      identityIndex,
      backgroundIndex,
    });

    setIsLoading(true);
    gameService.selectCharacter(identityIndex, backgroundIndex);
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

      {/* Stale connection notification */}
      {connectionStale ? (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-[999] flex items-center justify-center">
          <div className="max-w-md w-full mx-4 bg-white rounded-lg p-6 text-center shadow-lg">
            <svg
              className="w-12 h-12 mx-auto text-warning mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="text-lg font-bold mb-2">Connection Lost</h3>
            <p className="mb-4">{connectionStale}</p>
            <button
              onClick={() => {
                setConnectionStale(null);
                window.location.reload();
              }}
              className="bg-accent hover:bg-accent-dark text-white font-bold py-2 px-4 rounded-full"
            >
              Refresh Page
            </button>
          </div>
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
    </>
  );

  // Get the current view content
  const getCurrentView = () => {
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

      case "WELCOME":
        return (
          <WelcomeScreen
            onCodeSubmit={handleCodeSubmit}
            onNewStory={handleNewStory}
          />
        );

      case "SETUP":
        return (
          <StoryInitializer
            onSetup={handleStorySetup}
            onBack={() => setViewState("WELCOME")}
          />
        );

      case "PLAYER_CODES":
        return storyCodes ? (
          <PlayerCodes
            codes={storyCodes}
            onBack={() => setViewState("WELCOME")}
            onCodeSubmit={handleCodeSubmit}
            storyReady={storyReady}
            onGoToWelcome={() => setViewState("WELCOME")}
          />
        ) : (
          <StoryInitializer
            onSetup={handleStorySetup}
            onBack={() => setViewState("WELCOME")}
          />
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

  // Render
  return (
    <>
      <Notifications />
      {getCurrentView()}
    </>
  );
}

export default App;
