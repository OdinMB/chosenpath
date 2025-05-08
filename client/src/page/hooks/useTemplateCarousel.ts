import { useState, useEffect, RefObject } from "react";
import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";
import { apiClient } from "shared/apiClient";

type SwipeHandlers = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

export function useSwipe(
  ref: RefObject<HTMLElement>,
  handlers: SwipeHandlers,
  threshold = 50
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!e.changedTouches[0]) return;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;

      const diffX = endX - startX;
      const diffY = endY - startY;

      // Only trigger swipe if horizontal movement is greater than vertical
      // and exceeds the threshold
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
        if (diffX > 0 && handlers.onSwipeRight) {
          handlers.onSwipeRight();
        } else if (diffX < 0 && handlers.onSwipeLeft) {
          handlers.onSwipeLeft();
        }
      }
    };

    element.addEventListener("touchstart", handleTouchStart);
    element.addEventListener("touchend", handleTouchEnd);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, handlers, threshold]);
}

export function useTemplateCarousel() {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // From TemplateCarousel.tsx
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Fetch published templates
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch templates from the API specifically for the welcome screen
        const response = await apiClient.get(
          `/templates?forWelcomeScreen=true`
        );

        Logger.App.log(
          `Loaded ${response.data.templates.length} templates for welcome screen`
        );
        setTemplates(response.data.templates);
      } catch (error) {
        Logger.App.error("Failed to load templates", error);
        setError("Failed to load story templates");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, []);

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

  // Select a specific template by index
  const selectTemplateByIndex = (index: number) => {
    if (isTransitioning || index === currentIndex) return;

    setIsTransitioning(true);
    setCurrentIndex(index);
  };

  // If templates change or are loaded, reset to first template
  useEffect(() => {
    setCurrentIndex(0);
  }, [templates.length]);

  // Get the current template
  const currentTemplate = templates.length > 0 ? templates[currentIndex] : null;

  return {
    templates,
    currentTemplate,
    currentIndex,
    isLoading,
    error,
    isTransitioning,
    prevTemplate,
    nextTemplate,
    selectTemplateByIndex,
    handleTransitionEnd,
  };
}
