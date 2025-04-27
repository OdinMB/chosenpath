import { useState, useEffect } from "react";
import { Image } from "core/types/image";
import { Icons } from "./ui/Icons";
import { API_CONFIG } from "core/config";

interface StoryImageProps {
  image: Image;
  alt: string;
  templateId?: string;
  className?: string;
  fallbackSrc?: string;
  objectPosition?: string;
  responsivePosition?: boolean;
  mobileOffset?: string;
  desktopOffset?: string;
}

export const StoryImage: React.FC<StoryImageProps> = ({
  image,
  alt,
  templateId,
  className = "",
  fallbackSrc,
  objectPosition = "center",
  responsivePosition = false,
  mobileOffset = "5%",
  desktopOffset = "5%",
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [src, setSrc] = useState<string>("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Handle responsive screen size detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Determine the appropriate object position
  const calculatedPosition = responsivePosition
    ? isMobile
      ? `center ${mobileOffset}`
      : `center ${desktopOffset}`
    : objectPosition;

  useEffect(() => {
    if (!image || image.status !== "ready") return;

    const constructImagePath = () => {
      const baseUrl = API_CONFIG.DEFAULT_API_URL;

      // For template images
      if (image.source === "template" && templateId) {
        return `${baseUrl}/images/templates/${templateId}${
          image.subDirectory ? `/${image.subDirectory}` : ""
        }/${image.id}.${image.fileType}?t=${Date.now()}`;
      }

      // For story generated images
      if (image.source === "story") {
        return `${baseUrl}/images/stories/${
          image.subDirectory ? `${image.subDirectory}/` : ""
        }${image.id}.${image.fileType}?t=${Date.now()}`;
      }

      return fallbackSrc || "";
    };

    const imagePath = constructImagePath();
    setSrc(imagePath);
  }, [image, templateId, fallbackSrc]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    if (fallbackSrc) {
      setSrc(fallbackSrc);
    }
  };

  if (!image) {
    return fallbackSrc ? (
      <img src={fallbackSrc} alt={alt} className={className} />
    ) : (
      <div
        className={`flex items-center justify-center bg-gray-100 ${className}`}
      >
        <Icons.Image className="w-10 h-10 text-gray-400" />
      </div>
    );
  }

  if (image.status === "generating") {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 ${className}`}
      >
        <Icons.Spinner className="w-10 h-10 text-primary-500" />
        <span className="sr-only">Generating image...</span>
      </div>
    );
  }

  if (image.status === "failed") {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 ${className}`}
      >
        <Icons.Error className="w-10 h-10 text-red-500" />
        <span className="sr-only">Failed to generate image</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <Icons.Spinner className="w-10 h-10 text-primary-500" />
        </div>
      )}
      {hasError && !fallbackSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <Icons.Error className="w-10 h-10 text-red-500" />
        </div>
      )}
      {src && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
          style={{ objectPosition: calculatedPosition }}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
};
