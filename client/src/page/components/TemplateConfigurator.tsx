import { useState } from "react";
import { useNavigate, useLoaderData } from "react-router-dom";
import { PlayerCount } from "core/types";
import { PrimaryButton, Icons } from "components/ui";
import { TemplateCard } from "./TemplateCard";
import { ShareLink } from "shared/components/ShareLink";
import { Logger } from "shared/logger";
import { PlayerCodes } from "./PlayerCodes";
import { storeCodeSet } from "shared/utils/codeSetUtils";
import { useStoryCreation } from "page/hooks/useStoryCreation";
import { StoryTemplate } from "core/types";

interface TemplateConfigLoaderData {
  template: StoryTemplate;
}

export function TemplateConfigurator() {
  const { template } = useLoaderData() as TemplateConfigLoaderData;
  const navigate = useNavigate();
  const [playerCount, setPlayerCount] = useState<PlayerCount>(
    template.playerCountMin
  );
  const [maxTurns, setMaxTurns] = useState(template.maxTurnsMin);
  const [generateImages, setGenerateImages] = useState(false);

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
  const hasConfigurableSettings = needsPlayerConfig || needsTurnsConfig || true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    Logger.App.log("Starting template story creation process");

    try {
      const { codes } = await createStoryFromTemplate({
        templateId: template.id,
        playerCount,
        maxTurns,
        generateImages,
      });

      // Store codes in localStorage
      storeCodeSet(codes, `Template: ${template.id}`, true);
      Logger.App.log("Stored player codes in localStorage");
    } catch (error) {
      Logger.App.error("Failed to create story from template:", error);
      // TODO: Show error message to user
    }
  };

  const handlePlayerCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setPlayerCount(value as PlayerCount);
    Logger.App.log(`Updated player count to: ${value}`);
  };

  const handleBack = () => {
    navigate("/library");
  };

  if (storyId && playerCodes) {
    return (
      <PlayerCodes
        codes={playerCodes}
        onCodeSubmit={handleCodeSubmit}
        storyReady={storyReady}
        template={template}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 font-lora">
      <div className="max-w-2xl mx-auto">
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
