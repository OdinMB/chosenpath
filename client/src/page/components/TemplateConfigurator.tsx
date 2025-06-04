import { useState } from "react";
import { useNavigate, useLoaderData } from "react-router-dom";
import { PlayerCount, DifficultyLevel, TemplateMetadata } from "core/types";
import { PrimaryButton, Icons, InfoIcon } from "components/ui";
import { TemplateCard } from "./TemplateCard";
import { ShareLink } from "shared/components/ShareLink";
import { Logger } from "shared/logger";
import { PlayerCodes } from "./PlayerCodes";
import { useStoryCreation } from "page/hooks/useStoryCreation";
import { RateLimitNotification } from "client/shared/notifications/RateLimitNotification";
import { RateLimitedResponse } from "core/types/api";
import { notificationService } from "shared/notifications/notificationService";
import { getDefaultDifficultyLevel } from "core/utils/difficultyUtils.ts";
import { DifficultySlider } from "./DifficultySlider";

type ConfigurableTemplate = TemplateMetadata;

interface TemplateConfigLoaderData {
  template: ConfigurableTemplate;
}

// Minimal template interface for PlayerCodes component
interface MinimalTemplate {
  id: string;
  title: string;
}

export function TemplateConfigurator() {
  const { template } = useLoaderData() as TemplateConfigLoaderData;
  const navigate = useNavigate();
  const [playerCount, setPlayerCount] = useState<PlayerCount>(
    template.playerCountMin
  );
  const [maxTurns, setMaxTurns] = useState(template.maxTurnsMin);
  const [generateImages, setGenerateImages] = useState(false);
  const [selectedDifficultyLevel, setSelectedDifficultyLevel] =
    useState<DifficultyLevel>(() => {
      if (template.difficultyLevels && template.difficultyLevels.length > 0) {
        const levels = template.difficultyLevels;
        // Sort by modifier ascending (easier to harder)
        const sortedLevels = [...levels].sort(
          (a, b) => a.modifier - b.modifier
        );
        // For even number of levels, choose the more difficult of the two middle options
        const midIndex = Math.floor(sortedLevels.length / 2);
        // If even number of levels, use midIndex directly (which is the more difficult option)
        // Since options are sorted by modifier ascending (easier to harder)
        const adjustedIndex = midIndex;
        return sortedLevels[adjustedIndex];
      }
      return getDefaultDifficultyLevel();
    });
  const [rateLimit, setRateLimit] = useState<
    RateLimitedResponse["rateLimit"] | null
  >(null);

  const {
    isLoading,
    storyId,
    playerCodes,
    storyReady,
    createStoryFromTemplate,
    handleCodeSubmit,
  } = useStoryCreation();

  // Determine if configuration is needed for each option
  const needsPlayerConfig = template.playerCountMin !== template.playerCountMax;
  const needsTurnsConfig = template.maxTurnsMin !== template.maxTurnsMax;
  const needsDifficultyConfig =
    template.difficultyLevels && template.difficultyLevels.length > 1;
  const hasConfigurableSettings =
    needsPlayerConfig || needsTurnsConfig || needsDifficultyConfig || true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    Logger.App.log("Starting template story creation process");

    try {
      const response = await createStoryFromTemplate({
        templateId: template.id,
        playerCount,
        maxTurns,
        generateImages,
        difficultyLevel: selectedDifficultyLevel,
      });

      if (!response) {
        // If response is undefined, an error was handled by the hook (e.g., navigation occurred).
        // The component should not proceed further.
        return;
      }

      Logger.App.log(
        "Template story creation initiated by TemplateConfigurator."
      );
    } catch (error) {
      console.error("Error in TemplateConfigurator handleSubmit:", error);
      notificationService.addErrorNotification();
    }
  };

  const handlePlayerCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setPlayerCount(value as PlayerCount);
    Logger.App.log(`Updated player count to: ${value}`);
  };

  const handleDifficultyChange = (level: DifficultyLevel) => {
    setSelectedDifficultyLevel(level);
  };

  const handleBack = () => {
    navigate("/library");
  };

  if (storyId && playerCodes) {
    // PlayerCodes only needs basic template fields
    const playerCodesTemplate: MinimalTemplate = {
      id: template.id,
      title: template.title,
    };

    return (
      <PlayerCodes
        codes={playerCodes}
        onCodeSubmit={handleCodeSubmit}
        storyReady={storyReady}
        template={
          playerCodesTemplate as unknown as import("core/types").StoryTemplate
        }
      />
    );
  }

  return (
    <div className="p-4 md:p-6 font-lora">
      <div className="max-w-2xl mx-auto">
        {rateLimit && (
          <RateLimitNotification
            rateLimit={rateLimit}
            onTimeout={() => setRateLimit(null)}
            className="mb-6"
          />
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="mb-6">
            <TemplateCard
              template={template}
              onPlay={() => {}}
              showPlayButton={false}
              size="default"
              className="sm:hidden" // Mobile size
            />
            <TemplateCard
              template={template}
              onPlay={() => {}}
              showPlayButton={false}
              size="large"
              className="hidden sm:block" // Desktop size
            />
          </div>

          {hasConfigurableSettings && (
            <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-6">
              <h3 className="text-lg font-medium text-primary">Settings </h3>

              {/* Player Count Section */}
              {needsPlayerConfig && (
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
                    min={template.playerCountMin}
                    max={template.playerCountMax}
                    value={playerCount}
                    onChange={handlePlayerCountChange}
                    className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
                  />
                  <div className="flex justify-between text-xs md:text-sm text-primary-600">
                    <span>
                      {template.playerCountMin} Player
                      {template.playerCountMin > 1 ? "s" : ""}
                    </span>
                    <span>
                      {template.playerCountMax} Player
                      {template.playerCountMax > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              )}

              {/* Story Length Section */}
              {needsTurnsConfig && (
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
                    min={template.maxTurnsMin}
                    max={template.maxTurnsMax}
                    value={maxTurns}
                    onChange={(e) => setMaxTurns(Number(e.target.value))}
                    className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
                  />
                  <div className="flex justify-between text-xs md:text-sm text-primary-600">
                    <span>{template.maxTurnsMin} turns</span>
                    <span>{template.maxTurnsMax} turns</span>
                  </div>
                </div>
              )}

              {/* Difficulty Level Slider - Only show if configurable */}
              {needsDifficultyConfig && template.difficultyLevels && (
                <DifficultySlider
                  selectedDifficultyLevel={selectedDifficultyLevel}
                  availableDifficultyLevels={template.difficultyLevels}
                  onChange={handleDifficultyChange}
                  disabled={isLoading}
                />
              )}

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
                  Add unique images to your story
                  <InfoIcon
                    tooltipText="The story always has default images. We will add additional ones for your unique story."
                    className="ml-2 -mt-0.5"
                    position="top"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-row gap-3 sm:gap-4 pt-2">
            <PrimaryButton
              type="button"
              size="lg"
              onClick={handleBack}
              variant="outline"
              leftBorder={false}
              leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
            >
              Back
            </PrimaryButton>

            <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
              <ShareLink
                templateId={template.id}
                buttonVariant="primary-outline"
              />
            </div>

            <PrimaryButton
              type="submit"
              size="lg"
              disabled={isLoading}
              isLoading={isLoading}
              fullWidth
              className="font-semibold text-lg"
            >
              Start Story
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
