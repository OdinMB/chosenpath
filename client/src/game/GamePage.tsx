import React, { useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSession } from "./useGameSession";
import { gameService } from "./GameService";
import { wsService } from "./WebSocketService";
import { Logger } from "../shared/logger";
import { GameLayout } from "./components/GameLayout";
import { useAuth } from "shared/useAuth";

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
  const { user } = useAuth();

  useEffect(() => {
    if (joinCode) {
      wsService.setExternalJoinCode(joinCode);
      Logger.App.log(
        `GamePage: External join code set in wsService: ${joinCode}`
      );
    }
    return () => {
      // wsService.setExternalJoinCode(null); // Consider if this is needed on unmount
    };
  }, [joinCode]);

  useEffect(() => {
    Logger.App.log("GamePage effect triggered", {
      sessionId,
      storyState,
      isLoading,
      isConnecting,
      joinCode,
      isReqPendCreate: isRequestPending("create_session"),
      isReqPendVerify: isRequestPending("verify_code"),
      isReqPendRejoin: isRequestPending("rejoin_session"),
    });

    if (isConnecting) {
      Logger.App.log(
        "GamePage: WebSocket still connecting, deferring actions."
      );
      return;
    }

    // Attempt to create a session if one doesn't exist and isn't already pending
    if (!sessionId && !isRequestPending("create_session")) {
      Logger.App.log(
        "GamePage: No session ID and not pending create_session. Requesting new session NOW."
      );
      wsService.sendMessage({ type: "create_session" });
      return;
    }

    // Attempt to verify code if we have a joinCode, a sessionId, no current storyState, and not busy with other critical ops
    if (
      joinCode &&
      sessionId && // This check is crucial
      !storyState &&
      !isLoading &&
      !isRequestPending("verify_code") &&
      !isRequestPending("rejoin_session") &&
      !isRequestPending("create_session") // Also ensure create_session isn't the immediate pending op
    ) {
      Logger.App.log(
        "GamePage: Has sessionId and joinCode. Attempting to verify join code NOW:",
        joinCode,
        "User:",
        user?.id
      );
      setIsLoading(true);
      gameService.verifyCode(joinCode, user?.id); // This eventually calls wsService.sendMessage
    }
  }, [
    sessionId,
    joinCode,
    storyState,
    isLoading,
    isConnecting,
    isRequestPending,
    setIsLoading,
    user,
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
    localStorage.removeItem("sessionId");
    navigate("/");
  }, [navigate, setSessionId]);

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

  // Render logic
  if (isConnecting) {
    Logger.App.log(
      "GamePage: Rendering ConnectingView (WebSocket is connecting)."
    );
    return <ConnectingView />;
  }

  if (!sessionId && isRequestPending("create_session")) {
    Logger.App.log("GamePage: Rendering ConnectingView (Creating session...)", {
      globalPending: isRequestPending("create_session"),
    });
    return <ConnectingView />;
  }

  if (error && !storyState) {
    Logger.App.error(
      "GamePage: Rendering ErrorView due to error and no storyState.",
      error
    );
    return (
      <div>
        Error: {error}. Please try again or return to the{" "}
        <a href="/">homepage</a>.
      </div>
    );
  }

  // At this point, WebSocket is connected. Session creation is not the primary pending blocking op if sessionId is null.
  // (If !sessionId and create_session was pending, the above block would have caught it)

  // If we have a session ID, but no story state yet.
  // This could be because we are waiting for joinCode verification, rejoining, or some other loading state.
  if (
    sessionId &&
    !storyState &&
    (isLoading ||
      isRequestPending("verify_code") ||
      isRequestPending("rejoin_session"))
  ) {
    Logger.App.log(
      "GamePage: Rendering ConnectingView (Session exists, no story. Likely verifying/rejoining or other loading operation).",
      {
        isLoading,
        verifyPending: isRequestPending("verify_code"),
        rejoinPending: isRequestPending("rejoin_session"),
      }
    );
    return <ConnectingView />;
  }

  // Fallback: If none of the above, but still no storyState, show ConnectingView.
  // This covers cases like:
  //    - Session created, but joinCode effect hasn't run yet or isn't applicable for the current flow.
  //    - Other unexpected intermediate states.
  if (!storyState) {
    Logger.App.warn(
      "GamePage: Rendering ConnectingView (Fallback: no storyState. Conditions: WS connected, no critical error, session might exist, not actively in a recognized loading/pending state like session creation, code verification, or rejoin).",
      {
        sessionId,
        isLoading,
        isConnecting, // Should be false here
        error,
        isReqPendCreate: isRequestPending("create_session"),
        isReqPendVerify: isRequestPending("verify_code"),
        isReqPendRejoin: isRequestPending("rejoin_session"),
      }
    );
    return <ConnectingView />;
  }

  // All good, render the game
  Logger.App.log("GamePage: Rendering GameLayout with storyState.", storyState);
  return (
    <GameLayout
      onExitGame={handleExitGame}
      onChoiceSelected={handleChoiceSelected}
      onCharacterSelected={handleCharacterSelected}
    />
  );
};
