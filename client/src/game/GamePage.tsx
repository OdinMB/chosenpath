import React, { useEffect, useCallback, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGameSession } from "./useGameSession";
import { gameService } from "./GameService";
import { wsService } from "./WebSocketService";
import { Logger } from "../shared/logger";
import { GameLayout } from "./components/GameLayout";
import { useAuth } from "shared/useAuth";
import { useSession } from "../shared/useSession";
import { addCodeSetToStorage } from "../shared/utils/codeSetUtils";

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
  const { refreshStoredCodeSets, fetchStoryFeed } = useSession();
  const [hasStoredJoinCode, setHasStoredJoinCode] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Add a counter for code verification attempts
  const verificationAttemptRef = useRef(0);
  // Track if we've tried verifying the code at least once
  const hasTriedVerificationRef = useRef(false);

  useEffect(() => {
    if (joinCode) {
      wsService.setExternalJoinCode(joinCode);
      Logger.App.debug(
        `GamePage: External join code set in wsService: ${joinCode}`
      );
    }
    return () => {
      Logger.App.debug(
        `GamePage: Cleanup effect for joinCode. Current joinCode before unmount/change: ${joinCode}. Setting wsService external join code to null.`
      );
      wsService.setExternalJoinCode(null);
    };
  }, [joinCode]);

  useEffect(() => {
    Logger.App.debug("GamePage effect triggered", {
      sessionId,
      storyState,
      isLoading,
      isConnecting,
      joinCode,
      isReqPendCreate: isRequestPending("create_session"),
      isReqPendVerify: isRequestPending("verify_code"),
      isReqPendRejoin: isRequestPending("rejoin_session"),
      isExiting,
      verificationAttempts: verificationAttemptRef.current,
      hasTriedVerification: hasTriedVerificationRef.current,
    });

    if (isExiting) {
      Logger.App.log("GamePage: Currently exiting, aborting effect logic.");
      return;
    }

    if (isConnecting) {
      Logger.App.debug(
        "GamePage: WebSocket still connecting, deferring actions."
      );
      return;
    }

    // Attempt to create a session if one doesn't exist and isn't already pending
    if (!sessionId && !isRequestPending("create_session")) {
      Logger.App.debug(
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
      Logger.App.debug(
        "GamePage: Has sessionId and joinCode. Attempting to verify join code NOW:",
        joinCode,
        "User:",
        user?.id
      );
      setIsLoading(true);
      gameService.verifyCode(joinCode, user?.id); // This eventually calls wsService.sendMessage
      verificationAttemptRef.current += 1;
      hasTriedVerificationRef.current = true;
    }
    // If we're in a situation where:
    // 1. We have a joinCode and sessionId
    // 2. We don't have a storyState
    // 3. We've tried verification before but it might have failed or been ignored
    // 4. We're not currently in a pending verification state
    // Then retry verification after a short delay
    else if (
      joinCode &&
      sessionId &&
      !storyState &&
      !isRequestPending("verify_code") &&
      !isRequestPending("rejoin_session") &&
      !isRequestPending("create_session") &&
      hasTriedVerificationRef.current &&
      verificationAttemptRef.current < 3 // Limit retries
    ) {
      Logger.App.info(
        `GamePage: Still no storyState after ${verificationAttemptRef.current} verification attempt(s). Retrying verification after delay...`
      );

      // Add a slight delay before retrying to ensure WebSocket is fully ready
      const retryTimeout = setTimeout(() => {
        if (!storyState) {
          // Double-check we still need to verify
          Logger.App.debug(
            `GamePage: Retrying code verification attempt #${
              verificationAttemptRef.current + 1
            } for code:`,
            joinCode
          );
          setIsLoading(true);
          gameService.verifyCode(joinCode, user?.id);
          verificationAttemptRef.current += 1;
        }
      }, 1000); // 1 second delay

      return () => clearTimeout(retryTimeout);
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
    isExiting,
  ]);

  // Effect to store the joinCode once the game is successfully loaded/verified
  useEffect(() => {
    // Only proceed if we have a storyState (indicating successful load/join)
    // and we haven't already stored this specific joinCode in this component instance.
    if (storyState && joinCode && !hasStoredJoinCode) {
      Logger.App.info(
        `GamePage: Game loaded with code ${joinCode}. Storing code locally.`
      );
      // For a single joined code, the "set" is an array with one element.
      addCodeSetToStorage([joinCode]);
      refreshStoredCodeSets(); // Notify session provider of the change
      fetchStoryFeed(); // Fetch the updated story feed
      setHasStoredJoinCode(true); // Mark as stored to prevent re-storage on re-renders
    }
  }, [
    storyState,
    joinCode,
    refreshStoredCodeSets,
    fetchStoryFeed,
    hasStoredJoinCode,
  ]);

  // Reset attempt counter when storyState is loaded
  useEffect(() => {
    if (storyState) {
      verificationAttemptRef.current = 0;
    }
  }, [storyState]);

  useEffect(() => {
    if (error) {
      Logger.App.error("Game session error:", error);
      // Consider using a notification system here
    }
  }, [error]);

  const handleExitGame = useCallback(() => {
    Logger.App.info("handleExitGame called");
    setIsExiting(true);

    if (sessionId) {
      // Only attempt to exit if there's a session
      gameService.exitStory();
    }
    // wsService.setExternalJoinCode(null); // This is now handled by the useEffect cleanup for joinCode
    setSessionId(null); // Clear session ID on client side
    localStorage.removeItem("sessionId"); // Explicitly remove from localStorage
    navigate("/"); // Navigate to home
  }, [navigate, setSessionId, sessionId]);

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

  // Early return if in the process of exiting - THIS MUST BE AFTER ALL HOOKS
  if (isExiting) {
    Logger.App.debug(
      "GamePage: Rendering minimal view because isExiting is true."
    );
    return (
      <div className="app flex items-center justify-center min-h-screen">
        <p className="text-primary-600">Exiting game...</p>
      </div>
    );
  }

  // Render logic
  if (isConnecting) {
    Logger.App.debug(
      "GamePage: Rendering ConnectingView (WebSocket is connecting)."
    );
    return <ConnectingView />;
  }

  if (!sessionId && isRequestPending("create_session")) {
    Logger.App.debug(
      "GamePage: Rendering ConnectingView (Creating session...)",
      {
        globalPending: isRequestPending("create_session"),
      }
    );
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
    Logger.App.debug(
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
        verificationAttempts: verificationAttemptRef.current,
      }
    );
    return <ConnectingView />;
  }

  // If we reach here, we have a storyState, so render the game UI
  Logger.App.log("GamePage: Rendering GameLayout with storyState.", storyState);
  return (
    <GameLayout
      onExitGame={handleExitGame}
      onChoiceSelected={handleChoiceSelected}
      onCharacterSelected={handleCharacterSelected}
    />
  );
};
