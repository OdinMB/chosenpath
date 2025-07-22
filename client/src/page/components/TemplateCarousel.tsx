import { TemplateMetadata } from "core/types";
import { TemplateCard } from "./TemplateCard";
import { useLoaderData } from "react-router-dom";
import { Carousel } from "./Carousel";

type TemplateCarouselProps = {
  onPlay: (template: TemplateMetadata) => void;
};

export const TemplateCarousel = ({ onPlay }: TemplateCarouselProps) => {
  const { templates } = useLoaderData() as { templates: TemplateMetadata[] };

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
