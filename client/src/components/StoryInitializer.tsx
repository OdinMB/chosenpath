import { useState, useCallback, useMemo, useEffect } from "react";
import { useSession } from "../hooks/useSession.js";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_TURNS,
  MAX_TURNS,
  DEFAULT_TURNS,
} from "shared/config.js";
import { GameMode, GameModes } from "shared/types/story.js";

interface StoryInitializerProps {
  onSetup: (options: {
    prompt: string;
    generateImages: boolean;
    playerCount: number;
    maxTurns: number;
    gameMode: GameMode;
  }) => void;
  onBack: () => void;
}

export function StoryInitializer({ onSetup, onBack }: StoryInitializerProps) {
  const [prompt, setPrompt] = useState("");
  const [generateImages, setGenerateImages] = useState(false);
  const [playerCount, setPlayerCount] = useState(1);
  const [gameMode, setGameMode] = useState<GameMode>(GameModes.Cooperative);
  const [maxTurns] = useState(DEFAULT_TURNS);
  const [usedPromptIndices, setUsedPromptIndices] = useState<Set<number>>(
    new Set()
  );
  const { isLoading, isConnecting } = useSession();

  const storyPrompts = useMemo(
    () => ({
      singlePlayer: [
        "I'm the last surviving rubber duck investigating a bathtub conspiracy...",
        "I'm a teenage wizard trying to balance school, friends, and romance...",
        "I'm a psychic detective investigating crimes in dreams...",
        "I'm a corporate concierge for supernatural entities with impossible requests...",
        "I'm a familiar trying to save my witch from a dark fate...",
        "I'm a dragon hoarding treasure, subjugating the local population, and fending off pesky adventurers...",
        "I'm a frontier sheriff maintaining order in a town caught between progress and tradition...",
        "I'm the heir to a noble house navigating political intrigue and ancient family secrets...",
      ],
      cooperative: [
        "We're retired superheroes running a wedding planning business together...",
        "We're friends and know we're going to die today, so we're making the most of it...",
        "We're a group of strangers trying to survive in a giant mole apocalypse...",
        "We're retired imaginary friends trying to solve a murder mystery with our special skills...",
        "We're space cowboys trying to make an honest living in a lawless part of the galaxy...",
        "We're a group of children books trying to save our library from getting closed down...",
      ],
      competitive: [
        "We're apartment hunters fighting over the last affordable flat in Berlin...",
        "We're whimsical creatures trying to win the audience's favor in the colosseum...",
        "We're time-traveling food critics changing history through restaurant reviews to benefit our rivaling intergalactic overlords...",
        "We're competing AIs trying to convince humans we're the most human...",
        "We're angels and demons trying to influence the outcome of a middle school student council election...",
        "We're rival alchemists racing to create a love potion for a shared crush...",
      ],
      cooperativeCompetitive: [
        "We're supernatural creatures sharing a flat while competing for human souls...",
        "We're space pirates with a shared ship but individual treasure quotas...",
        "We're the last rock band on Mars, trying to make it while following our individual dreams...",
        "We're guardian angels assigned to the same human with different ideas of 'help'...",
        "We're seasonal spirits sharing a forest while competing for followers...",
        "We're court magicians protecting the realm while seeking ancient power...",
      ],
    }),
    []
  );

  // Update gameMode when playerCount changes
  useEffect(() => {
    if (playerCount === 1) {
      setGameMode(GameModes.SinglePlayer);
    } else if (gameMode === GameModes.SinglePlayer) {
      setGameMode(GameModes.Cooperative);
    }
  }, [playerCount, gameMode]);

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

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 text-center">
          Interactive Fiction Generator
        </h1>

        {isConnecting ? (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-gray-600">Connecting to server...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm space-y-6">
              <div className="space-y-2">
                <label
                  htmlFor="player-count"
                  className="text-sm md:text-base font-medium text-gray-700"
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
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-pan-x"
                  disabled={isLoading}
                />
                <div className="flex justify-between text-xs md:text-sm text-gray-500">
                  <span>Single Player</span>
                  <span>{MAX_PLAYERS} Players</span>
                </div>
              </div>

              <div
                className={`space-y-2 transition-opacity duration-200 ${
                  playerCount === 1 ? "opacity-50" : ""
                }`}
              >
                <label className="text-sm md:text-base font-medium text-gray-700">
                  Multiplayer Mode
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  value={
                    gameMode === GameModes.Cooperative
                      ? 0
                      : gameMode === GameModes.CooperativeCompetitive
                      ? 1
                      : 2
                  }
                  onChange={(e) => {
                    const values = [
                      GameModes.Cooperative,
                      GameModes.CooperativeCompetitive,
                      GameModes.Competitive,
                    ] as const;
                    setGameMode(values[Number(e.target.value)]);
                  }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-pan-x"
                  disabled={isLoading || playerCount === 1}
                />
                <div className="flex justify-between text-xs md:text-sm text-gray-500">
                  <span>Shared Goals</span>
                  <span>Mixed Goals</span>
                  <span>Competing Goals</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between mb-2">
                <label
                  htmlFor="prompt"
                  className="text-sm md:text-base font-medium text-gray-700"
                >
                  What kind of story would you like to experience?
                </label>
                <button
                  type="button"
                  onClick={handleSuggestion}
                  className="self-end sm:self-auto px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors duration-200"
                  disabled={isLoading}
                >
                  Get suggestion
                </button>
              </div>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full min-h-[120px] md:min-h-[100px] rounded-lg border border-gray-300 shadow-sm px-3 md:px-4 py-2 md:py-3 text-base md:text-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder={getPlaceholderText()}
                disabled={isLoading}
              />
            </div>

            {/* Story Length section - temporarily hidden but preserved for future use */}
            <div className="hidden">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm space-y-2">
                <label className="text-sm md:text-base font-medium text-gray-700">
                  Story Length: {maxTurns} decisions
                </label>
                <input
                  type="range"
                  min={MIN_TURNS}
                  max={MAX_TURNS}
                  step={5}
                  value={maxTurns}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer touch-pan-x opacity-50"
                  disabled={true}
                />
                <div className="flex justify-between text-xs md:text-sm text-gray-500">
                  <span>{MIN_TURNS} decisions</span>
                  <span>{MAX_TURNS} decisions</span>
                </div>
              </div>
            </div>

            <div className="flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
              <input
                id="generate-images"
                type="checkbox"
                checked={generateImages}
                onChange={(e) => setGenerateImages(e.target.checked)}
                className="h-5 w-5 md:h-6 md:w-6 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                disabled={isLoading}
              />
              <label
                htmlFor="generate-images"
                className="ml-3 md:ml-4 text-sm md:text-base font-medium text-gray-700"
              >
                Generate images for the story
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
              <button
                type="button"
                onClick={onBack}
                className="w-full sm:w-1/3 py-2.5 md:py-3 px-4 rounded-lg text-sm md:text-base font-medium text-indigo-600 bg-white border-2 border-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
              >
                Back
              </button>

              <button
                type="submit"
                disabled={isLoading || !prompt.trim() || isConnecting}
                className="w-full sm:w-2/3 py-2.5 md:py-3 px-4 rounded-lg text-sm md:text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors duration-200"
              >
                {isLoading ? "Creating Story..." : "Create Story"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
