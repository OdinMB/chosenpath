import React from "react";
import { ImageCard } from "shared/components/ImageCard";
import { PrimaryButton, Icons } from "components/ui";

interface AiIterationSuggestDraftProps {
  className?: string;
  onGoToDraft: () => void;
}

export const AiIterationSuggestDraft: React.FC<
  AiIterationSuggestDraftProps
> = ({ className = "", onGoToDraft }) => {
  return (
    <ImageCard
      publicImagePath="/wand.jpeg"
      title="AI Worldbuilding Assistant"
      className={className}
    >
      <div className="flex flex-col h-full">
        <div className="text-sm text-gray-700 mb-3">
          Consider creating an initial draft of your World with the AI
          Worldbuilding Assistant.
        </div>
        <div className="mt-auto flex justify-center">
          <PrimaryButton
            type="button"
            leftIcon={<Icons.Wand className="h-4 w-4" />}
            onClick={onGoToDraft}
          >
            AI Draft
          </PrimaryButton>
        </div>
      </div>
    </ImageCard>
  );
};
