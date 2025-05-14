import React, { useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSession } from "./useGameSession";
import { gameService } from "./GameService";
import { wsService } from "./WebSocketService";
import { Logger } from "../shared/logger";
import { GameLayout } from "./components/GameLayout";

// Placeholder for actual game UI components
const ConnectingView = () => (
  <div className="app flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p className="mt-2 text-primary-600">Connecting to Game...</p>
    </div>
  </div>
);

export const GamePage: React.FC = () => {
  const {
    storyState,
    isLoading,
    isConnecting,
    error,
    sessionId,
    setSessionId,
    setIsLoading,
    isRequestPending,
  } = useGameSession();
  const { code: joinCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();

  // Generate a unique ID for this tab if it doesn't exist
  const [tabId] = React.useState(
    () =>
      sessionStorage.getItem("tabId") ||
      Math.random().toString(36).substring(2, 15)
  );
  const playerCodeKey = `playerCode_${tabId}`;

  useEffect(() => {
    Logger.App.log("GamePage mounted/updated", {
      sessionId,
      storyState,
      isLoading,
      isConnecting,
      joinCode,
    });

    if (!sessionId && !isRequestPending("create_session")) {
      Logger.App.log("No session ID, requesting new session.");
      wsService.sendMessage({ type: "create_session" });
    }

    if (
      joinCode &&
      sessionId &&
      !storyState &&
      !isLoading &&
      !isRequestPending("verify_code")
    ) {
      Logger.App.log("Attempting to verify join code:", joinCode);
      setIsLoading(true); // Set loading when verifying code
      gameService.verifyCode(joinCode);
    }
  }, [
    sessionId,
    joinCode,
    storyState,
    isLoading,
    isConnecting,
    isRequestPending,
    setIsLoading,
  ]);

  useEffect(() => {
    if (error) {
      Logger.App.error("Game session error:", error);
      // Consider using a notification system here
    }
  }, [error]);

  const handleExitGame = useCallback(() => {
    Logger.App.log("handleExitGame called");
    gameService.exitStory();
    setSessionId(null);
    // setError(null); // Clear game-specific errors on exit
    if (storyState) {
      // Potentially clear other story-related states if necessary
      // e.g., using a setStoryState(null) if appropriate from useGameSession
      // For now, GameSessionProvider handles setStoryState(null) on exit_story_response
    }
    localStorage.removeItem(playerCodeKey);
    localStorage.removeItem("sessionId"); // Ensure session ID is cleared
    navigate("/"); // Navigate to home page
  }, [navigate, setSessionId, playerCodeKey, storyState]);

  const handleChoiceSelected = useCallback(
    (optionIndex: number) => {
      if (!storyState) {
        Logger.App.warn("Cannot make choice: missing storyState");
        return;
      }
      Logger.App.log("Processing player choice:", { optionIndex });
      setIsLoading(true);
      gameService.makeChoice(optionIndex);
    },
    [storyState, setIsLoading]
  );

  const handleCharacterSelected = useCallback(
    (identityIndex: number, backgroundIndex: number) => {
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
    },
    [storyState, setIsLoading]
  );

  if (isConnecting || (isLoading && !storyState && !error)) {
    // Show connecting view if isConnecting is true, or if isLoading is true without a storyState or an error
    // This handles initial load, session creation, and code verification loading states.
    return <ConnectingView />;
  }

  if (error && !storyState) {
    // If there's an error and no story state, it implies a critical failure (e.g., join failed)
    return (
      <div>
        Error: {error}. Please try again or return to the{" "}
        <a href="/">homepage</a>.
      </div>
    );
  }

  if (!storyState) {
    // This case might occur if connection is established but no story is active (e.g., after a failed join not caught by error above)
    // Or if ws connection drops and reconnects without successfully rejoining/re-verifying.
    Logger.App.warn(
      "No storyState available, but not actively connecting or in error state. Displaying connecting view as fallback."
    );
    return <ConnectingView />; // Fallback to connecting or a specific lobby/error view
  }

  // If storyState is available, render GameLayout
  return (
    <GameLayout
      onExitGame={handleExitGame}
      onChoiceSelected={handleChoiceSelected}
      onCharacterSelected={handleCharacterSelected}
    />
  );
};
