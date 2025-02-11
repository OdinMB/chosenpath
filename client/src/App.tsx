import { useStory } from "./contexts/StoryContext";
import { StoryInitializer } from "./components/StoryInitializer";
import { GameLayout } from "./components/GameLayout";
import { useState, useEffect } from "react";
import { apiService } from "./services/ApiService.js";

function App() {
  const { setStoryState, setIsLoading, storyState, sessionId, setSessionId } =
    useStory();
  const [shouldGenerateNextBeat, setShouldGenerateNextBeat] = useState(false);

  useEffect(() => {
    const lastBeat =
      storyState?.beatHistory?.[storyState.beatHistory.length - 1];
    if (lastBeat && lastBeat.choice >= 0) {
      setShouldGenerateNextBeat(true);
    }
  }, [storyState?.beatHistory]);

  useEffect(() => {
    if (shouldGenerateNextBeat && storyState && sessionId) {
      setShouldGenerateNextBeat(false);
      generateNextBeat();
    }
  }, [shouldGenerateNextBeat, storyState, sessionId]);

  const generateNextBeat = async () => {
    if (!storyState || !sessionId) return;

    try {
      setIsLoading(true);
      const beat = await apiService.generateNextBeat(sessionId);

      // Update the client-side state with the new beat
      const updatedState = {
        ...storyState,
        beatHistory: [...storyState.beatHistory, beat],
      };
      setStoryState(updatedState);
    } catch (error) {
      console.error("Error during beat generation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStorySetup = async (prompt: string, generateImages: boolean) => {
    try {
      setIsLoading(true);
      const { sessionId: newSessionId, state } =
        await apiService.initializeStory(prompt, generateImages);
      setSessionId(newSessionId);
      setStoryState(state);
      // Initial state will be set via WebSocket
      setShouldGenerateNextBeat(true);
    } catch (error) {
      console.error("Error during story setup:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExitGame = () => {
    setStoryState(null);
    setSessionId(null);
  };

  const handlePlayerChoice = async (optionIndex: number) => {
    if (!storyState || !sessionId || !storyState.beatHistory.length) return;

    try {
      setIsLoading(true);

      // Update the current beat with the player's choice
      const updatedBeatHistory = [...storyState.beatHistory];
      const currentBeat = updatedBeatHistory[updatedBeatHistory.length - 1];
      updatedBeatHistory[updatedBeatHistory.length - 1] = {
        ...currentBeat,
        choice: optionIndex,
      };

      setStoryState({
        ...storyState,
        beatHistory: updatedBeatHistory,
      });

      await apiService.makeChoice(sessionId, optionIndex);
      // State will be updated via WebSocket or next beat generation
    } catch (error) {
      console.error("Error during handlePlayerChoice:", error);
    } finally {
      setIsLoading(false);
    }
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
