import { useSession } from "./hooks/useSession.js";
import { StoryInitializer } from "./components/StoryInitializer.js";
import { GameLayout } from "./components/GameLayout.js";
import { wsService } from "./services/WebSocketService.js";
import { gameService } from "./services/GameService.js";
import { useEffect, useState, useCallback } from "react";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { PlayerCodes } from "./components/PlayerCodes";
import { GameMode } from "../../shared/types/story.js";

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
    error,
    setError,
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
    // If we have a session or player code, we're in a valid state
    if (sessionId || playerCode) {
      if (viewState === "CONNECTING") {
        loggedSetViewState("WELCOME");
      } else if (viewState === "SETUP") {
        // Stay in setup
      } else if (viewState === "PLAYER_CODES") {
        if (storyState) {
          loggedSetViewState("GAME");
        }
      } else if (storyState) {
        loggedSetViewState("GAME");
      } else if (viewState !== "WELCOME") {
        loggedSetViewState("WELCOME");
      }
    } else if (wsService.isConnected()) {
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
    if (storyCodes && viewState === "SETUP") {
      loggedSetViewState("PLAYER_CODES");
    }
  }, [
    sessionId,
    storyState,
    playerCode,
    storyCodes,
    viewState,
    loggedSetViewState,
  ]);

  useEffect(() => {
    if (!sessionId && !isCreatingSession && wsService.isConnected()) {
      console.log("[App] No session found, requesting new session");
      setIsCreatingSession(true);
      wsService.sendMessage({ type: "create_session" });
    }
  }, [sessionId, isCreatingSession]);

  useEffect(() => {
    if (sessionId) {
      setIsCreatingSession(false);
    }
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

  const handleDeleteCode = useCallback(() => {
    localStorage.removeItem(playerCodeKey);
    setPlayerCode(null);

    // If we're connected but have no session, we should go to WELCOME
    if (wsService.isConnected()) {
      loggedSetViewState("WELCOME");
    } else {
      // If we're not connected, we need to reconnect
      wsService.connect();
      loggedSetViewState("WELCOME");
    }
  }, [playerCodeKey, loggedSetViewState]);

  // Add error display component
  const ErrorMessage = () =>
    error ? (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex items-center shadow-lg max-w-2xl">
        <div className="mr-2 whitespace-pre-wrap">{error}</div>
        <button
          onClick={() => setError(null)}
          className="text-red-700 hover:text-red-900 ml-auto"
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
    ) : null;

  // Get the current view content
  const getCurrentView = () => {
    switch (viewState) {
      case "CONNECTING":
        return (
          <div className="app flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-2 text-gray-600">Connecting...</p>
            </div>
          </div>
        );

      case "WELCOME":
        return (
          <WelcomeScreen
            onCodeSubmit={handleCodeSubmit}
            onNewStory={handleNewStory}
            existingPlayerCode={playerCode}
            onDeleteCode={handleDeleteCode}
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
      <ErrorMessage />
      {getCurrentView()}
    </>
  );
}

export default App;
