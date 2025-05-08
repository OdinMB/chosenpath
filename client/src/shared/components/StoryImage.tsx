import { useState, useEffect } from "react";
import { ImageUI } from "core/types/image";
import { Icons, Modal } from "./ui";
import { constructImageUrl } from "shared/utils/imageUtils";

interface StoryImageProps {
  image: ImageUI;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  objectPosition?: string;
  responsivePosition?: boolean;
  mobileOffset?: string;
  desktopOffset?: string;
  caption?: string;
  withinText?: boolean;
  float?: "left" | "right";
}

export const StoryImage: React.FC<StoryImageProps> = ({
  image,
  alt,
  className = "",
  fallbackSrc,
  objectPosition = "center",
  responsivePosition = false,
  mobileOffset = "5%",
  desktopOffset = "5%",
  caption,
  withinText = false,
  float = "left",
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [src, setSrc] = useState<string>("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<
    "portrait" | "landscape" | "square"
  >("portrait");
  const [actualImageLoaded, setActualImageLoaded] =
    useState<HTMLImageElement | null>(null);

  // Handle responsive screen size detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Determine aspect ratio based on image metadata or actual loaded dimensions
  useEffect(() => {
    if (actualImageLoaded) {
      const width = actualImageLoaded.naturalWidth;
      const height = actualImageLoaded.naturalHeight;

      if (width > height * 1.2) {
        setImageAspectRatio("landscape");
      } else if (height > width * 1.2) {
        setImageAspectRatio("portrait");
      } else {
        setImageAspectRatio("square");
      }
    }
  }, [actualImageLoaded]);

  // Parse the offset percentage
  const getOffsetValue = (offsetStr: string) => {
    // Remove the % sign and convert to number
    return parseFloat(offsetStr.replace("%", "")) / 100;
  };

  // Calculate the transform value based on offset
  const getTransformValue = () => {
    if (!responsivePosition) {
      // Use objectPosition for non-responsive positioning
      return "none";
    }

    const offsetStr = isMobile ? mobileOffset : desktopOffset;
    const offsetValue = getOffsetValue(offsetStr);

    // This will move the image up by the offset percentage of its height
    return `translateY(-${offsetValue * 100}%)`;
  };

  // Calculate the style for the image
  const imageStyle = {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    transform: getTransformValue(),
    objectPosition: responsivePosition ? "50% 0%" : objectPosition,
  };

  useEffect(() => {
    if (!image) return;

    // Use the utility function to construct the image URL
    const imagePath = constructImageUrl(image) || fallbackSrc || "";
    setSrc(imagePath);
  }, [image, fallbackSrc]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setActualImageLoaded(e.currentTarget);
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

  const handleImageClick = () => {
    if (!isMobile && image?.status === "ready") {
      setIsModalOpen(true);
    }
  };

  // Determine what caption to display - use the provided caption or fall back to image description
  const displayCaption = caption || image?.description;

  // Get responsive width classes based on aspect ratio
  const getResponsiveWidthClasses = () => {
    if (!withinText) return ""; // Only apply special width handling for images within text

    // On mobile, always full width
    const baseClasses = "w-full mx-auto my-2";

    // Calculate float-related classes
    const floatClasses =
      float === "right" ? "md:float-right md:ml-6" : "md:float-left md:mr-6";

    // Different widths based on aspect ratio for larger screens
    if (imageAspectRatio === "landscape") {
      return `${baseClasses} ${floatClasses} md:w-3/5 lg:w-1/2`;
    } else if (imageAspectRatio === "square") {
      return `${baseClasses} ${floatClasses} md:w-2/5 lg:w-1/3`;
    } else {
      // portrait
      return `${baseClasses} ${floatClasses} md:w-1/3 lg:w-1/4`;
    }
  };

  // Determine if we need to wrap the component for text flow
  const renderContent = () => {
    const imageContent = (
      <div className={`relative ${className}`}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
            <Icons.Spinner className="w-10 h-10 text-primary-500" />
          </div>
        )}
        {hasError && !fallbackSrc && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
            <Icons.Spinner className="w-10 h-10 text-primary-500" />
          </div>
        )}
        <div
          className={`overflow-hidden rounded-lg ${
            !isMobile && image?.status === "ready" ? "cursor-pointer" : ""
          }`}
          onClick={handleImageClick}
        >
          {src && (
            <img
              src={src}
              alt={alt}
              className={`w-full h-full object-cover ${
                isLoading ? "opacity-0" : "opacity-100"
              }`}
              style={imageStyle}
              onLoad={handleLoad}
              onError={handleError}
            />
          )}
        </div>
        {displayCaption && (
          <div className="text-sm text-center mt-2 px-2 text-primary-600 italic">
            {displayCaption}
          </div>
        )}
      </div>
    );

    if (withinText) {
      return <div className={getResponsiveWidthClasses()}>{imageContent}</div>;
    }

    return imageContent;
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
        <Icons.Spinner className="w-10 h-10 text-primary-500" />
        <span className="sr-only">Loading image...</span>
      </div>
    );
  }

  return (
    <>
      {renderContent()}

      {/* Image Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        width="2xl"
        className="max-h-[90vh]"
        fullScreen={true}
      >
        <div className="flex flex-col items-center">
          {src && (
            <img
              src={src}
              alt={alt}
              className="max-h-[70vh] w-auto object-contain rounded-lg"
            />
          )}
          {displayCaption && (
            <div className="text-center mt-4 text-primary-600 italic">
              {displayCaption}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
