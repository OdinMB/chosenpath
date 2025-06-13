import { useState, useMemo, useCallback, useEffect } from "react";
import { PlayerCount, GameMode, GameModes, DifficultyLevel } from "core/types";
import { PrimaryButton, Icons } from "components/ui";
import { Logger } from "shared/logger";
import { PlayerCodes } from "./PlayerCodes";
import { MIN_PLAYERS, MAX_PLAYERS, DEFAULT_TURNS } from "core/config";
import { useNavigate } from "react-router-dom";
import { useStoryCreation } from "page/hooks/useStoryCreation";
import { notificationService } from "shared/notifications/notificationService";
import {
  DEFAULT_DIFFICULTY_LEVELS,
  getDefaultDifficultyLevel,
} from "core/utils/difficultyUtils.ts";
import { DifficultySlider } from "./DifficultySlider";

interface StoryInitializerProps {
  onBack: () => void;
  onSetup?: (options: {
    prompt: string;
    playerCount: PlayerCount;
    maxTurns: number;
    gameMode: GameMode;
    generateImages: boolean;
    difficultyLevel?: DifficultyLevel;
  }) => Promise<void>;
  initialPlayerCount?: PlayerCount;
  initialMaxTurns?: number;
  initialGameMode?: GameMode;
  showBackButton?: boolean;
  isLoading?: boolean;
  templateMode?: boolean;
  showDifficultySlider?: boolean;
  initialPrompt?: string;
  onPlayerCountChange?: (playerCount: PlayerCount) => void;
  onPromptChange?: (prompt: string) => void;
}

