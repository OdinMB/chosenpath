import React, { useState, useEffect } from "react";
import { Icons } from "./Icons";
import { API_CONFIG } from "core/config";

interface ImageWithPlaceholderProps {
  /** Image source URL or path suffix */
  src?: string;
  /** Base path for image, used with templateId and imagePath */
  templateId?: string;
  /** Path to the image within the template folder */
  imagePath?: string;
  /** Alt text for the image */
  alt: string;
  /** Optional CSS classes */
  className?: string;
  /** Optional height style */
  height?: string | number;
  /** Optional width style */
  width?: string | number;
  /** Custom placeholder component */
  placeholder?: React.ReactNode;
  /** Optional title/message for placeholder */
  placeholderText?: string;
  /** Optional additional text for placeholder */
  placeholderSubtext?: string;
  /** Optional object-fit style */
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  /** Show only the icon in placeholder without text */
  iconOnly?: boolean;
  /** Optional custom icon size */
  iconSize?: string;
  /** Border radius for the image and container */
  borderRadius?: string;
  /** Show a loading spinner instead of the create image icon */
  isLoading?: boolean;
  /** Force a refresh of the image by changing this key */
  refreshKey?: string | number;
}

export const ImageWithPlaceholder: React.FC<ImageWithPlaceholderProps> = ({
  src,
  templateId,
  imagePath,
  alt,
  className = "",
  height,
  width,
  placeholder,
  placeholderText = "No image",
  placeholderSubtext = "",
  objectFit = "contain",
  iconOnly = false,
  iconSize = "h-8 w-8",
  borderRadius = "rounded",
  isLoading = false,
  refreshKey,
}) => {
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>(src);

  useEffect(() => {
    // If direct src is provided, use it
    if (src) {
      setImageUrl(src);
      return;
    }

    // If templateId and imagePath are provided, construct URL
    if (templateId && imagePath) {
      const timestamp = new Date().getTime();
      const constructedUrl = `${API_CONFIG.DEFAULT_API_URL}/images/templates/${templateId}/${imagePath}?t=${timestamp}`;
      setImageUrl(constructedUrl);
    }
  }, [src, templateId, imagePath, refreshKey]);

  useEffect(() => {
    // Reset states when src changes
    setImageLoaded(false);
    setImageError(false);
  }, [imageUrl]);

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  const renderPlaceholder = () => {
    if (placeholder) {
      return placeholder;
    }

    if (isLoading) {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <Icons.Spinner className={`${iconSize} text-blue-500`} />
        </div>
      );
    }

    if (iconOnly) {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <Icons.CreateImage className={`${iconSize} text-gray-400`} />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center text-gray-500 p-2 text-center">
        <Icons.CreateImage
          className={`${iconSize} mx-auto mb-1 text-gray-400`}
        />
        <p className="text-sm">{placeholderText}</p>
        {placeholderSubtext && (
          <p className="text-xs text-gray-400">{placeholderSubtext}</p>
        )}
      </div>
    );
  };

  const containerStyle = {
    height: height || "100%",
    width: width || "100%",
    position: "relative" as const,
  };

  if (!imageUrl || imageError) {
    return (
      <div
        className={`border border-gray-300 ${borderRadius} bg-gray-100 flex items-center justify-center overflow-hidden ${className}`}
        style={containerStyle}
      >
        {renderPlaceholder()}
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={containerStyle}
    >
      {!imageLoaded && (
        <div
          className={`border border-gray-300 ${borderRadius} bg-gray-100 flex items-center justify-center overflow-hidden absolute inset-0 z-10`}
        >
          {renderPlaceholder()}
        </div>
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`${borderRadius} max-h-full max-w-full ${
          imageLoaded ? "z-20" : "invisible"
        }`}
        style={{ objectFit }}
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
    </div>
  );
};
