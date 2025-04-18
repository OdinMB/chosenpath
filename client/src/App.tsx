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
import { config } from "@/config";

// Add this type at the top with the imports
type ViewState =
  | "CONNECTING"
  | "WELCOME"
  | "SETUP"
  | "PLAYER_CODES"
  | "GAME"
  | "TEMPLATE_CONFIG";

// Define story creation types to unify handling
type StoryCreationType = "PREMISE" | "TEMPLATE" | "NONE";

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
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  // Replace templateConfigPending with a more general story creation status
  const storyCreationStatus = useRef<StoryCreationType>("NONE");

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

  // Function to load a template by ID
  const loadTemplateById = useCallback(
    async (templateId: string) => {
      if (isLoadingTemplate) return;

      setIsLoadingTemplate(true);
      Logger.App.log(`Loading template with ID: ${templateId}`);

      try {
        const response = await fetch(
          `${config.apiUrl}/templates/${templateId}`
        );

        if (!response.ok) {
          throw new Error(`Failed to load template: ${response.status}`);
        }

        const data = await response.json();
        Logger.App.log(`Successfully loaded template: ${data.template.title}`);

        // Set template and transition to template config view
        setSelectedTemplate(data.template);
        loggedSetViewState("TEMPLATE_CONFIG");
      } catch (error) {
        Logger.App.error(`Failed to load template ${templateId}`, error);
        setError(
          "Failed to load shared template. It may have been removed or is no longer available."
        );
      } finally {
        setIsLoadingTemplate(false);
      }
    },
    [
      isLoadingTemplate,
      setIsLoadingTemplate,
      setSelectedTemplate,
      loggedSetViewState,
      setError,
    ]
  );

  // Check for shared template URL pattern on load
  useEffect(() => {
    const checkForSharedTemplate = async () => {
      const path = window.location.pathname;
      const templateShareMatch = path.match(/^\/share\/template\/([^/]+)$/);

      if (templateShareMatch && templateShareMatch[1]) {
        const templateId = templateShareMatch[1];
        Logger.App.log(`Found shared template ID in URL: ${templateId}`);

        // Remove the template ID from the URL to prevent reloading on refresh
        window.history.replaceState({}, document.title, "/");

        // Load the shared template
        await loadTemplateById(templateId);
      }
    };

    if (!isConnecting && viewState === "WELCOME") {
      checkForSharedTemplate();
    }
  }, [isConnecting, viewState, loadTemplateById]);

  useEffect(() => {
    // If we need to show connecting screen
    if (isConnecting) {
      if (viewState !== "CONNECTING") {
        loggedSetViewState("CONNECTING");
      }
      return;
    }

    // Once we're done connecting, go to welcome if we don't have a state to restore
    if (viewState === "CONNECTING" && !storyState) {
      Logger.App.log("Connection complete, transitioning to WELCOME");
      loggedSetViewState("WELCOME");
      return;
    }

    // If we have a session or player code, handle view transitions
    if (sessionId || playerCode) {
      // For both story creation flows: check if we have story codes and transition to PLAYER_CODES
      if (
        (viewState === "SETUP" || viewState === "TEMPLATE_CONFIG") &&
        transientStoryCodes
      ) {
        Logger.App.log(
          `Transitioning from ${viewState} to PLAYER_CODES due to codes received`
        );

        // Reset creation status when transitioning to player codes
        if (storyCreationStatus.current !== "NONE") {
          storyCreationStatus.current = "NONE";
        }

        loggedSetViewState("PLAYER_CODES");
      }
      // If we're in player codes and have story state, transition to game
      else if (viewState === "PLAYER_CODES" && storyState) {
        loggedSetViewState("GAME");
      }
      // If we're at welcome and have a loaded story state, transition to game
      else if (viewState === "WELCOME" && storyState) {
        loggedSetViewState("GAME");
      }
    }
  }, [
    sessionId,
    storyState,
    playerCode,
    transientStoryCodes,
    viewState,
    loggedSetViewState,
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

  // Helper function to reset all story creation state
  const resetStoryCreationState = useCallback(() => {
    setTransientStoryCodes(null);
    setIsLoading(false);
    storyCreationStatus.current = "NONE";
  }, [setTransientStoryCodes, setIsLoading]);

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

    // Set story creation status to PREMISE
    storyCreationStatus.current = "PREMISE";

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

    // Reset loading state and story state
    resetStoryCreationState();

    // Set a flag to indicate we're about to show template config
    storyCreationStatus.current = "TEMPLATE";

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
    storyCreationStatus.current = "TEMPLATE";
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
    resetStoryCreationState();
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
                resetStoryCreationState();
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
                  resetStoryCreationState();
                  loggedSetViewState("WELCOME");
                }}
              />
            </div>
            <TemplateConfigurator
              template={selectedTemplate}
              onBack={() => {
                setSelectedTemplate(null);
                resetStoryCreationState();
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

        // Check if we're coming from template configuration or if there are background operations
        const hasBackgroundOperations = isOperationRunning("initialize_story");
        const isFromTemplate = storyCreationStatus.current === "TEMPLATE";

        // Log status for debugging purposes
        if (hasBackgroundOperations) {
          Logger.App.log("Story initialization still running in background");
        }

        // Reset template pending flag since we're now showing codes
        if (isFromTemplate) {
          storyCreationStatus.current = "NONE";
        }

        return (
          <>
            <div className="max-w-2xl mx-auto p-4 md:p-6">
              <AppTitle size="large" />
            </div>
            <PlayerCodes
              codes={transientStoryCodes}
              onBack={() => {
                resetStoryCreationState();
                loggedSetViewState("WELCOME");
              }}
              onCodeSubmit={handleCodeSubmit}
              storyReady={storyReady}
              onGoToWelcome={() => {
                resetStoryCreationState();
                loggedSetViewState("WELCOME");
              }}
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
