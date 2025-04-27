import { useState, useEffect } from "react";
import { StoryTemplate } from "core/types";
import { PrimaryButton } from "components/ui";
import { sortTagsByCategory } from "shared/tagCategories";
import { API_CONFIG } from "core/config";

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
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Sort tags by category
  const sortedTags = template.tags ? sortTagsByCategory(template.tags) : [];

  // Size-based class mapping
  const sizeClasses = {
    title: size === "large" ? "text-xl" : "text-lg",
    teaser: size === "large" ? "text-base" : "text-sm",
    info: size === "large" ? "text-sm" : "text-xs",
    tag: size === "large" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5",
  };

  // Try to load the template cover image
  useEffect(() => {
    const loadCoverImage = async () => {
      if (!template.id) return;

      // Use a timestamp to prevent caching
      const timestamp = new Date().getTime();
      const coverImageUrl = `${API_CONFIG.DEFAULT_API_URL}/images/templates/${template.id}/cover.jpeg?t=${timestamp}`;

      try {
        // Check if the image exists
        const response = await fetch(coverImageUrl, { method: "HEAD" });
        if (response.ok) {
          setCoverImage(coverImageUrl);
        } else {
          setCoverImage(null);
        }
      } catch (err) {
        console.error("Error checking template cover image:", err);
        setCoverImage(null);
      }
    };

    loadCoverImage();
  }, [template.id]);

  // Handle image load success
  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  // Handle image load error
  const handleImageError = () => {
    setImageLoaded(false);
    setCoverImage(null);
  };

  return (
    <div
      className={`w-full bg-white rounded-lg border border-primary-100 overflow-hidden ${className}`}
    >
      <div className="flex">
        <div
          className={`relative ${
            size === "large" ? "w-24" : "w-20"
          } overflow-hidden flex-shrink-0 bg-gray-100`}
        >
          {coverImage ? (
            <img
              src={coverImage}
              alt={`${template.title} cover`}
              className={`absolute h-full ${
                size === "large" ? "w-24" : "w-20"
              } object-cover object-center transition-opacity duration-300 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          ) : (
            // Placeholder when no image is available
            <div
              className={`flex items-center justify-center h-full w-full text-gray-400`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
        </div>

        <div className="w-full p-4">
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
          <p
            className={`${sizeClasses.teaser} text-primary-600 mb-4 line-clamp-3`}
          >
            {template.teaser}
          </p>

          {/* Tags */}
          {sortedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
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
        </div>
      </div>
    </div>
  );
};
