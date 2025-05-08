import React, { useMemo } from "react";
import { ImageCard } from "./ImageCard";
import { ImageReference } from "core/types/image";

interface CoverCardProps {
  sourceId?: string; // Template or Story ID (optional)
  source?: "template" | "story"; // Type of the source
  title: string;
  size?: "default" | "large";
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * A specialized card component for displaying template or story cover images.
 * It simplifies the ImageCard API by only requiring a source type and ID instead of a full ImageReference.
 */
export const CoverCard: React.FC<CoverCardProps> = ({
  sourceId,
  source = "template",
  title,
  size = "default",
  onClick,
  children,
  className = "",
}) => {
  // Create the image reference for a cover image if sourceId is provided
  const coverImageRef: ImageReference | undefined = useMemo(() => {
    if (!sourceId) return undefined;

    return {
      id: "cover",
      source: source,
      sourceId: sourceId,
      fileType: "jpeg",
    };
  }, [sourceId, source]);

  return (
    <ImageCard
      imageRef={coverImageRef}
      title={title}
      size={size}
      onClick={onClick}
      className={className}
    >
      {children}
    </ImageCard>
  );
};
