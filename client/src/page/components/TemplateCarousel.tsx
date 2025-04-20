import { useRef } from "react";
import { StoryTemplate } from "@core/types";
import { TemplateCard } from "./TemplateCard";
import { Icons } from "@components/ui";
import { useTemplateCarousel } from "../hooks/useTemplateCarousel";

type TemplateCarouselProps = {
  onPlay: (template: StoryTemplate) => void;
};

export const TemplateCarousel = ({ onPlay }: TemplateCarouselProps) => {
  const {
    templates,
    currentIndex,
    isLoading,
    error,
    isTransitioning,
    prevTemplate,
    nextTemplate,
    selectTemplateByIndex,
    handleTransitionEnd,
  } = useTemplateCarousel();

  const carouselRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-8 h-8 border-t-2 border-b-2 border-secondary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-tertiary mb-4">{error}</div>;
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-2 text-primary-600">
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
            <div key={template.id} className="w-full flex-shrink-0">
              <TemplateCard
                template={template}
                onPlay={() => onPlay(template)}
              />
            </div>
          ))}
        </div>
      </div>

      {templates.length > 1 && (
        <div className="flex justify-between mt-2">
          <button
            onClick={prevTemplate}
            disabled={isTransitioning || templates.length <= 1}
            className="p-2 rounded-full hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous template"
          >
            <Icons.ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            {templates.map((_, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full ${
                  index === currentIndex ? "bg-primary-600" : "bg-primary-200"
                }`}
                onClick={() => selectTemplateByIndex(index)}
              />
            ))}
          </div>

          <button
            onClick={nextTemplate}
            disabled={isTransitioning || templates.length <= 1}
            className="p-2 rounded-full hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next template"
          >
            <Icons.ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
