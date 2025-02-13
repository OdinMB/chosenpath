import { useSession } from "./hooks/useSession.js";
import { StoryInitializer } from "./components/StoryInitializer.js";
import { GameLayout } from "./components/GameLayout.js";
import { wsService } from "./services/WebSocketService.js";
import { gameService } from "./services/GameService.js";
import { useEffect, useState } from "react";

function App() {
  const { setStoryState, setIsLoading, storyState, sessionId, setSessionId } =
    useSession();
  const [isCreatingSession, setIsCreatingSession] = useState(false);

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

  const handleStorySetup = (prompt: string, generateImages: boolean) => {
    if (!sessionId) {
      console.warn('[App] Cannot initialize story: waiting for session');
      return;
    }
    setIsLoading(true);
    gameService.initializeStory(prompt, generateImages);
  };

  const handleExitGame = () => {
    gameService.exitStory();
    setStoryState(null);
    wsService.clearSession();
    setSessionId(null);
    setIsCreatingSession(false);
  };

  const handlePlayerChoice = (optionIndex: number) => {
    if (!storyState || !sessionId) {
      console.warn("[App] Cannot make choice: missing storyState or sessionId");
      return;
    }
    console.log("[App] Processing player choice:", {
      optionIndex,
      sessionId,
      currentTurn: storyState.beatHistory.length
    });
    setIsLoading(true);
    gameService.makeChoice(optionIndex);
  };

  // Only show loading state when creating initial session
  if (!sessionId && isCreatingSession) {
    return (
      <div className="app flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Connecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {storyState ? (
        <GameLayout
          onExitGame={handleExitGame}
          onChoiceSelected={handlePlayerChoice}
        />
      ) : (
        <StoryInitializer onSetup={handleStorySetup} />
      )}
    </div>
  );
}

export default App;
