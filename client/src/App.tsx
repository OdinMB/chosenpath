import { useSession } from "./hooks/useSession.js";
import { StoryInitializer } from "./components/StoryInitializer.js";
import { GameLayout } from "./components/GameLayout.js";
import { wsService } from "./services/WebSocketService.js";
import { gameService } from "./services/GameService.js";
import { useEffect, useState } from "react";
import { getCurrentTurn } from "../../shared/utils/storyUtils.js";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { PlayerCodes } from "./components/PlayerCodes";

// Add this type at the top with the imports
type ViewState = 'CONNECTING' | 'WELCOME' | 'SETUP' | 'PLAYER_CODES' | 'GAME';

function App() {
  const { 
    setStoryState, 
    setIsLoading, 
    storyState, 
    sessionId, 
    setSessionId,
    storyCodes 
  } = useSession();
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [viewState, setViewState] = useState<ViewState>('CONNECTING');
  const [playerCode, setPlayerCode] = useState<string | null>(
    localStorage.getItem('playerCode')
  );

  // Update initial view state based on connection
  useEffect(() => {
    if (!sessionId) {
      setViewState('CONNECTING');
    } else if (!storyState) {
      setViewState('WELCOME'); // Always show welcome screen initially
    }
  }, [sessionId, storyState]);

  useEffect(() => {
    if (!sessionId && !isCreatingSession && wsService.isConnected()) {
      console.log('[App] No session found, requesting new session');
      setIsCreatingSession(true);
      wsService.sendMessage({ type: "create_session" });
    }
  }, [sessionId, isCreatingSession]);

  useEffect(() => {
    if (sessionId) {
      setIsCreatingSession(false);
    }
  }, [sessionId]);

  // Update view state when codes are received
  useEffect(() => {
    if (storyCodes && viewState === 'SETUP') {
      setViewState('PLAYER_CODES');
    }
  }, [storyCodes, viewState]);

  const handleStorySetup = (prompt: string, generateImages: boolean, playerCount: number) => {
    setIsLoading(true);
    gameService.initializeStory(prompt, generateImages, playerCount);
  };

  const handleCodeSubmit = (code: string) => {
    setPlayerCode(code);
    localStorage.setItem('playerCode', code);
    setViewState('SETUP');
  };

  const handleExitGame = () => {
    gameService.exitStory();
    setStoryState(null);
    wsService.clearSession();
    setSessionId(null);
    setViewState('WELCOME');
  };

  const handleNewStory = () => {
    setPlayerCode(null);
    localStorage.removeItem('playerCode');
    setStoryState(null);
    setViewState('SETUP');
  };

  const handlePlayerChoice = (optionIndex: number) => {
    if (!storyState || !sessionId) {
      console.warn("[App] Cannot make choice: missing storyState or sessionId");
      return;
    }
    console.log("[App] Processing player choice:", {
      optionIndex,
      sessionId,
      currentTurn: getCurrentTurn(storyState)
    });
    setIsLoading(true);
    gameService.makeChoice(optionIndex);
  };

  // Simplified view rendering
  switch (viewState) {
    case 'CONNECTING':
      return (
        <div className="app flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-gray-600">Connecting...</p>
          </div>
        </div>
      );

    case 'WELCOME':
      return <WelcomeScreen 
        onCodeSubmit={handleCodeSubmit} 
        onNewStory={handleNewStory}
        existingPlayerCode={playerCode} 
      />;

    case 'SETUP':
      return <StoryInitializer 
        onSetup={handleStorySetup} 
        onBack={() => setViewState('WELCOME')} 
      />;

    case 'PLAYER_CODES':
      return storyCodes ? (
        <PlayerCodes 
          codes={storyCodes} 
          onBack={() => setViewState('WELCOME')}
          onCodeSubmit={handleCodeSubmit}
        />
      ) : (
        <StoryInitializer 
          onSetup={handleStorySetup}
          onBack={() => setViewState('WELCOME')} 
        />
      );

    case 'GAME':
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
}

export default App;
