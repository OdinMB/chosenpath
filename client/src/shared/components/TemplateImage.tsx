import React from "react";
import { useTemplateImage } from "shared/hooks/useTemplateImage";

interface TemplateImageProps {
  templateId: string;
  imageName: string;
  alt?: string;
  className?: string;
  width?: number | string;
  height?: number | string;
  fallbackImage?: string;
  showPlaceholderOnError?: boolean;
  lazyLoad?: boolean;
  retryCount?: number;
  retryDelay?: number;
}

/**
 * Component for displaying images from templates directory
 */
export const TemplateImage: React.FC<TemplateImageProps> = ({
  templateId,
  imageName,
  alt = "Template image",
  className = "",
  width,
  height,
  fallbackImage = "placeholder-image.png",
  showPlaceholderOnError = true,
  lazyLoad = true,
  retryCount = 2,
  retryDelay = 1000,
}) => {
  const { imageUrl, isLoading, error, retry } = useTemplateImage({
    templateId,
    imageName,
    fallbackImage: showPlaceholderOnError ? fallbackImage : undefined,
    retryCount,
    retryDelay,
  });

  if (isLoading) {
    return <div className={`image-loading ${className}`}>Loading...</div>;
  }

  if (error && !showPlaceholderOnError) {
    return (
      <div className={`image-error ${className}`}>
        {error}
        <button
          onClick={retry}
          className="image-retry-button"
          style={{
            display: "block",
            marginTop: "8px",
            padding: "4px 8px",
            fontSize: "12px",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <img
      src={imageUrl || ""}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={lazyLoad ? "lazy" : undefined}
      onError={retry}
    />
  );
};
