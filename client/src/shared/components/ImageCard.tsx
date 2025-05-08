import { useState, useEffect } from "react";
import { Icons } from "./ui/Icons";
import { ImageReference } from "core/types/image";
import { constructImageUrl } from "shared/utils/imageUtils";

interface ImageCardProps {
  imageRef: ImageReference;
  title: string;
  size?: "default" | "large";
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const ImageCard = ({
  imageRef,
  title,
  size = "default",
  onClick,
  children,
  className = "",
}: ImageCardProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Load image from the image reference
  useEffect(() => {
    if (!imageRef) return;

    // Use the utility function to construct the image URL
    const imagePath = constructImageUrl(imageRef);
    setImageSrc(imagePath);
  }, [imageRef]);

  // Handle image load success
  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  // Handle image load error
  const handleImageError = () => {
    setImageLoaded(false);
    setImageSrc(null);
  };

  const imageContainerClass = size === "large" ? "w-24" : "w-20";
  const minHeight = size === "large" ? "150px" : "120px";

  return (
    <div
      className={`w-full bg-white rounded-lg border border-primary-100 overflow-hidden ${className}`}
    >
      <div className="flex h-full">
        <div
          className={`relative ${imageContainerClass} overflow-hidden flex-shrink-0 bg-gray-100`}
          style={{ minHeight }}
        >
          {imageSrc ? (
            <div
              onClick={onClick}
              className={`w-full h-full ${onClick ? "cursor-pointer" : ""}`}
            >
              <img
                src={imageSrc}
                alt={`${title}`}
                className={`absolute h-full ${imageContainerClass} object-cover object-center transition-all duration-500 hover:scale-110
                } ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            </div>
          ) : (
            <div
              onClick={onClick}
              className={`flex items-center justify-center h-full w-full text-gray-400 ${
                onClick ? "cursor-pointer" : ""
              }`}
            >
              <Icons.Image
                className={size === "large" ? "h-8 w-8" : "h-6 w-6"}
              />
            </div>
          )}
        </div>
        <div className="w-full p-4 flex flex-col h-full">{children}</div>
      </div>
    </div>
  );
};
