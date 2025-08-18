import React, { useState, useEffect } from "react";
import { Icons } from "components/ui/Icons";
import { StoryImage } from "shared/components/StoryImage";
import { ImageUI } from "core/types";
import { constructImageUrl } from "shared/utils/imageUtils";

interface ImagePlaceholderProps {
  image: ImageUI;
  alt: string;
  isGenerating: boolean;
  canGenerateImages: boolean;
  hasAppearance: boolean;
  onGenerateClick?: (e?: React.MouseEvent) => void;
  className?: string;
  size?: "small" | "medium" | "large";
  missingContentMessage?: string;
}

export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({
  image,
  alt,
  isGenerating,
  canGenerateImages,
  hasAppearance,
  onGenerateClick,
  className = "",
  size = "small",
  missingContentMessage = "Add an appearance description to generate an image",
}) => {
  const [imageExists, setImageExists] = useState(false);
  const [checkingImage, setCheckingImage] = useState(false);

  // Determine container dimensions based on size
  const sizeClasses = {
    small: "w-16 h-16",
    medium: "w-24 h-24",
    large: "w-32 h-32",
  };

  const iconSizes = {
    small: "w-6 h-6",
    medium: "w-8 h-8",
    large: "w-10 h-10",
  };

  const containerClass = `${sizeClasses[size]} rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-50 ${className}`;
  const iconClass = iconSizes[size];

  // Check if image URL can be constructed
  const canConstructUrl = image.source && image.sourceId && image.id;

  // Check if the image actually exists on the server
  useEffect(() => {
    if (canConstructUrl && !isGenerating) {
      setCheckingImage(true);
      const imageUrl = constructImageUrl(image);

      // Create a test image to check if it loads
      const img = new Image();
      img.onload = () => {
        setImageExists(true);
        setCheckingImage(false);
      };
      img.onerror = () => {
        setImageExists(false);
        setCheckingImage(false);
      };
      img.src = imageUrl;
    } else {
      setImageExists(false);
      setCheckingImage(false);
    }
  }, [canConstructUrl, image, isGenerating]);

  // If actively generating, show spinner
  if (isGenerating) {
    return (
      <div className={containerClass}>
        <div className="w-full h-full flex items-center justify-center bg-gray-100">
          <Icons.Spinner className={`${iconClass} text-blue-500`} />
        </div>
      </div>
    );
  }

  // If we're checking if the image exists, show nothing (prevents flicker)
  if (checkingImage) {
    return (
      <div className={containerClass}>
        <div className="w-full h-full bg-gray-100" />
      </div>
    );
  }

  // If image exists, show the actual image
  if (imageExists) {
    return (
      <StoryImage
        image={image}
        alt={alt}
        className={containerClass}
        responsivePosition={false}
        objectPosition="center center"
        mode="thumbnail"
      />
    );
  }

  // No image file exists - show appropriate placeholder
  if (!canGenerateImages) {
    // User cannot generate images - show blocked icon with tooltip
    return (
      <div className={containerClass}>
        <div
          className="w-full h-full flex items-center justify-center bg-gray-100 cursor-not-allowed group relative"
          title="You don't have permission to generate images"
        >
          <Icons.Ban className={`${iconClass} text-gray-400`} />
          {/* Tooltip on hover */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            No permission to generate images
          </div>
        </div>
      </div>
    );
  }

  if (!hasAppearance) {
    // No appearance description - show disabled generate icon
    return (
      <div className={containerClass}>
        <div
          className="w-full h-full flex items-center justify-center bg-gray-100 cursor-not-allowed"
          title={missingContentMessage}
        >
          <Icons.CreateImage className={`${iconClass} text-gray-400`} />
        </div>
      </div>
    );
  }

  // Can generate - show clickable generate icon
  return (
    <div className={containerClass}>
      <button
        onClick={onGenerateClick}
        className="w-full h-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors group"
        title="Click to generate an image"
        type="button"
      >
        <Icons.CreateImage
          className={`${iconClass} text-blue-500 group-hover:text-blue-700`}
        />
      </button>
    </div>
  );
};
