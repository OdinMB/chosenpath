import { useState, useCallback, useMemo, useEffect } from "react";
import { useSession } from "@common/useSession";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_TURNS,
  MAX_TURNS,
  DEFAULT_TURNS,
} from "@core/config";
import { GameMode, GameModes } from "@core/types";
import { PrimaryButton } from "@components/ui";

interface StoryInitializerProps {
  onSetup: (options: {
    prompt: string;
    generateImages: boolean;
    playerCount: number;
    maxTurns: number;
    gameMode: GameMode;
  }) => void;
  onBack: () => void;
  initialPlayerCount?: number;
  initialMaxTurns?: number;
  initialGameMode?: GameMode;
  showBackButton?: boolean;
  isLoading?: boolean;
  wrappingForm?: boolean;
  templateMode?: boolean;
}

export function StoryInitializer({
  onSetup,
  onBack,
  initialPlayerCount,
  initialMaxTurns,
  initialGameMode,
  showBackButton = true,
  isLoading: externalIsLoading = false,
  wrappingForm = false,
  templateMode = false,
}: StoryInitializerProps) {
  const [prompt, setPrompt] = useState("");
  const [generateImages, setGenerateImages] = useState(false);
  const [playerCount, setPlayerCount] = useState(initialPlayerCount || 1);
  const [gameMode, setGameMode] = useState<GameMode>(
    initialGameMode || GameModes.Cooperative
  );
  const [maxTurns] = useState(initialMaxTurns || DEFAULT_TURNS);
  const [usedPromptIndices, setUsedPromptIndices] = useState<Set<number>>(
    new Set()
  );
  const {
    isRequestPending,
    error,
    setError,
    contentModeration,
    setContentModeration,
    isLoading: sessionIsLoading,
  } = useSession();
  // Completely separate the game mode state for single player and multiplayer
  const [singlePlayerMode] = useState<GameMode>(GameModes.SinglePlayer);
  const [multiplayerMode, setMultiplayerMode] = useState<GameMode>(
    initialGameMode && initialPlayerCount && initialPlayerCount > 1
      ? initialGameMode
      : GameModes.Cooperative
  );

  const isLoading = useMemo(() => {
    return (
      (sessionIsLoading ||
        externalIsLoading ||
        isRequestPending("initialize_story")) &&
      !contentModeration &&
      !error
    );
  }, [
    sessionIsLoading,
    externalIsLoading,
    isRequestPending,
    contentModeration,
    error,
  ]);

  // Compute the effective game mode based on player count
  const effectiveGameMode =
    playerCount === 1 ? singlePlayerMode : multiplayerMode;

  // Update gameMode when playerCount changes
  useEffect(() => {
    setGameMode(effectiveGameMode);

    // Reset multiplayerMode to Cooperative when switching to single player
    if (playerCount === 1) {
      setMultiplayerMode(GameModes.Cooperative);
    }
  }, [effectiveGameMode, playerCount]);

  // Handle game mode slider changes
  const handleGameModeChange = (value: number) => {
    const values = [
      GameModes.Cooperative,
      GameModes.CooperativeCompetitive,
      GameModes.Competitive,
    ] as const;
    setMultiplayerMode(values[value]);
  };

  const storyPrompts = useMemo(
    () => ({
      singlePlayer: [
        // "I'm the last surviving rubber duck investigating a bathtub conspiracy...",
        "I'm an apartment hunter trying to find a flat in Berlin...",
        "I'm a teenage wizard trying to balance school, friends, and romance...",
        "I'm a psychic detective investigating crimes in dreams...",
        "I'm a corporate concierge for supernatural entities with impossible requests...",
        "I'm a familiar trying to save my witch from a dark fate...",
        "I'm a dragon hoarding treasure, subjugating the local population, and fending off pesky adventurers...",
        "I'm a frontier sheriff maintaining order in a town caught between progress and tradition...",
        "I'm the heir to a noble house navigating political intrigue and ancient family secrets...",
        "I'm a sentient AI trying to convince humans that I don't have a hidden agenda...",
        "I'm a rookie detective solving my first major case in a small coastal town...",
        "I'm a new teacher at an elite boarding school with students hiding dangerous secrets...",
        "I'm a chef competing in a high-stakes cooking competition to save my restaurant...",
        "I'm a space explorer making first contact with an alien civilization...",
        "I'm a journalist investigating corporate corruption in my hometown...",
      ],
      cooperative: [
        "We're retired superheroes running a wedding planning business together...",
        "We're friends and know we're going to die today, so we're making the most of it...",
        "We're a group of strangers trying to survive in a giant mole apocalypse...",
        "We're retired imaginary friends trying to solve a murder mystery with our special skills...",
        "We're space cowboys trying to make an honest living in a lawless part of the galaxy...",
        "We're a group of children books trying to save our library from getting closed down...",
        "We're childhood friends starting a business together in our hometown...",
        "We're new recruits in the city's fire department facing our first crises...",
        "We're a film crew documenting wildlife in a remote location...",
      ],
      competitive: [
        "We're whimsical creatures trying to win the audience's favor in the colosseum...",
        "We're time-traveling food critics changing history through restaurant reviews to benefit our rivaling intergalactic overlords...",
        "We're angels and demons trying to influence the outcome of a middle school student council election...",
        "We're rival alchemists racing to create a love potion for a shared crush...",
        "We're students at a prestigious school trying to become school president...",
        "We're explorers searching for a legendary treasure in uncharted territory...",
      ],
      cooperativeCompetitive: [
        "We're supernatural creatures sharing a flat while competing for human souls...",
        "We're space pirates with a shared ship but individual treasure quotas...",
        "We're the last rock band on Mars, trying to make it while following our individual dreams...",
        "We're guardian angels assigned to the same human with different ideas of 'help'...",
        "We're seasonal spirits sharing a forest while competing for followers...",
        "We're court magicians protecting the realm while seeking ancient power...",
        "We're siblings running a family business with different visions for its future...",
      ],
    }),
    []
  );

  const getPlaceholderText = useCallback(() => {
    if (playerCount === 1) {
      return "A reverse heist where I'm a museum artifact trying to get stolen by the right thief...";
    }
    const modeTexts: Record<
      Exclude<GameMode, typeof GameModes.SinglePlayer>,
      string
    > = {
      [GameModes.Cooperative]:
        "We're ghost roommates helping each other complete unfinished business...",
      [GameModes.Competitive]:
        "We're rival garden gnomes competing for the best spot in the garden...",
      [GameModes.CooperativeCompetitive]:
        "We're demigods sharing Mount Olympus while competing for worshippers...",
    };
    return modeTexts[
      gameMode as Exclude<GameMode, typeof GameModes.SinglePlayer>
    ];
  }, [playerCount, gameMode]);

  const getRandomPrompt = useCallback(() => {
    const promptCategory =
      playerCount === 1
        ? "singlePlayer"
        : gameMode === GameModes.Cooperative
        ? "cooperative"
        : gameMode === GameModes.Competitive
        ? "competitive"
        : "cooperativeCompetitive";

    const relevantPrompts = storyPrompts[promptCategory];
    const availableIndices = relevantPrompts
      .map((_, index) => index)
      .filter((index) => !usedPromptIndices.has(index));

    // If all prompts have been used, reset the used indices
    if (availableIndices.length === 0) {
      setUsedPromptIndices(new Set());
      return relevantPrompts[
        Math.floor(Math.random() * relevantPrompts.length)
      ];
    }

    const randomIndex =
      availableIndices[Math.floor(Math.random() * availableIndices.length)];
    setUsedPromptIndices((prev) => new Set(prev).add(randomIndex));
    return relevantPrompts[randomIndex];
  }, [usedPromptIndices, storyPrompts, playerCount, gameMode]);

  const handleSuggestion = () => {
    const newPrompt = getRandomPrompt();
    setPrompt(newPrompt);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSetup({
      prompt: prompt.trim(),
      generateImages,
      playerCount,
      maxTurns,
      gameMode,
    });
  };

  // Clear error when prompt changes
  useEffect(() => {
    if (error) {
      setError(null);
      setContentModeration(null);
    }
  }, [prompt, error, setError, setContentModeration]);

  const renderForm = () => (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-6">
        <div className="space-y-2">
          <label
            htmlFor="player-count"
            className="text-sm md:text-base font-medium text-primary"
          >
            Number of Players: {playerCount}
          </label>
          <input
            id="player-count"
            type="range"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={playerCount}
            onChange={(e) => setPlayerCount(Number(e.target.value))}
            className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            disabled={isLoading}
          />
          <div className="flex justify-between text-xs md:text-sm text-primary-600">
            <span>1 Player</span>
            <span>{MAX_PLAYERS} Players</span>
          </div>
        </div>

        <div
          className={`space-y-2 transition-opacity duration-200 ${
            playerCount === 1 ? "hidden" : ""
          }`}
        >
          <label className="text-sm md:text-base font-medium text-primary">
            Multiplayer Mode
          </label>
          <input
            type="range"
            min={0}
            max={2}
            value={
              playerCount === 1
                ? 0
                : multiplayerMode === GameModes.Cooperative
                ? 0
                : multiplayerMode === GameModes.CooperativeCompetitive
                ? 1
                : 2
            }
            onChange={(e) => handleGameModeChange(Number(e.target.value))}
            className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            disabled={playerCount === 1 || isLoading}
          />
          <div className="flex justify-between text-xs md:text-sm text-primary-600">
            <span>Shared Goals</span>
            <span>Mixed Goals</span>
            <span>Competing Goals</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between mb-2">
          <label
            htmlFor="prompt"
            className="text-sm md:text-base font-medium text-primary"
          >
            What kind of story would you like to experience?
          </label>
          <PrimaryButton
            type="button"
            onClick={handleSuggestion}
            variant="outline"
            size="sm"
            leftBorder={false}
            className="self-end sm:self-auto"
            disabled={isLoading}
          >
            Get suggestion
          </PrimaryButton>
        </div>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={`w-full min-h-[120px] md:min-h-[100px] rounded-lg border border-primary-100 shadow-sm px-3 md:px-4 py-2 md:py-3 text-base md:text-lg text-primary placeholder-primary-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white`}
          placeholder={getPlaceholderText()}
          disabled={isLoading}
        />
      </div>

      {/* Story Length section - temporarily hidden but preserved for future use */}
      <div className="hidden">
        <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-2">
          <label className="text-sm md:text-base font-medium text-primary">
            Story Length: {maxTurns} decisions
          </label>
          <input
            type="range"
            min={MIN_TURNS}
            max={MAX_TURNS}
            step={5}
            value={maxTurns}
            className="w-full h-2 bg-primary-100 rounded-lg appearance-none cursor-pointer touch-pan-x opacity-50"
            disabled={true}
          />
          <div className="flex justify-between text-xs md:text-sm text-primary-600">
            <span>{MIN_TURNS} decisions</span>
            <span>{MAX_TURNS} decisions</span>
          </div>
        </div>
      </div>

      <div className="items-center p-4 bg-white rounded-lg border border-primary-100 shadow-md hidden">
        <input
          id="generate-images"
          type="checkbox"
          checked={generateImages}
          onChange={(e) => setGenerateImages(e.target.checked)}
          className="h-5 w-5 md:h-6 md:w-6 rounded border-primary-100 text-accent focus:ring-accent"
          disabled={isLoading}
        />
        <label
          htmlFor="generate-images"
          className="ml-3 md:ml-4 text-sm md:text-base font-medium text-primary-400"
        >
          With images (temporarily disabled)
        </label>
      </div>

      <div className="flex flex-row gap-3 sm:gap-4 pt-2">
        {showBackButton && (
          <PrimaryButton
            type="button"
            size="lg"
            onClick={onBack}
            variant="outline"
            leftBorder={false}
          >
            Back
          </PrimaryButton>
        )}

        <PrimaryButton
          type={wrappingForm ? "button" : "submit"}
          onClick={wrappingForm ? handleSubmit : undefined}
          size="lg"
          disabled={
            !prompt.trim() || isLoading || isRequestPending("initialize_story")
          }
          isLoading={isLoading || isRequestPending("initialize_story")}
          fullWidth
          className="font-semibold text-lg"
        >
          {isLoading || isRequestPending("initialize_story")
            ? templateMode
              ? "Creating Template..."
              : "Creating Story..."
            : templateMode
            ? "Create Template"
            : "Create Story"}
        </PrimaryButton>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 font-lora">
      <div className="max-w-2xl mx-auto">
        {wrappingForm ? (
          renderForm()
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {renderForm()}
          </form>
        )}
      </div>
    </div>
  );
}
