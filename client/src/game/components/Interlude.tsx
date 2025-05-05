import React, { useState, useCallback, useRef } from "react";
import { ColoredBox, Icons } from "components/ui";
import { StoryImage } from "shared/components/StoryImage";
import { ImageReference } from "core/types";

// Import useSwipe hook
import { useSwipe } from "page/hooks/useTemplateCarousel";

export interface InterludeItem {
  imageReference?: ImageReference;
  text: string;
}

interface InterludeProps {
  interludes: InterludeItem[];
}

export const Interlude: React.FC<InterludeProps> = ({ interludes = [] }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const interludeRef = useRef<HTMLDivElement>(null);

  const handlePrev = useCallback(() => {
    if (
      !interludes ||
      !Array.isArray(interludes) ||
      interludes.length <= 1 ||
      isTransitioning
    )
      return;

    setIsTransitioning(true);
    setCurrentSlide((prev) => (prev === 0 ? interludes.length - 1 : prev - 1));

    // Reset transition state after animation completes
    setTimeout(() => setIsTransitioning(false), 500);
  }, [interludes, isTransitioning]);

  const handleNext = useCallback(() => {
    if (
      !interludes ||
      !Array.isArray(interludes) ||
      interludes.length <= 1 ||
      isTransitioning
    )
      return;

    setIsTransitioning(true);
    setCurrentSlide((prev) => (prev === interludes.length - 1 ? 0 : prev + 1));

    // Reset transition state after animation completes
    setTimeout(() => setIsTransitioning(false), 500);
  }, [interludes, isTransitioning]);

  // Add swipe gesture support
  useSwipe(interludeRef, {
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
  });

  // Auto-advance carousel every 8 seconds
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     handleNext();
  //   }, 6500);

  //   return () => clearInterval(interval);
  // }, [handleNext]);

  if (!interludes || !Array.isArray(interludes) || interludes.length === 0) {
    return null;
  }

  // Make sure currentSlide is within bounds
  const validCurrentSlide = Math.min(currentSlide, interludes.length - 1);
  const currentInterlude = interludes[validCurrentSlide];

  // Ensure we have a valid currentInterlude
  if (!currentInterlude) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <ColoredBox colorType="grey" leftBorder={false} className="p-4 w-full">
        <div
          ref={interludeRef}
          className="flex flex-col items-center touch-pan-x"
        >
          {/* Image */}
          {currentInterlude.imageReference && (
            <div className="w-full mb-4 max-h-48 md:max-h-64 lg:max-h-80 flex justify-center overflow-hidden rounded-lg">
              <StoryImage
                image={currentInterlude.imageReference}
                alt={currentInterlude.text || ""}
                responsivePosition={true}
                mobileOffset="5%"
                desktopOffset="8%"
              />
            </div>
          )}

          {/* Text */}
          <div className="text-center text-primary">
            <p
              className={`italic ${
                !currentInterlude.imageReference ? "text-lg md:text-xl" : ""
              }`}
            >
              {currentInterlude.text || ""}
            </p>
          </div>

          {/* Navigation controls */}
          {Array.isArray(interludes) && interludes.length > 1 && (
            <div className="flex items-center justify-center w-full mt-4">
              <button
                onClick={handlePrev}
                className="p-1 rounded-full mr-2 text-primary-500 hover:text-primary-700 disabled:text-gray-300"
                disabled={isTransitioning}
                aria-label="Previous interlude"
              >
                <Icons.ArrowLeft className="w-6 h-6" />
              </button>

              {/* Indicator dots */}
              <div className="flex space-x-2">
                {interludes.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full ${
                      index === validCurrentSlide
                        ? "bg-primary-500"
                        : "bg-primary-200"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="p-1 rounded-full ml-2 text-primary-500 hover:text-primary-700 disabled:text-gray-300"
                disabled={isTransitioning}
                aria-label="Next interlude"
              >
                <Icons.ArrowRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>
      </ColoredBox>
    </div>
  );
};
