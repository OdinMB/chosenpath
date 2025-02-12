import { useStory } from "./hooks/useStory";
import { StoryInitializer } from "./components/StoryInitializer";
import { GameLayout } from "./components/GameLayout";
import { wsService } from "./services/WebSocketService.ts";

function App() {
  const { setStoryState, setIsLoading, storyState, sessionId, setSessionId } =
    useStory();

  const handleStorySetup = (prompt: string, generateImages: boolean) => {
    setIsLoading(true);
    wsService.initializeStory(prompt, generateImages);
  };

  const handleExitGame = () => {
    setStoryState(null);
    setSessionId(null);
  };

  const handlePlayerChoice = (optionIndex: number) => {
    if (!storyState || !sessionId) {
      console.warn("[App] Cannot make choice: missing storyState or sessionId");
      return;
    }
    console.log("[App] Processing player choice:", {
      optionIndex,
      sessionId,
      currentTurn: storyState.currentTurn
    });
    setIsLoading(true);
    wsService.makeChoice(optionIndex);
  };

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
