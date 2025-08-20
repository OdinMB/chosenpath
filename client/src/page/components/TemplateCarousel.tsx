import { TemplateMetadata } from "core/types";
import { TemplateCard } from "./TemplateCard";
import { Carousel } from "./Carousel";
import { LoadingSpinner } from "shared/components/LoadingSpinner";
import { useState, useEffect } from "react";
import { templateCache } from "resources/templates/templateCache";

type TemplateCarouselProps = {
  onPlay: (template: TemplateMetadata) => void;
};

export const TemplateCarousel = ({ onPlay }: TemplateCarouselProps) => {
  const [templates, setTemplates] = useState<TemplateMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const templateData = await templateCache.getPublishedTemplates(true);
        setTemplates(templateData);
      } catch (err) {
        setError("Failed to load templates");
        console.error("Failed to load templates:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadTemplates();
  }, []);

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingSpinner size="medium" />
        <p className="mt-2 text-sm text-primary-600">Loading story templates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 text-sm">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="text-link text-sm mt-2 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-2 text-primary-600">
        <p>No story templates found.</p>
      </div>
    );
  }

  const templateItems = templates.map((template) => (
    <div key={template.id} className="h-full">
      <TemplateCard template={template} onPlay={() => onPlay(template)} />
    </div>
  ));

  return (
    <Carousel
      items={templateItems}
      showControls={true}
      showDots={true}
      className="max-w-md mx-auto"
    />
  );
};
