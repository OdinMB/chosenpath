import { useState, useEffect } from "react";
import { StoryTemplate } from "@core/types";
import { config } from "@/config";
import { Logger } from "@common/logger";
import { TemplateCarousel } from "./TemplateCarousel";

type TemplateBrowserProps = {
  onSelectTemplate: (template: StoryTemplate) => void;
};

export const TemplateBrowser = ({ onSelectTemplate }: TemplateBrowserProps) => {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch published templates
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch templates from the API specifically for the welcome screen
        const response = await fetch(
          `${config.apiUrl}/templates?forWelcomeScreen=true`
        );

        if (!response.ok) {
          throw new Error(`Error fetching templates: ${response.status}`);
        }

        const data = await response.json();
        Logger.App.log(
          `Loaded ${data.templates.length} templates for welcome screen`
        );
        setTemplates(data.templates);
      } catch (error) {
        Logger.App.error("Failed to load templates", error);
        setError("Failed to load story templates");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  // Handle selecting a template
  const handleSelectTemplate = (template: StoryTemplate) => {
    onSelectTemplate(template);
  };

  return (
    <div className="w-full">
      {error && <div className="text-center text-tertiary mb-4">{error}</div>}

      <TemplateCarousel
        templates={templates}
        onPlay={handleSelectTemplate}
        isLoading={isLoading}
      />
    </div>
  );
};
