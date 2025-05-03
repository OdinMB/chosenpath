import React, { useState, useEffect, useCallback } from "react";
import { ColoredBox, Icons } from "components/ui";
import { StoryImage } from "shared/components/StoryImage";
import { ImageReference } from "core/types";

export interface InterludeItem {
  imageReference?: ImageReference;
  text: string;
}

interface InterludeProps {
  interludes: InterludeItem[];
}

export const Interlude: React.FC<InterludeProps> = ({ interludes }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handlePrev = useCallback(() => {
    if (!interludes || interludes.length <= 1 || isTransitioning) return;

    setIsTransitioning(true);
    setCurrentSlide((prev) => (prev === 0 ? interludes.length - 1 : prev - 1));

    // Reset transition state after animation completes
    setTimeout(() => setIsTransitioning(false), 500);
  }, [interludes, isTransitioning]);

  const handleNext = useCallback(() => {
    if (!interludes || interludes.length <= 1 || isTransitioning) return;

    setIsTransitioning(true);
    setCurrentSlide((prev) => (prev === interludes.length - 1 ? 0 : prev + 1));

    // Reset transition state after animation completes
    setTimeout(() => setIsTransitioning(false), 500);
  }, [interludes, isTransitioning]);

  // Auto-advance carousel every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      handleNext();
    }, 6500);

    return () => clearInterval(interval);
  }, [handleNext]);

  if (!interludes || interludes.length === 0) {
    return null;
  }

  const currentInterlude = interludes[currentSlide];

  return (
    <div className="max-w-2xl mx-auto">
      <ColoredBox leftBorder={false} className="p-4 w-full">
        <div className="flex flex-col items-center">
          {/* Image */}
          {currentInterlude.imageReference && (
            <div className="w-full mb-4 max-h-48 flex justify-center overflow-hidden rounded-lg">
              <StoryImage
                image={currentInterlude.imageReference}
                alt={currentInterlude.text}
                responsivePosition={true}
                mobileOffset="5%"
                desktopOffset="14%"
              />
            </div>
          )}

          {/* Text */}
          <div className="text-center text-primary">
            <p className="italic">{currentInterlude.text}</p>
          </div>

          {/* Navigation controls */}
          {interludes.length > 100 && (
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
                      index === currentSlide
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
