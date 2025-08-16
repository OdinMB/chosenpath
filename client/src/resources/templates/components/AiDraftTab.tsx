import React, { useState } from "react";
import { StoryInitializer } from "page/components/StoryInitializer";
import { ImageCard } from "shared/components/ImageCard";
import { PrimaryButton, Icons } from "components/ui";
import { GameModes, PlayerCount, DifficultyLevel } from "core/types";

interface AiDraftTabProps {
  isSparse: boolean;
  isLoading: boolean;
  formData: {
    playerCountMax: PlayerCount;
    maxTurnsMin: number;
    gameMode?: GameModes;
  };
  aiDraftPrompt: string;
  aiDraftPlayerCount: PlayerCount | undefined;
  handleAIDraftSetup: (options: {
    prompt: string;
    playerCount: PlayerCount;
    maxTurns: number;
    gameMode: GameModes;
    generateImages: boolean;
    difficultyLevel?: DifficultyLevel;
  }) => Promise<void>;
  handleAiDraftPromptChange: (prompt: string) => void;
  handleAiDraftPlayerCountChange: (playerCount: PlayerCount) => void;
  onBack: () => void;
}

export const AiDraftTab: React.FC<AiDraftTabProps> = ({
  isSparse,
  isLoading,
  formData,
  aiDraftPrompt,
  aiDraftPlayerCount,
  handleAIDraftSetup,
  handleAiDraftPromptChange,
  handleAiDraftPlayerCountChange,
  onBack,
}) => {
  // Control visibility of AI Draft initializer when template is not sparse
  const [showAIDraftContent, setShowAIDraftContent] = useState<boolean>(isSparse);

  return (
    <div className="mt-10">
      {!showAIDraftContent && (
        <ImageCard
          publicImagePath="/wand.jpeg"
          title="AI Worldbuilding Assistant"
          className="max-w-md mx-auto"
        >
          <div className="flex flex-col h-full">
            <div className="text-base sm:text-lg text-gray-700 mb-3 text-center">
              An AI Draft will override your existing World.
            </div>
            <div className="mt-auto flex justify-center">
              <PrimaryButton
                type="button"
                leftIcon={<Icons.Wand className="h-4 w-4" />}
                onClick={() => setShowAIDraftContent(true)}
              >
                Continue
              </PrimaryButton>
            </div>
          </div>
        </ImageCard>
      )}
      {showAIDraftContent && (
        <StoryInitializer
          onSetup={handleAIDraftSetup}
          onBack={onBack}
          initialPlayerCount={
            aiDraftPlayerCount || formData.playerCountMax
          }
          initialMaxTurns={formData.maxTurnsMin}
          initialGameMode={formData.gameMode || GameModes.Cooperative}
          showBackButton={false}
          isLoading={isLoading}
          templateMode={true}
          showDifficultySlider={false}
          initialPrompt={aiDraftPrompt}
          onPlayerCountChange={handleAiDraftPlayerCountChange}
          onPromptChange={handleAiDraftPromptChange}
        />
      )}
    </div>
  );
};