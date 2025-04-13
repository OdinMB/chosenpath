import { useState, useEffect } from "react";
import { StoryTemplate, GameMode, PlayerCount } from "@core/types";
import { PrimaryButton, Icons } from "@components/ui";
import { useSession } from "@common/useSession";

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

  const formatGameMode = (mode: GameMode) => {
    return mode.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="p-4 md:p-6 font-lora">
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md mb-6">
            <h2 className="text-xl font-semibold text-primary mb-2">
              {template.title}
            </h2>
            <p className="text-primary-700 mb-4">{template.teaser}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              {playerCount > 1 && (
                <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs">
                  {formatGameMode(template.gameMode)}
                </span>
              )}
              {template.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md space-y-6">
            <h3 className="text-lg font-medium text-primary">
              Story Configuration
            </h3>

            {/* Player Count Section */}
            <div className="space-y-2">
              <label
                htmlFor="player-count"
                className="text-sm md:text-base font-medium text-primary"
              >
                Number of Players:{" "}
                {needsPlayerConfig ? playerCount : template.playerCountMin}
              </label>

              {needsPlayerConfig ? (
                <>
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
                </>
              ) : (
                ""
              )}
            </div>

            {/* Story Length Section */}
            <div className="space-y-2">
              <label
                htmlFor="max-turns"
                className="text-sm md:text-base font-medium text-primary"
              >
                Story Length:{" "}
                {needsTurnsConfig ? maxTurns : template.maxTurnsMin} turns
              </label>

              {needsTurnsConfig ? (
                <>
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
                </>
              ) : (
                ""
              )}
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
              Start Story
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
