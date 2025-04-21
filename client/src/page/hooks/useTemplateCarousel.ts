import { useState, useEffect } from "react";
import { StoryTemplate } from "@core/types";
import { Logger } from "@common/logger";
import { sendTrackedRequest } from "@common/requestUtils";
import { SuccessResponse } from "@core/types/api";

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
        const response = await sendTrackedRequest<
          SuccessResponse<{ templates: StoryTemplate[] }>
        >({
          path: `/templates?forWelcomeScreen=true`,
          method: "GET",
          token: "", // Public endpoint doesn't need token
        });

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
