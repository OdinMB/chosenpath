import { useState, useEffect, useRef } from "react";
import { StoryTemplate } from "@core/types";
import { TemplateCard } from "./TemplateCard";
import { Icons, PrimaryButton } from "@components/ui";

type TemplateCarouselProps = {
  templates: StoryTemplate[];
  onPlay: (template: StoryTemplate) => void;
  isLoading?: boolean;
};

export const TemplateCarousel = ({
  templates,
  onPlay,
  isLoading = false,
}: TemplateCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Move to the previous template
  const prevTemplate = () => {
    if (isTransitioning || templates.length <= 1) return;

    setIsTransitioning(true);
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? templates.length - 1 : prevIndex - 1
    );
  };

  // Move to the next template
  const nextTemplate = () => {
    if (isTransitioning || templates.length <= 1) return;

    setIsTransitioning(true);
    setCurrentIndex((prevIndex) =>
      prevIndex === templates.length - 1 ? 0 : prevIndex + 1
    );
  };

  // Reset transition state after animation completes
  const handleTransitionEnd = () => {
    setIsTransitioning(false);
  };

  // If templates change or are loaded, reset to first template
  useEffect(() => {
    setCurrentIndex(0);
  }, [templates.length]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-8 h-8 border-t-2 border-b-2 border-secondary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-8 text-primary-600">
        <p>No story templates found.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="overflow-hidden">
        <div
          ref={carouselRef}
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          onTransitionEnd={handleTransitionEnd}
        >
          {templates.map((template) => (
            <div key={template.id} className="w-full flex-shrink-0 px-2">
              <TemplateCard template={template} onPlay={onPlay} />
            </div>
          ))}
        </div>
      </div>

      {templates.length > 1 && (
        <div className="flex justify-between mt-4">
          <PrimaryButton
            onClick={prevTemplate}
            disabled={isTransitioning || templates.length <= 1}
            size="sm"
            variant="outline"
            leftBorder={false}
            leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
          />

          <div className="flex items-center gap-2">
            {templates.map((_, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full ${
                  index === currentIndex ? "bg-primary-600" : "bg-primary-200"
                }`}
                onClick={() => {
                  if (!isTransitioning) {
                    setIsTransitioning(true);
                    setCurrentIndex(index);
                  }
                }}
              />
            ))}
          </div>

          <PrimaryButton
            onClick={nextTemplate}
            disabled={isTransitioning || templates.length <= 1}
            size="sm"
            variant="outline"
            leftBorder={false}
            rightIcon={<Icons.ArrowRight className="h-4 w-4" />}
          />
        </div>
      )}
    </div>
  );
};