export const StoryInitializer = ({
  onBack,
  onSetup,
  initialPlayerCount,
  initialMaxTurns,
  initialGameMode,
  showBackButton = true,
  isLoading: externalIsLoading,
  templateMode = false,
  showDifficultySlider = true,
  initialPrompt,
  onPlayerCountChange,
  onPromptChange,
}: StoryInitializerProps) => {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [playerCount, setPlayerCount] = useState<PlayerCount>(
    initialPlayerCount || MIN_PLAYERS
  );
  const [maxTurns] = useState<number>(initialMaxTurns || DEFAULT_TURNS);
  const [generateImages, setGenerateImages] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>(
    initialGameMode || GameModes.Cooperative
  );
  const [usedPromptIndices, setUsedPromptIndices] = useState<Set<number>>(
    new Set()
  );
  const [selectedDifficultyLevel, setSelectedDifficultyLevel] =
    useState<DifficultyLevel>(getDefaultDifficultyLevel());

  const navigate = useNavigate();

  // Handle changes to initialPlayerCount prop
  useEffect(() => {
    if (initialPlayerCount !== undefined) {
      setPlayerCount(initialPlayerCount);
    }
  }, [initialPlayerCount]);

  // Handle changes to initialPrompt prop
  useEffect(() => {
    if (initialPrompt !== undefined) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  const {
    isLoading: internalIsLoading,
    storyId,
    playerCodes,
    storyReady,
    createStory,
    handleCodeSubmit,
  } = useStoryCreation();

  const storyPrompts = useMemo(
    () => ({
      singlePlayer: [
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

    if (onPromptChange) {
      onPromptChange(newPrompt);
    }
  };

  const handleDifficultyChange = (difficultyLevel: DifficultyLevel) => {
    setSelectedDifficultyLevel(difficultyLevel);
    Logger.App.log(
      `Updated difficulty level to: ${difficultyLevel.title} (${difficultyLevel.modifier})`
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (templateMode && onSetup) {
      try {
        await onSetup({
          prompt,
          playerCount,
          maxTurns,
          gameMode,
          generateImages,
          difficultyLevel: selectedDifficultyLevel,
        });
      } catch (error) {
        console.error("Error during template AI draft setup:", error);
        notificationService.addErrorNotification(
          "Failed to draft template content. Please try again."
        );
      }
    } else {
      try {
        await createStory({
          prompt,
          playerCount,
          maxTurns,
          generateImages,
          gameMode,
          difficultyLevel: selectedDifficultyLevel,
        });

        if (storyId) {
          navigate(`/story/${storyId}`);
        }
      } catch (error) {
        console.error(error);
        notificationService.addErrorNotification();
      }
    }
  };

  const handleGameModeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    let mode: GameMode;

    if (value <= 0.33) {
      mode = GameModes.Cooperative;
    } else if (value <= 0.66) {
      mode = GameModes.CooperativeCompetitive;
    } else {
      mode = GameModes.Competitive;
    }

    setGameMode(mode);
    Logger.App.log(`Updated game mode to: ${mode}`);
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);

    if (onPromptChange) {
      onPromptChange(e.target.value);
    }
  };

  const currentIsLoading = templateMode ? externalIsLoading : internalIsLoading;

  if (storyId && playerCodes) {
    return (
      <PlayerCodes
        codes={playerCodes}
        onCodeSubmit={handleCodeSubmit}
        storyReady={storyReady}
      />
    );
  }

  const FormWrapper = templateMode ? "div" : "form";
  const submitButtonType = templateMode ? "button" : "submit";

  return (
    <div className="p-4 md:p-6 font-lora">
      <FormWrapper
        onSubmit={!templateMode ? handleSubmit : undefined}
        className="max-w-2xl mx-auto space-y-6"
      >
        {/* Player Count and Game Mode Box */}
        <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-6">
          {/* Player Count */}
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
              onChange={(e) => {
                const value = Number(e.target.value) as PlayerCount;
                setPlayerCount(value);
                // Reset game mode to cooperative if switching to single player
                if (value === 1) {
                  setGameMode(GameModes.Cooperative);
                }
                Logger.App.log(`Updated player count to: ${value}`);
                if (onPlayerCountChange) {
                  onPlayerCountChange(value);
                }
              }}
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            />
            <div className="flex justify-between text-xs md:text-sm text-primary-600">
              <span>{MIN_PLAYERS} Player</span>
              <span>{MAX_PLAYERS} Players</span>
            </div>
          </div>

          {/* Game Mode Slider - Only show for multiplayer */}
          {playerCount > 1 && (
            <div className="space-y-2">
              <label
                htmlFor="game-mode"
                className="text-sm md:text-base font-medium text-primary"
              >
                Game Mode:{" "}
                {gameMode
                  .replace(/-/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase())}
              </label>
              <input
                id="game-mode"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={
                  gameMode === GameModes.Cooperative
                    ? 0
                    : gameMode === GameModes.CooperativeCompetitive
                    ? 0.5
                    : 1
                }
                onChange={handleGameModeChange}
                className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
              />
              <div className="flex justify-between text-xs md:text-sm text-primary-600">
                <span>Cooperative</span>
                <span>Mixed</span>
                <span>Competitive</span>
              </div>
            </div>
          )}
        </div>

        {/* Story Prompt Box */}
        <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between">
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
              disabled={currentIsLoading}
            >
              Get suggestion
            </PrimaryButton>
          </div>
          <textarea
            id="prompt"
            value={prompt}
            onChange={handlePromptChange}
            className={`w-full min-h-[120px] md:min-h-[100px] rounded-lg border border-primary-100 shadow-sm px-3 md:px-4 py-2 md:py-3 text-base md:text-lg text-primary placeholder-primary-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white`}
            placeholder={getPlaceholderText()}
            disabled={currentIsLoading}
            required
          />
        </div>

        {/* Difficulty Level Box */}
        {showDifficultySlider && (
          <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md">
            <DifficultySlider
              selectedDifficultyLevel={selectedDifficultyLevel}
              availableDifficultyLevels={DEFAULT_DIFFICULTY_LEVELS}
              onChange={handleDifficultyChange}
              disabled={currentIsLoading}
              sliderLabelMin="Easier"
              sliderLabelMax="Harder"
            />
          </div>
        )}

        {/* Images Box - Conditionally render if not in templateMode */}
        {!templateMode && (
          <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md">
            <div className="items-center flex">
              <input
                id="generate-images"
                type="checkbox"
                checked={generateImages}
                onChange={(e) => setGenerateImages(e.target.checked)}
                className="h-5 w-5 md:h-6 md:w-6 rounded border-primary-100 text-accent focus:ring-accent"
                disabled={currentIsLoading}
              />
              <label
                htmlFor="generate-images"
                className="ml-3 md:ml-4 text-sm md:text-base font-medium text-primary"
              >
                Generate images for this story
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-row gap-3 sm:gap-4 pt-2">
          {showBackButton && (
            <PrimaryButton
              type="button"
              size="lg"
              onClick={onBack}
              variant="outline"
              leftBorder={false}
              leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
            >
              Back
            </PrimaryButton>
          )}

          <PrimaryButton
            type={submitButtonType}
            onClick={templateMode ? handleSubmit : undefined}
            size="lg"
            disabled={currentIsLoading}
            fullWidth
            className="font-semibold text-lg"
          >
            {templateMode ? "Draft World" : "Create Story"}
          </PrimaryButton>
        </div>
      </FormWrapper>
    </div>
  );
};
