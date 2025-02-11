import { useStory } from "./context/storyContext.ts";
import { StoryInitializer } from "./components/StoryInitializer.tsx";
import { GameLayout } from "./components/GameLayout.tsx";
import { StoryState } from "./types/story";
import { StoryService } from "./services/StoryService.ts";
import { ChangeService } from "./services/ChangeService.ts";
import { useState, useEffect, useCallback, useMemo } from "react";

function App() {
  const { setStoryState, setIsLoading, storyState } = useStory();
  const storyService = useMemo(() => new StoryService(), []);
  const changeService = useMemo(() => new ChangeService(), []);
  const [shouldGenerateNextBeat, setShouldGenerateNextBeat] = useState(false);

  useEffect(() => {
    const lastBeat =
      storyState?.beatHistory?.[storyState.beatHistory.length - 1];
    if (lastBeat && lastBeat.choice >= 0) {
      // Only proceed if lastBeat exists and has a choice
      setShouldGenerateNextBeat(true);
    }
  }, [storyState?.beatHistory]);

  const getNextBeat = useCallback(async () => {
    if (!storyState) return;

    try {
      setIsLoading(true);
      const response = await storyService.generateNextBeat(storyState);
      const { image, ...beat } = response;

      // Apply changes to the story state as specified by the beat
      let updatedState = changeService.applyChanges(storyState, beat.changes);

      // Add the new beat to history and image if present
      updatedState = {
        ...updatedState,
        beatHistory: [...updatedState.beatHistory, beat],
        images: image ? [...updatedState.images, image] : updatedState.images,
      };

      setStoryState(updatedState);
    } catch (error) {
      console.error("Error during beat generation:", error);
    } finally {
      setIsLoading(false);
    }
  }, [storyState, setIsLoading, setStoryState, storyService, changeService]);

  useEffect(() => {
    if (shouldGenerateNextBeat && storyState) {
      setShouldGenerateNextBeat(false);
      getNextBeat();
    }
  }, [shouldGenerateNextBeat, storyState, getNextBeat]);

  const handleStorySetup = async (prompt: string, generateImages: boolean) => {
    const setup = await storyService.initializeStory(prompt);
    const initialState: StoryState = {
      guidelines: setup.guidelines,
      outcomes: setup.outcomes,
      stats: setup.stats,
      npcs: setup.npcs,
      player: setup.pc,
      currentTurn: 1,
      maxTurns: 30,
      beatHistory: [],
      establishedFacts: [],
      generateImages,
      images: [],
    };
    setStoryState(initialState);
    setShouldGenerateNextBeat(true);
  };

  const handleExitGame = () => {
    setStoryState(null);
  };

  const handlePlayerChoice = async (optionIndex: number) => {
    if (!storyState || !storyState.beatHistory.length) return;

    try {
      const currentBeat =
        storyState.beatHistory[storyState.beatHistory.length - 1];

      // Update the choice in the current beat
      const updatedBeat = { ...currentBeat, choice: optionIndex };

      // Apply consequences of the choice
      const updatedState = storyState;

      setStoryState({
        ...updatedState,
        currentTurn: updatedState.currentTurn + 1,
        beatHistory: [...updatedState.beatHistory.slice(0, -1), updatedBeat],
      });
    } catch (error) {
      console.error("Error during handlePlayerChoice:", error);
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
