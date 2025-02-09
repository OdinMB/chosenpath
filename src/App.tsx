import { useStory } from "./context/storyContext.ts";
import { StoryInitializer } from "./components/StoryInitializer.tsx";
import { GameLayout } from "./components/GameLayout.tsx";
import { StorySetup, StoryState } from "./types/story";
import { StoryService } from "./services/StoryService.ts";

function createInitialState(setup: StorySetup): StoryState {
  return {
    guidelines: setup.guidelines,
    outcomes: setup.outcomes,
    stats: setup.stats,
    npcs: setup.npcs,
    player: setup.pc,
    currentTurn: 1,
    maxTurns: 30,
    beatArchive: [],
    currentBeat: undefined,
    previousBeat: undefined,
    narrativeConsequences: [],
  };
}

function App() {
  const { setStoryState, setIsLoading, storyState } = useStory();
  const storyService = new StoryService();

  const handleStorySetup = async (setup: StorySetup) => {
    const initialState = createInitialState(setup);
    setStoryState(initialState); // to move from the story initializer to the game layout

    setIsLoading(true);
    try {
      const firstBeat = await storyService.generateNextBeat(initialState);
      setStoryState({
        ...initialState,
        currentBeat: firstBeat,
      });
    } catch (error) {
      console.error("Error during story setup:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExitGame = () => {
    setStoryState(null);
  };

  const handlePlayerChoice = async (optionIndex: number) => {
    console.log("Player choice:", optionIndex);
    return;
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
