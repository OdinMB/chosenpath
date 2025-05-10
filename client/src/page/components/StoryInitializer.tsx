import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlayerCount, GameMode } from "core/types";
import { PrimaryButton, Icons } from "components/ui";
import { Logger } from "shared/logger";
import { storyApi } from "shared/apiClient";
import { PlayerCodes } from "./PlayerCodes";

interface StoryInitializerProps {
  onBack: () => void;
}

export function StoryInitializer({ onBack }: StoryInitializerProps) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [playerCount, setPlayerCount] = useState<PlayerCount>(2);
  const [maxTurns, setMaxTurns] = useState(10);
  const [generateImages, setGenerateImages] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>(
    "collaborative" as GameMode
  );
  const [isLoading, setIsLoading] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [playerCodes, setPlayerCodes] = useState<Record<string, string> | null>(
    null
  );
  const [storyReady, setStoryReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    Logger.App.log("Starting story creation process");

    try {
      Logger.App.log("Sending createStory request to server");
      const response = await storyApi.createStory({
        prompt,
        playerCount,
        maxTurns,
        generateImages,
        gameMode,
      });
      Logger.App.log(`Received story ID: ${response.data.storyId}`);

      setStoryId(response.data.storyId);
      setPlayerCodes(response.data.codes);
      Logger.App.log("Received player codes, starting status polling");

      // Start polling for story status
      const checkStatus = async () => {
        try {
          Logger.App.log(`Checking status for story: ${response.data.storyId}`);
          const status = await storyApi.checkStoryStatus(response.data.storyId);
          if (status.data.status === "ready") {
            Logger.App.log(`Story ${response.data.storyId} is ready`);
            setStoryReady(true);
          } else {
            Logger.App.log(
              `Story ${response.data.storyId} is still queued, will check again in 2s`
            );
            // Check again in 2 seconds
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          Logger.App.error("Failed to check story status:", error);
        }
      };
      checkStatus();
    } catch (error) {
      Logger.App.error("Failed to create story:", error);
      // TODO: Show error message to user
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayerCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    // Ensure the value is a valid PlayerCount
    setPlayerCount(value as PlayerCount);
    Logger.App.log(`Updated player count to: ${value}`);
  };

  const handleCodeSubmit = (code: string) => {
    Logger.App.log(`Submitting code: ${code}`);
    // Navigate to the game with the code
    navigate(`/game/${code}`);
  };

  if (storyId && playerCodes) {
    return (
      <PlayerCodes
        codes={playerCodes}
        onCodeSubmit={handleCodeSubmit}
        storyReady={storyReady}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 font-lora">
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-primary mb-4">
              Create a New Story
            </h2>
            <p className="text-primary-600 mb-6">
              Enter your story prompt and configure the settings below.
            </p>
          </div>

          <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-6">
            {/* Story Prompt */}
            <div className="space-y-2">
              <label
                htmlFor="prompt"
                className="text-sm md:text-base font-medium text-primary"
              >
                Story Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-32 p-3 border border-primary-100 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="Enter your story prompt here..."
                required
              />
            </div>

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
                min={1}
                max={4}
                value={playerCount}
                onChange={handlePlayerCountChange}
                className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
              />
              <div className="flex justify-between text-xs md:text-sm text-primary-600">
                <span>1 Player</span>
                <span>4 Players</span>
              </div>
            </div>

            {/* Story Length */}
            <div className="space-y-2">
              <label
                htmlFor="max-turns"
                className="text-sm md:text-base font-medium text-primary"
              >
                Story Length: {maxTurns} turns
              </label>
              <input
                id="max-turns"
                type="range"
                min={5}
                max={20}
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value))}
                className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
              />
              <div className="flex justify-between text-xs md:text-sm text-primary-600">
                <span>5 turns</span>
                <span>20 turns</span>
              </div>
            </div>

            {/* Game Mode */}
            <div className="space-y-2">
              <label
                htmlFor="game-mode"
                className="text-sm md:text-base font-medium text-primary"
              >
                Game Mode
              </label>
              <select
                id="game-mode"
                value={gameMode}
                onChange={(e) => setGameMode(e.target.value as GameMode)}
                className="w-full p-2 border border-primary-100 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
              >
                <option value="collaborative">Collaborative</option>
                <option value="competitive">Competitive</option>
              </select>
            </div>

            {/* Images Checkbox */}
            <div className="items-center flex">
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
                className="ml-3 md:ml-4 text-sm md:text-base font-medium text-primary"
              >
                Generate additional custom images for this story
              </label>
            </div>
          </div>

          <div className="flex flex-row gap-3 sm:gap-4 pt-2">
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

            <PrimaryButton
              type="submit"
              size="lg"
              disabled={isLoading}
              isLoading={isLoading}
              fullWidth
              className="font-semibold text-lg"
            >
              Create Story
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
