import { StoryTemplate } from "core/types";
import { PrimaryButton } from "components/ui";
import { sortTagsByCategory } from "shared/tagCategories";
import { ImageCard } from "shared/components";

type TemplateCardProps = {
  template: StoryTemplate;
  onPlay: (template: StoryTemplate) => void;
  showPlayButton?: boolean;
  size?: "default" | "large";
  className?: string;
};

export const TemplateCard = ({
  template,
  onPlay,
  showPlayButton = true,
  size = "default",
  className = "",
}: TemplateCardProps) => {
  // Sort tags by category
  const sortedTags = template.tags ? sortTagsByCategory(template.tags) : [];

  // Size-based class mapping
  const sizeClasses = {
    title: size === "large" ? "text-xl" : "text-lg",
    teaser: size === "large" ? "text-base" : "text-sm",
    info: size === "large" ? "text-sm" : "text-xs",
    tag: size === "large" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5",
  };

  return (
    <ImageCard
      sourceId={template.id}
      title={template.title}
      size={size}
      onClick={() => onPlay(template)}
      className={className}
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className={`${sizeClasses.title} text-primary-800`}>
          {template.title}
        </h3>
        {showPlayButton && (
          <PrimaryButton onClick={() => onPlay(template)} className="ml-4">
            Play
          </PrimaryButton>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 text-primary-500 mb-4">
        <div className="flex items-center gap-8">
          <span className={`${sizeClasses.info} font-semibold`}>
            {template.playerCountMin === template.playerCountMax
              ? `${template.playerCountMin} player${
                  template.playerCountMin > 1 ? "s" : ""
                }`
              : `${template.playerCountMin}-${template.playerCountMax} players`}
          </span>
          <span className={`${sizeClasses.info} font-semibold`}>
            {template.maxTurnsMin === template.maxTurnsMax
              ? `${template.maxTurnsMin} turns`
              : `${template.maxTurnsMin}-${template.maxTurnsMax} turns`}
          </span>
        </div>
      </div>

      {/* Teaser */}
      <p className={`${sizeClasses.teaser} text-primary-600 mb-4 line-clamp-3`}>
        {template.teaser}
      </p>

      {/* Flex spacer */}
      <div className="flex-grow"></div>

      {/* Tags */}
      {sortedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto">
          {sortedTags.map((tag, index) => (
            <span
              key={index}
              className={`inline-block ${sizeClasses.tag} bg-primary-50 text-primary-700 rounded-md`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </ImageCard>
  );
};
