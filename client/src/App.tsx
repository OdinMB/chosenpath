import { useSession } from "@common/useSession";
import { StoryInitializer } from "@page/StoryInitializer";
import { GameLayout } from "@game/components/GameLayout";
import { wsService } from "@common/WebSocketService";
import { gameService } from "@game/GameService";
import { useEffect, useState, useCallback, useRef } from "react";
import { WelcomeScreen } from "@page/WelcomeScreen";
import { PlayerCodes } from "@page/PlayerCodes";
import { GameMode, StoryTemplate } from "@core/types";
import { RateLimitNotification } from "@components/RateLimitNotification";
import { AppTitle } from "@components/AppTitle";
import { TemplateConfigurator } from "@page/TemplateConfigurator";
import { Logger } from "@common/logger";

// Add this type at the top with the imports
type ViewState =
  | "CONNECTING"
  | "WELCOME"
  | "SETUP"
  | "PLAYER_CODES"
  | "GAME"
  | "TEMPLATE_CONFIG";

function App() {
  const {
    setStoryState,
    setIsLoading,
    storyState,
    sessionId,
    setSessionId,
    transientStoryCodes,
    setTransientStoryCodes,
    storyReady,
    setStoryReady,
    error,
    setError,
    rateLimit,
    setRateLimit,
    isRequestPending,
    isOperationRunning,
    isConnecting,
  } = useSession();
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [viewState, setViewState] = useState<ViewState>("CONNECTING");
  const [selectedTemplate, setSelectedTemplate] =
    useState<StoryTemplate | null>(null);
  const templateConfigPending = useRef(false);

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
      Logger.App.log(`View state changing from ${viewState} to ${newState}`);
      setViewState(newState);
    },
    [viewState]
  );

  useEffect(() => {
    // If we're connecting, stay in connecting state
    if (isConnecting && viewState !== "CONNECTING") {
      loggedSetViewState("CONNECTING");
      return;
    }

    // If we're transitioning to TEMPLATE_CONFIG or already there, don't interfere
    if (templateConfigPending.current || viewState === "TEMPLATE_CONFIG") {
      if (templateConfigPending.current && viewState === "TEMPLATE_CONFIG") {
        // Reset the flag once we're in the template config state
        templateConfigPending.current = false;
      }

      // Add a check for transientStoryCodes to transition from TEMPLATE_CONFIG to PLAYER_CODES
      if (viewState === "TEMPLATE_CONFIG" && transientStoryCodes) {
        Logger.App.log(
          "Transitioning from TEMPLATE_CONFIG to PLAYER_CODES due to codes received"
        );
        loggedSetViewState("PLAYER_CODES");
        return;
      }

      return;
    }

    // If we're connected but have no session or player code, go to welcome
    if (!sessionId && !playerCode && wsService.isConnected()) {
      if (viewState === "CONNECTING") {
        loggedSetViewState("WELCOME");
      }
      return;
    }

    // If we have a session or player code, we're in a valid state
    if (sessionId || playerCode) {
      if (viewState === "SETUP") {
        // If we have story codes, go to codes view
        Logger.App.log(
          "in viewState SETUP, transientStoryCodes:",
          transientStoryCodes
        );
        if (transientStoryCodes) {
          Logger.App.log(
            "in viewState SETUP, transientStoryCodes are truthy -> going to PLAYER_CODES"
          );
          loggedSetViewState("PLAYER_CODES");
        } else {
          Logger.App.log(
            "in viewState SETUP, transientStoryCodes are falsy -> staying in SETUP"
          );
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
      } else if (viewState === "WELCOME") {
        if (storyState) {
          loggedSetViewState("GAME");
        }
      } else {
        loggedSetViewState("WELCOME");
      }
    }
  }, [
    sessionId,
    storyState,
    playerCode,
    transientStoryCodes,
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

  const handleStorySetup = (options: {
    prompt: string;
    generateImages: boolean;
    playerCount: number;
    maxTurns: number;
    gameMode: GameMode;
  }) => {
    Logger.App.log("handleStorySetup called, initializing a new story");
    setIsLoading(true);
    setPlayerCode(null);
    setStoryReady(false); // Reset story ready state when starting a new story
    localStorage.removeItem(playerCodeKey);

    // Make sure transientStoryCodes is null before starting a new story
    setTransientStoryCodes(null);

    gameService.initializeStory(
      options.prompt,
      options.generateImages,
      options.playerCount,
      options.maxTurns,
      options.gameMode
    );
  };

  const handleSelectTemplate = (template: StoryTemplate) => {
    Logger.App.log(`handleSelectTemplate called with template: ${template.id}`);

    // Ensure we have a valid template object before changing state
    if (!template || !template.id) {
      Logger.App.error("Invalid template object:", template);
      return;
    }

    // Set a flag to indicate we're about to show template config
    templateConfigPending.current = true;

    // Set the selected template first
    setSelectedTemplate(template);

    // Then change view state
    loggedSetViewState("TEMPLATE_CONFIG");
  };

  const handleConfigureTemplate = (options: {
    templateId: string;
    playerCount: number;
    maxTurns: number;
  }) => {
    Logger.App.log("handleConfigureTemplate called with options:", options);

    setIsLoading(true);
    setPlayerCode(null);
    setStoryReady(false);
    localStorage.removeItem(playerCodeKey);

    // Make sure to clear any existing story codes first
    setTransientStoryCodes(null);

    // Initialize story from template
    gameService.initializeFromTemplate(
      options.templateId,
      options.playerCount,
      options.maxTurns
    );

    // Set the template pending flag to prevent premature state transitions
    // until we receive the story codes
    templateConfigPending.current = true;
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
    setTransientStoryCodes(null);
    setSessionId(null);
    setPlayerCode(null);
    localStorage.removeItem(playerCodeKey);
    loggedSetViewState("WELCOME");
  };

  const handleNewStory = () => {
    Logger.App.log("handleNewStory called, clearing story state and codes");
    setStoryState(null);
    setTransientStoryCodes(null);
    loggedSetViewState("SETUP");
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

      case "WELCOME":
        return (
          <>
            <div className="max-w-md mx-auto pt-4">
              <AppTitle size="large" />
            </div>
            <WelcomeScreen
              onCodeSubmit={handleCodeSubmit}
              onNewStory={handleNewStory}
              onSelectTemplate={handleSelectTemplate}
            />
          </>
        );

      case "SETUP":
        Logger.App.log("in viewState SETUP, rendering StoryInitializer");
        return (
          <>
            <div className="max-w-2xl mx-auto pt-4">
              <AppTitle
                size="large"
                onClick={() => {
                  setTransientStoryCodes(null);
                  loggedSetViewState("WELCOME");
                }}
              />
            </div>
            <StoryInitializer
              onSetup={handleStorySetup}
              onBack={() => {
                setTransientStoryCodes(null);
                loggedSetViewState("WELCOME");
              }}
            />
          </>
        );

      case "TEMPLATE_CONFIG":
        // Check if we have a template to configure
        if (!selectedTemplate) {
          Logger.App.log(
            "In TEMPLATE_CONFIG but no selectedTemplate, redirecting to WELCOME"
          );
          // Schedule the redirect in the next tick to avoid state update during render
          setTimeout(() => loggedSetViewState("WELCOME"), 0);
          // Return a loading indicator while redirecting
          return (
            <div className="app flex items-center justify-center min-h-screen">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-primary-600">Loading...</p>
              </div>
            </div>
          );
        }

        Logger.App.log(
          `Rendering TemplateConfigurator with template: ${selectedTemplate.id}`
        );

        return (
          <>
            <div className="max-w-2xl mx-auto pt-4">
              <AppTitle
                size="large"
                onClick={() => {
                  setSelectedTemplate(null);
                  loggedSetViewState("WELCOME");
                }}
              />
            </div>
            <TemplateConfigurator
              template={selectedTemplate}
              onBack={() => {
                setSelectedTemplate(null);
                loggedSetViewState("WELCOME");
              }}
              onConfigure={handleConfigureTemplate}
            />
          </>
        );

      case "PLAYER_CODES": {
        // If we're in PLAYER_CODES state but don't have transientStoryCodes,
        // redirect to SETUP state instead of conditionally rendering StoryInitializer
        if (!transientStoryCodes) {
          Logger.App.log(
            "In PLAYER_CODES but no transientStoryCodes, redirecting to SETUP"
          );
          loggedSetViewState("SETUP");
          return null; // Return null while redirecting to avoid flash of UI
        }

        // Check if we're coming from template configuration
        const isFromTemplate = templateConfigPending.current;

        // Reset template pending flag since we're now showing codes
        if (isFromTemplate) {
          templateConfigPending.current = false;
        }

        return (
          <>
            <div className="max-w-2xl mx-auto p-4 md:p-6">
              <AppTitle size="large" />
            </div>
            <PlayerCodes
              codes={transientStoryCodes}
              onBack={() => {
                setTransientStoryCodes(null);
                loggedSetViewState("WELCOME");
              }}
              onCodeSubmit={handleCodeSubmit}
              storyReady={storyReady}
              onGoToWelcome={() => {
                setTransientStoryCodes(null);
                loggedSetViewState("WELCOME");
              }}
              isTemplateFlow={isFromTemplate}
            />
          </>
        );
      }

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
