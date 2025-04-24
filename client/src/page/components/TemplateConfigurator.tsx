import { useState, useEffect } from "react";
import { StoryTemplate, PlayerCount } from "core/types";
import { PrimaryButton, Icons } from "components/ui";
import { useSession } from "shared/useSession";
import { TemplateCard } from "./TemplateCard";
import { ShareLink } from "shared/components/ShareLink";

interface TemplateConfiguratorProps {
  template: StoryTemplate;
  onBack: () => void;
  onConfigure: (options: {
    templateId: string;
    playerCount: PlayerCount;
    maxTurns: number;
  }) => void;
}

export function TemplateConfigurator({
  template,
  onBack,
  onConfigure,
}: TemplateConfiguratorProps) {
  const [playerCount, setPlayerCount] = useState<PlayerCount>(
    template.playerCountMin
  );
  const [maxTurns, setMaxTurns] = useState(template.maxTurnsMin);
  const [isLoading, setIsLoading] = useState(false);
  const { isRequestPending, isOperationRunning } = useSession();

  // Determine if configuration is needed for each option
  const needsPlayerConfig = template.playerCountMin !== template.playerCountMax;
  const needsTurnsConfig = template.maxTurnsMin !== template.maxTurnsMax;
  const hasConfigurableSettings = needsPlayerConfig || needsTurnsConfig;

  // Monitor if the story initialization operation is pending
  useEffect(() => {
    const isPending =
      isRequestPending("initialize_from_template") ||
      isOperationRunning("initialize_story");

    if (isPending && !isLoading) {
      setIsLoading(true);
    } else if (!isPending && isLoading) {
      // This should not happen during normal flow, but helps prevent
      // the UI from getting stuck in a loading state
      console.log(
        "Template initialization no longer pending, but still in loading state"
      );
    }
  }, [isRequestPending, isOperationRunning, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    onConfigure({
      templateId: template.id,
      playerCount,
      maxTurns,
    });
  };

  const handlePlayerCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    // Ensure the value is a valid PlayerCount
    setPlayerCount(value as PlayerCount);
  };

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
            </div>
          )}

          <div className="flex flex-row gap-3 sm:gap-4 pt-2">
            <PrimaryButton
              type="button"
              size="lg"
              onClick={onBack}
              variant="outline"
              leftBorder={false}
              leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
            ></PrimaryButton>

            {/* This div wrapper prevents the ShareLink from accidentally submitting the form */}
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
