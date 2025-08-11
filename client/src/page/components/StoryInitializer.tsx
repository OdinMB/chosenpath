import { useState, useMemo, useCallback, useEffect } from "react";
import { PlayerCount, GameMode, GameModes, DifficultyLevel } from "core/types";
import {
  PrimaryButton,
  Icons,
  ColoredBox,
  TextArea,
  InfoIcon,
} from "components/ui";
import { Logger } from "shared/logger";
import { PlayerCodes } from "./PlayerCodes";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_TURNS,
  DISABLE_PREGENERATION_FOR_MULTIPLAYER,
} from "core/config";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStoryCreation } from "page/hooks/useStoryCreation";
import { notificationService } from "shared/notifications/notificationService";
import {
  DEFAULT_DIFFICULTY_LEVELS,
  getDefaultDifficultyLevel,
} from "core/utils/difficultyUtils.js";
import { DifficultySlider } from "./DifficultySlider";
import {
  suggestionData,
  defaultPlaceholders,
  PromptCategory,
} from "../data/suggestionData";
import { StepIndicator } from "./StepIndicator";
import { ConfigSummary } from "./ConfigSummary";

interface CategoryConfig {
  label: string;
  instruction: string;
  fields: Array<{
    key: string;
    label: string;
    placeholder: string;
    type: "textarea" | "inline" | "number";
  }>;
}

