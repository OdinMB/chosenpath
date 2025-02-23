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
    if (!sessionId && !playerCode) {
      loggedSetViewState("CONNECTING");
    } else if (viewState === "SETUP") {
      // nothing
    } else if (viewState === "PLAYER_CODES") {
      if (storyState) {
        loggedSetViewState("GAME");
      }
    } else if (storyState) {
      loggedSetViewState("GAME");
    } else {
      loggedSetViewState("WELCOME");
    }
    if (viewState === "WELCOME") {
      if (storyState) {
        loggedSetViewState("GAME");
      }
    }

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

  const handleDeleteCode = useCallback(() => {
    localStorage.removeItem(playerCodeKey);
    setPlayerCode(null);
    loggedSetViewState("WELCOME");
  }, [playerCodeKey, loggedSetViewState]);

  // Add error display component
  const ErrorMessage = () =>
    error ? (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex items-center shadow-lg">
        <span className="mr-2">{error}</span>
        <button
          onClick={() => setError(null)}
          className="text-red-700 hover:text-red-900"
        >
          ×
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
