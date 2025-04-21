import { StoryTemplate } from "@core/types";
import { PrimaryButton } from "@components/ui";
import { sortTagsByCategory } from "../../shared/tagCategories";

type TemplateCardProps = {
  template: StoryTemplate;
  onPlay: (template: StoryTemplate) => void;
};

export const TemplateCard = ({ template, onPlay }: TemplateCardProps) => {
  // Sort tags by category
  const sortedTags = template.tags ? sortTagsByCategory(template.tags) : [];

  return (
    <div className="w-full p-4 bg-white rounded-lg border border-primary-100">
      <div className="w-full">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg text-primary-800">{template.title}</h3>
          <PrimaryButton onClick={() => onPlay(template)} className="ml-4">
            Play
          </PrimaryButton>
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 text-xs text-primary-500 mb-4">
          <div className="flex items-center gap-8">
            <span className="font-semibold">
              {template.playerCountMin === template.playerCountMax
                ? `${template.playerCountMin} player${
                    template.playerCountMin > 1 ? "s" : ""
                  }`
                : `${template.playerCountMin}-${template.playerCountMax} players`}
            </span>
            <span className="font-semibold">
              {template.maxTurnsMin === template.maxTurnsMax
                ? `${template.maxTurnsMin} turns`
                : `${template.maxTurnsMin}-${template.maxTurnsMax} turns`}
            </span>
          </div>
        </div>

        {/* Teaser */}
        <p className="text-sm text-primary-600 mb-4 line-clamp-3">
          {template.teaser}
        </p>

        {/* Tags */}
        {sortedTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sortedTags.map((tag, index) => (
              <span
                key={index}
                className="inline-block px-2 py-0.5 text-xs bg-primary-50 text-primary-700 rounded-md"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
