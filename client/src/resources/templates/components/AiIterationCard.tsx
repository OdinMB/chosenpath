import React, { useEffect, useState } from "react";
import { ImageCard } from "shared/components/ImageCard";
import { PrimaryButton, TextArea, Icons } from "components/ui";
import { TemplateIterationSections } from "core/types";

interface AiIterationCardProps {
  onRequestIteration: (
    feedback: string,
    sections: Array<TemplateIterationSections>
  ) => Promise<void> | void;
  templateId?: string;
  className?: string;
  isLoading?: boolean;
  placeholder?: string;
  placeholderShort?: string;
  selectedSections?: Array<TemplateIterationSections>;
  buttonText?: string;
}

export const AiIterationCard: React.FC<AiIterationCardProps> = ({
  onRequestIteration,
  templateId,
  className = "",
  isLoading = false,
  placeholder = "Add more personal Threads. Clarify pacing to alternate between public and personal Threads.",
  placeholderShort = "More personal Threads. Alternate public/personal pacing.",
  selectedSections = ["guidelines"],
  buttonText = "Improve My World",
}) => {
  const [feedback, setFeedback] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia === "undefined"
    ) {
      return;
    }
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // Safari fallback
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  const handleSubmit = async () => {
    await onRequestIteration(feedback, selectedSections);
  };

  return (
    <ImageCard
      publicImagePath="/wand.jpeg"
      title="AI Worldbuilding Assistant"
      className={className}
    >
      <div className="flex flex-col h-full">
        <div className="mb-3">
          <TextArea
            id={`ai-iteration-feedback-${templateId || "new"}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={isMobile ? placeholderShort : placeholder}
            autoHeight
          />
        </div>
        <div className="mt-auto flex justify-center">
          <PrimaryButton
            type="button"
            disabled={isLoading}
            isLoading={isLoading}
            leftIcon={<Icons.Wand className="h-4 w-4" />}
            onClick={handleSubmit}
          >
            {buttonText}
          </PrimaryButton>
        </div>
      </div>
    </ImageCard>
  );
};