interface StoryInitializerProps {
  onBack: () => void;
  onSetup?: (options: {
    prompt: string;
    playerCount: PlayerCount;
    maxTurns: number;
    gameMode: GameMode;
    generateImages: boolean;
    pregenerateBeats?: boolean;
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Parse URL parameters
  const urlStep = parseInt(searchParams.get("step") || "1", 10);
  const urlCategory = searchParams.get("category") as PromptCategory | null;
  const urlPlayerCount = parseInt(
    searchParams.get("players") || "",
    10
  ) as PlayerCount;
  const urlGameMode = searchParams.get("mode") as GameMode | null;
  const urlImages = searchParams.get("images") === "true";
  const urlHasImages = searchParams.has("images");
  const urlPregenerate = searchParams.get("pregenerate") === "true";
  const urlHasPregenerate = searchParams.has("pregenerate");
  const urlPrompt = searchParams.get("prompt");
  const urlDifficulty = searchParams.get("difficulty");

  // Parse category-specific fields from URL
  const urlCategoryFields = useMemo(() => {
    const fields: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith("field_")) {
        fields[key.replace("field_", "")] = value;
      }
    });
    return fields;
  }, [searchParams]);

  // Initialize state with URL params or defaults
  const [currentStep, setCurrentStep] = useState(
    urlStep >= 1 && urlStep <= 3 ? urlStep : 1
  );
  const [prompt, setPrompt] = useState(urlPrompt || initialPrompt || "");
  const [playerCount, setPlayerCount] = useState<PlayerCount>(
    urlPlayerCount >= MIN_PLAYERS && urlPlayerCount <= MAX_PLAYERS
      ? urlPlayerCount
      : initialPlayerCount || MIN_PLAYERS
  );
  const [maxTurns] = useState<number>(initialMaxTurns || DEFAULT_TURNS);
  const [generateImages, setGenerateImages] = useState<boolean>(
    urlHasImages ? urlImages : true
  );
  const [pregenerateBeats, setPregenerateBeats] = useState<boolean>(
    urlHasPregenerate ? urlPregenerate : true
  );
  const [gameMode, setGameMode] = useState<GameMode>(
    urlGameMode && Object.values(GameModes).includes(urlGameMode)
      ? urlGameMode
      : initialGameMode || GameModes.Cooperative
  );
  const [selectedDifficultyLevel, setSelectedDifficultyLevel] =
    useState<DifficultyLevel>(
      urlDifficulty
        ? DEFAULT_DIFFICULTY_LEVELS.find(
            (level) => level.modifier === Number(urlDifficulty)
          ) || getDefaultDifficultyLevel()
        : getDefaultDifficultyLevel()
    );
  const [selectedCategory, setSelectedCategory] = useState<PromptCategory>(
    urlCategory &&
      [
        "flexible",
        "enjoy-fiction",
        "vent-about-reality",
        "pretend-to-be",
        "see-your-future-self",
        "read-with-kids",
        "learn-something",
      ].includes(urlCategory)
      ? urlCategory
      : "enjoy-fiction"
  );
  const [categoryFields, setCategoryFields] = useState<Record<string, string>>(
    Object.keys(urlCategoryFields).length > 0 ? urlCategoryFields : {}
  );
  const [shownSuggestions, setShownSuggestions] = useState<
    Record<string, Set<number>>
  >({});
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState<
    Record<string, number>
  >({});

  // Update URL when relevant state changes
  const updateURLParams = useCallback(
    (updates: Record<string, string | number | boolean | null>) => {
      // Don't update URL parameters when in template mode
      if (templateMode) return;

      const params = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      navigate(`/setup?${params.toString()}`, { replace: true });
    },
    [navigate, searchParams, templateMode]
  );

  const categoryConfigs: Record<PromptCategory, CategoryConfig> = useMemo(
    () => ({
      flexible: {
        label: "be flexible",
        instruction:
          "Create a story based on the user's prompt without specific constraints.",
        fields: [],
      },
      "enjoy-fiction": {
        label: "enjoy fiction",
        instruction:
          "Create an engaging fictional story that prioritizes entertainment, immersion, and narrative satisfaction.",
        fields: [],
      },
      "vent-about-reality": {
        label: "vent about reality",
        instruction:
          "Create a satirical story and/or simulation that allows the user to explore and critique real-world frustrations through fiction.",
        fields: [
          {
            key: "frustration",
            label: "What's bothering you?",
            placeholder: "The impossible housing market in Berlin",
            type: "textarea",
          },
        ],
      },
      "pretend-to-be": {
        label: "pretend to be",
        instruction:
          "Create a role-playing story that allows the user to experience life from a specific perspective or profession.",
        fields: [
          {
            key: "role",
            label: "What role do you want to experience?",
            placeholder: "a deaf person",
            type: "textarea",
          },
          {
            key: "aspects",
            label: "What aspects interest you most?",
            placeholder: "daily challenges",
            type: "textarea",
          },
        ],
      },
      "see-your-future-self": {
        label: templateMode ? "meet their future self" : "meet my future self",
        instruction:
          "Create a story that helps the user visualize their future self and the potential life paths and consequences of current decisions.",
        fields: [
          {
            key: "currentSituation",
            label: "Describe yourself and your situation",
            placeholder:
              "background, identity, career, relationships, location, challenges, ...",
            type: "textarea",
          },
          {
            key: "potentialChanges",
            label: "How is your future self different?",
            placeholder:
              "career switch, moving, lifestyle changes, relationships...",
            type: "textarea",
          },
        ],
      },
      "read-with-kids": {
        label: "read with kids",
        instruction:
          "Create an age-appropriate story designed for shared reading that engages both children and adults.",
        fields: [
          {
            key: "kidAge",
            label: "How old is the child?",
            placeholder: "5, 8-10",
            type: "number",
          },
        ],
      },
      "learn-something": {
        label: "learn something",
        instruction:
          "Create a story that teaches specific concepts in the context of an engaging and entertaining story.",
        fields: [
          {
            key: "learningGoals",
            label: "What should the story teach?",
            placeholder: "How to identify deepfakes and verify sources",
            type: "textarea",
          },
          {
            key: "targetAudience",
            label: "Who is the target audience?",
            placeholder: "journalism students",
            type: "inline",
          },
        ],
      },
    }),
    [templateMode]
  );

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

  const getPlaceholderText = useCallback(() => {
    if (playerCount === 1) {
      return defaultPlaceholders.singlePlayer;
    }
    if (gameMode === GameModes.Cooperative) {
      return defaultPlaceholders.cooperative;
    } else if (gameMode === GameModes.Competitive) {
      return defaultPlaceholders.competitive;
    } else {
      return defaultPlaceholders.cooperativeCompetitive;
    }
  }, [playerCount, gameMode]);

  const getRandomCoordinatedSuggestions = useCallback(
    (
      category: PromptCategory,
      currentPlayerCount: number,
      currentGameMode: GameMode
    ) => {
      const categorySuggestions = suggestionData[category];
      if (!categorySuggestions) return {};

      // Determine the appropriate suggestion set based on player count and game mode
      let relevantSuggestions;
      if (currentPlayerCount === 1) {
        relevantSuggestions = categorySuggestions.suggestions.singlePlayer;
      } else if (currentGameMode === GameModes.Cooperative) {
        relevantSuggestions = categorySuggestions.suggestions.cooperative;
      } else if (currentGameMode === GameModes.Competitive) {
        relevantSuggestions = categorySuggestions.suggestions.competitive;
      } else {
        relevantSuggestions =
          categorySuggestions.suggestions.cooperativeCompetitive;
      }

      if (!relevantSuggestions || relevantSuggestions.length === 0) return {};

      // Create a key for this category + game mode combination
      const suggestionKey = `${category}-${currentPlayerCount}-${currentGameMode}`;
      const shownSet = shownSuggestions[suggestionKey] || new Set<number>();
      const currentIndex = currentSuggestionIndex[suggestionKey];

      // Filter out the first item, already shown suggestions, and current suggestion
      const availableIndices = relevantSuggestions
        .map((_, index) => index)
        .filter((index) => {
          return (
            index > 0 && // Skip first item
            !shownSet.has(index) && // Skip already shown
            index !== currentIndex
          ); // Skip current suggestion
        });

      // If no available suggestions, reset the shown set and try again
      if (availableIndices.length === 0) {
        setShownSuggestions((prev) => ({
          ...prev,
          [suggestionKey]: new Set(),
        }));

        // Retry with reset suggestions, but still exclude current suggestion
        const retryIndices = relevantSuggestions
          .map((_, index) => index)
          .filter((index) => index > 0 && index !== currentIndex);

        // If we still have no options (only 1 suggestion available), try to find any different option
        if (retryIndices.length === 0) {
          const anyOtherIndex = relevantSuggestions
            .map((_, index) => index)
            .find((index) => index !== currentIndex);

          if (anyOtherIndex !== undefined) {
            setCurrentSuggestionIndex((prev) => ({
              ...prev,
              [suggestionKey]: anyOtherIndex,
            }));
            setShownSuggestions((prev) => ({
              ...prev,
              [suggestionKey]: new Set([anyOtherIndex]),
            }));
            return relevantSuggestions[anyOtherIndex];
          }

          // Fallback to first available suggestion if no other options
          return relevantSuggestions[0] || {};
        }

        const randomIndex =
          retryIndices[Math.floor(Math.random() * retryIndices.length)];

        // Mark this suggestion as shown and current
        setCurrentSuggestionIndex((prev) => ({
          ...prev,
          [suggestionKey]: randomIndex,
        }));
        setShownSuggestions((prev) => ({
          ...prev,
          [suggestionKey]: new Set([randomIndex]),
        }));

        return relevantSuggestions[randomIndex];
      }

      // Choose randomly from available suggestions
      const randomIndex =
        availableIndices[Math.floor(Math.random() * availableIndices.length)];

      // Mark this suggestion as shown and current
      setCurrentSuggestionIndex((prev) => ({
        ...prev,
        [suggestionKey]: randomIndex,
      }));
      setShownSuggestions((prev) => ({
        ...prev,
        [suggestionKey]: new Set([...shownSet, randomIndex]),
      }));

      return relevantSuggestions[randomIndex];
    },
    [shownSuggestions, currentSuggestionIndex]
  );

  const handleSuggestion = () => {
    // Get coordinated suggestions for the current category
    const coordinatedSuggestions = getRandomCoordinatedSuggestions(
      selectedCategory,
      playerCount,
      gameMode
    );

    // Set the prompt from the instructions field
    const newPrompt = coordinatedSuggestions.instructions || "";
    setPrompt(newPrompt);

    // Set all the category-specific fields
    setCategoryFields(coordinatedSuggestions);

    // Update URL parameters for all the new values
    const urlUpdates: Record<string, string | null> = {
      prompt: newPrompt || null,
    };

    // Add category field updates to URL
    Object.entries(coordinatedSuggestions).forEach(([key, value]) => {
      if (key !== "instructions" && typeof value === "string") {
        urlUpdates[`field_${key}`] = value || null;
      }
    });

    updateURLParams(urlUpdates);

    if (onPromptChange) {
      onPromptChange(newPrompt);
    }
  };

  const handleCategoryChange = (category: PromptCategory) => {
    setSelectedCategory(category);

    // Clear fields when switching categories - user needs to click "Get suggestion" to populate
    setCategoryFields({});
    setPrompt("");

    // Update URL
    updateURLParams({ category, prompt: null });

    // Reset suggestion history for this category when switching
    setShownSuggestions((prev) => {
      const newShown = { ...prev };
      // Clear all suggestion history for this category
      Object.keys(newShown).forEach((key) => {
        if (key.startsWith(`${category}-`)) {
          delete newShown[key];
        }
      });
      return newShown;
    });

    // Also reset current suggestion index for this category
    setCurrentSuggestionIndex((prev) => {
      const newCurrent = { ...prev };
      Object.keys(newCurrent).forEach((key) => {
        if (key.startsWith(`${category}-`)) {
          delete newCurrent[key];
        }
      });
      return newCurrent;
    });
  };

  const handlePlayerCountChangeInternal = (value: PlayerCount) => {
    setPlayerCount(value);
    // Reset game mode to cooperative if switching to single player
    if (value === 1) {
      setGameMode(GameModes.Cooperative);
      updateURLParams({ players: value, mode: null });
    } else {
      updateURLParams({ players: value });
    }

    // Disable pregeneration for multiplayer if config is set
    if (
      DISABLE_PREGENERATION_FOR_MULTIPLAYER &&
      value >= 2 &&
      pregenerateBeats
    ) {
      setPregenerateBeats(false);
      updateURLParams({ pregenerate: false });
    }

    Logger.App.log(`Updated player count to: ${value}`);
    if (onPlayerCountChange) {
      onPlayerCountChange(value);
    }
  };

  const handleStep1Continue = () => {
    setCurrentStep(2);
    updateURLParams({ step: 2 });
  };

  const handleStep2Continue = () => {
    setCurrentStep(3);
    updateURLParams({ step: 3 });
  };

  const handleBackToStep1 = () => {
    setCurrentStep(1);
    updateURLParams({ step: 1 });
  };

  const handleBackToStep2 = () => {
    setCurrentStep(2);
    updateURLParams({ step: 2 });
  };

  const handleCategoryFieldChange = (fieldKey: string, value: string) => {
    setCategoryFields((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
    updateURLParams({ [`field_${fieldKey}`]: value });
  };

  const buildMergedPrompt = () => {
    if (selectedCategory === "flexible") {
      return prompt;
    }

    const config = categoryConfigs[selectedCategory];
    const instruction = config.instruction;

    let mergedPrompt = `${instruction}\n\n`;

    // Add category-specific field values
    config.fields.forEach((field) => {
      const value = categoryFields[field.key];
      if (value && value.trim()) {
        mergedPrompt += `${field.label}: ${value}\n`;
      }
    });

    if (prompt && prompt.trim()) {
      mergedPrompt += `\nAdditional context: ${prompt}`;
    }

    return mergedPrompt.trim();
  };

  const handleDifficultyChange = (difficultyLevel: DifficultyLevel) => {
    setSelectedDifficultyLevel(difficultyLevel);
    updateURLParams({ difficulty: difficultyLevel.modifier });
    Logger.App.log(
      `Updated difficulty level to: ${difficultyLevel.title} (${difficultyLevel.modifier})`
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const mergedPrompt = buildMergedPrompt();
    console.log("Final prompt being sent to backend:", mergedPrompt);

    // Ensure pregeneration is disabled for multiplayer if config is set
    const finalPregenerateBeats =
      DISABLE_PREGENERATION_FOR_MULTIPLAYER && playerCount >= 2
        ? false
        : pregenerateBeats;

    if (templateMode && onSetup) {
      try {
        await onSetup({
          prompt: mergedPrompt,
          playerCount,
          maxTurns,
          gameMode,
          generateImages,
          pregenerateBeats: finalPregenerateBeats,
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
          prompt: mergedPrompt,
          playerCount,
          maxTurns,
          generateImages,
          pregenerateBeats: finalPregenerateBeats,
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
    updateURLParams({ mode });
    Logger.App.log(`Updated game mode to: ${mode}`);
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPrompt(value);
    updateURLParams({ prompt: value });

    if (onPromptChange) {
      onPromptChange(value);
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

  const renderStep1 = () => {
    const categoryImages: Record<PromptCategory, string> = {
      "enjoy-fiction": "/category-fiction.jpeg",
      "vent-about-reality": "/category-vent.jpeg",
      "pretend-to-be": "/category-pretendtobe.jpeg",
      "read-with-kids": "/category-kids.jpeg",
      "see-your-future-self": "/category-futureself.jpeg",
      "learn-something": "/category-learn.jpeg",
      flexible: "/placeholder-image.png",
    };

    // Filter out 'flexible' category for step 1 display
    const step1Categories = Object.entries(categoryConfigs).filter(
      ([key]) => key !== "flexible"
    );

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl md:text-2xl font-medium text-primary mb-4">
            {templateMode ? "I want players to ..." : "I want to ..."}
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {step1Categories.map(([key, config]) => (
            <ColoredBox
              key={key}
              as="button"
              colorType={selectedCategory === key ? "tertiary" : "secondary"}
              isActive={selectedCategory === key}
              onClick={() => handleCategoryChange(key as PromptCategory)}
              className="p-0 overflow-hidden cursor-pointer flex flex-col h-full"
              disabled={currentIsLoading}
            >
              <div className="relative overflow-hidden h-16 sm:h-20">
                <img
                  src={categoryImages[key as PromptCategory]}
                  alt={config.label}
                  className="absolute w-full h-auto min-h-full transition-transform duration-300 hover:scale-110"
                  style={{
                    objectFit: "cover",
                    top: "-15%",
                    left: 0,
                  }}
                />
              </div>
              <div className="p-1.5 sm:p-2 text-center">
                <span className="text-sm sm:text-sm md:text-base font-medium text-primary">
                  <span className="sm:hidden">
                    {key === "see-your-future-self" && templateMode
                      ? "meet future self"
                      : config.label}
                  </span>
                  <span className="hidden sm:inline">{config.label}</span>
                </span>
              </div>
            </ColoredBox>
          ))}
        </div>

        <div className="flex flex-row gap-3 sm:gap-4 justify-between">
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
            type="button"
            size="lg"
            onClick={handleStep1Continue}
            className="font-semibold flex-1 sm:flex-none sm:min-w-[120px] sm:ml-auto"
          >
            <span className="flex items-center justify-center sm:justify-start gap-2 w-full">
              Continue
              <Icons.ArrowRight className="h-4 w-4 hidden sm:block" />
            </span>
          </PrimaryButton>
        </div>
      </div>
    );
  };

  const renderStep2 = () => {
    return (
      <div className="space-y-4 sm:space-y-6">
        <ConfigSummary
          selectedCategory={selectedCategory}
          categoryConfigs={categoryConfigs}
          playerCount={playerCount}
          gameMode={gameMode}
          generateImages={generateImages}
          pregenerateBeats={pregenerateBeats}
          templateMode={templateMode}
          showPlayerInfo={false}
        />

        {/* Player Count and Game Mode */}
        <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="player-count-step2"
              className="text-sm md:text-base font-medium text-primary"
            >
              Number of Players: {playerCount}
            </label>
            <input
              id="player-count-step2"
              type="range"
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              value={playerCount}
              onChange={(e) =>
                handlePlayerCountChangeInternal(
                  Number(e.target.value) as PlayerCount
                )
              }
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            />
            <div className="flex justify-between text-xs md:text-sm text-primary-600">
              <span>{MIN_PLAYERS} Player</span>
              <span>{MAX_PLAYERS} Players</span>
            </div>
          </div>

          {/* Game Mode Slider - Only show for multiplayer */}
          {playerCount > 1 && (
            <div className="space-y-2 pt-2">
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

        {/* Images and Pregeneration Box - Conditionally render if not in templateMode */}
        {!templateMode && (
          <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-4">
            <div className="items-center flex">
              <input
                id="generate-images"
                type="checkbox"
                checked={generateImages}
                onChange={(e) => {
                  setGenerateImages(e.target.checked);
                  updateURLParams({ images: e.target.checked });
                }}
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

            <div className="items-center flex">
              <input
                id="pregenerate-beats"
                type="checkbox"
                checked={pregenerateBeats}
                onChange={(e) => {
                  setPregenerateBeats(e.target.checked);
                  updateURLParams({ pregenerate: e.target.checked });
                }}
                className="h-5 w-5 md:h-6 md:w-6 rounded border-primary-100 text-accent focus:ring-accent"
                disabled={
                  currentIsLoading ||
                  (DISABLE_PREGENERATION_FOR_MULTIPLAYER && playerCount >= 2)
                }
              />
              <label
                htmlFor="pregenerate-beats"
                className={`ml-3 md:ml-4 text-sm md:text-base font-medium ${
                  DISABLE_PREGENERATION_FOR_MULTIPLAYER && playerCount >= 2
                    ? "text-gray-400"
                    : "text-primary"
                }`}
              >
                Reduce wait time after choices
                <InfoIcon
                  tooltipText={
                    DISABLE_PREGENERATION_FOR_MULTIPLAYER && playerCount >= 2
                      ? "Pregeneration is currently unavailable for multiplayer games."
                      : "Creates story content in advance for each possible choice. More expensive but eliminates waiting."
                  }
                  className="ml-2 -mt-0.5"
                  position="top"
                />
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-row gap-3 sm:gap-4 sm:justify-between pt-1 sm:pt-2">
          <PrimaryButton
            type="button"
            size="lg"
            onClick={handleBackToStep1}
            variant="outline"
            leftBorder={false}
            leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
          >
            Back
          </PrimaryButton>

          <PrimaryButton
            type="button"
            size="lg"
            onClick={handleStep2Continue}
            className="font-semibold flex-1 sm:flex-none sm:min-w-[120px]"
          >
            <span className="flex items-center justify-center sm:justify-start gap-2 w-full">
              Continue
              <Icons.ArrowRight className="h-4 w-4 hidden sm:block" />
            </span>
          </PrimaryButton>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="mb-4 sm:mb-8">
          <ConfigSummary
            selectedCategory={selectedCategory}
            categoryConfigs={categoryConfigs}
            playerCount={playerCount}
            gameMode={gameMode}
            generateImages={generateImages}
            pregenerateBeats={pregenerateBeats}
            templateMode={templateMode}
            showPlayerInfo={true}
          />
        </div>

        {/* Story Prompt Box */}
        <div className="relative bg-white rounded-lg border border-primary-100 shadow-md">
          {/* Idea button floated to top-right */}
          <div className="float-right -mt-px -mr-px">
            <PrimaryButton
              type="button"
              onClick={handleSuggestion}
              variant="outline"
              size="sm"
              leftBorder={false}
              className="!bg-white !text-secondary hover:!bg-gray-100 active:!bg-gray-200 !border-primary-100 px-2 py-1 shadow-sm !transition-colors !opacity-100 hover:!opacity-100 active:!opacity-100 !rounded-tl-none !rounded-br-none !rounded-tr-lg !rounded-bl-md text-sm sm:text-sm"
              disabled={currentIsLoading}
              leftIcon={<Icons.LightBulb className="h-4 w-4 sm:h-4 sm:w-4" />}
            >
              Idea
            </PrimaryButton>
          </div>

          {/* Content container with proper spacing */}
          <div className="p-4 space-y-6">
            {/* Category-specific fields */}
            {selectedCategory !== "flexible" &&
              categoryConfigs[selectedCategory].fields.length > 0 && (
                <div className="space-y-6">
                  {categoryConfigs[selectedCategory].fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      {field.type === "inline" ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <label
                            htmlFor={`category-${field.key}`}
                            className="text-sm md:text-base font-medium text-primary sm:whitespace-nowrap"
                          >
                            {field.label}
                          </label>
                          <input
                            id={`category-${field.key}`}
                            type="text"
                            value={categoryFields[field.key] || ""}
                            onChange={(e) =>
                              handleCategoryFieldChange(
                                field.key,
                                e.target.value
                              )
                            }
                            className="flex-1 rounded-lg border border-primary-100 shadow-sm px-3 md:px-4 py-2 md:py-3 text-base md:text-lg text-primary placeholder-primary-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white"
                            placeholder={field.placeholder}
                            disabled={currentIsLoading}
                          />
                        </div>
                      ) : field.type === "number" ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <label
                            htmlFor={`category-${field.key}`}
                            className="text-sm md:text-base font-medium text-primary sm:whitespace-nowrap"
                          >
                            {field.label}
                          </label>
                          <input
                            id={`category-${field.key}`}
                            type="text"
                            value={categoryFields[field.key] || ""}
                            onChange={(e) =>
                              handleCategoryFieldChange(
                                field.key,
                                e.target.value
                              )
                            }
                            className="w-full sm:w-32 rounded-lg border border-primary-100 shadow-sm px-3 md:px-4 py-2 md:py-3 text-base md:text-lg text-primary placeholder-primary-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white"
                            placeholder={field.placeholder}
                            disabled={currentIsLoading}
                          />
                        </div>
                      ) : (
                        <>
                          <label
                            htmlFor={`category-${field.key}`}
                            className="text-sm md:text-base font-medium text-primary"
                          >
                            {field.label}
                          </label>
                          <TextArea
                            id={`category-${field.key}`}
                            value={categoryFields[field.key] || ""}
                            onChange={(e) =>
                              handleCategoryFieldChange(
                                field.key,
                                e.target.value
                              )
                            }
                            className="min-h-[60px] sm:min-h-[48px] rounded-lg border border-primary-100 shadow-sm px-3 md:px-4 py-2 md:py-3 text-base md:text-lg text-primary placeholder-primary-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white"
                            placeholder={field.placeholder}
                            disabled={currentIsLoading}
                            autoHeight
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

            <div className="space-y-2">
              <label
                htmlFor="prompt"
                className="text-sm md:text-base font-medium text-primary"
              >
                {(() => {
                  if (selectedCategory === "flexible") {
                    return "What kind of story would you like to experience?";
                  }
                  if (
                    selectedCategory === "enjoy-fiction" ||
                    selectedCategory === "read-with-kids"
                  ) {
                    return "What kind of story would you like to experience?";
                  }
                  if (selectedCategory === "learn-something") {
                    return "Any instructions for the story? (optional)";
                  }
                  if (selectedCategory === "see-your-future-self") {
                    return "What do you want to visualize/experience? (optional)";
                  }
                  return "Anything else we should consider? (optional)";
                })()}
              </label>
              <TextArea
                id="prompt"
                value={prompt}
                onChange={handlePromptChange}
                className={`min-h-[60px] sm:min-h-[48px] rounded-lg border border-primary-100 shadow-sm px-3 md:px-4 py-2 md:py-3 text-base md:text-lg text-primary placeholder-primary-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-white`}
                placeholder={(() => {
                  if (
                    selectedCategory === "enjoy-fiction" ||
                    selectedCategory === "read-with-kids"
                  ) {
                    return selectedCategory === "read-with-kids"
                      ? "We go on adventures with our underwater friends. There should be a pink octopus girl called 'Tessa'."
                      : getPlaceholderText();
                  }
                  if (selectedCategory === "vent-about-reality") {
                    return "I'm poor soul who tries to find an apartment";
                  }
                  if (selectedCategory === "pretend-to-be") {
                    return "Let the story play in Los Angeles";
                  }
                  if (selectedCategory === "see-your-future-self") {
                    return "My cat 'Einstein' should occur in the story.";
                  }
                  if (selectedCategory === "learn-something") {
                    return "I want a whistleblower scenario with leaked documents of varying authenticity (some real, some forged).";
                  }
                  return getPlaceholderText();
                })()}
                disabled={currentIsLoading}
                required
                autoHeight
              />
            </div>
          </div>
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

        <div className="flex flex-row gap-3 sm:gap-4 sm:justify-between pt-1 sm:pt-2">
          <PrimaryButton
            type="button"
            size="lg"
            onClick={handleBackToStep2}
            variant="outline"
            leftBorder={false}
            leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
          >
            Back
          </PrimaryButton>

          <PrimaryButton
            type={submitButtonType}
            onClick={templateMode ? handleSubmit : undefined}
            size="lg"
            disabled={currentIsLoading}
            className="font-semibold flex-1 sm:flex-none sm:min-w-[120px]"
          >
            {templateMode ? "Draft World" : "Create Story"}
          </PrimaryButton>
        </div>
      </div>
    );
  };

  return (
    <div className={`${templateMode ? "" : "p-4 md:p-6"} font-lora`}>
      <FormWrapper
        onSubmit={!templateMode ? handleSubmit : undefined}
        className={templateMode ? "" : "max-w-4xl mx-auto"}
      >
        <StepIndicator currentStep={currentStep} totalSteps={3} />

        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
      </FormWrapper>
    </div>
  );
};
