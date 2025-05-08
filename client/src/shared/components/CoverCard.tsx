import React, { useMemo } from "react";
import { ImageCard } from "./ImageCard";
import { ImageReference } from "core/types/image";

interface CoverCardProps {
  sourceId: string; // Template ID
  title: string;
  size?: "default" | "large";
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * A specialized card component for displaying template cover images.
 * It simplifies the ImageCard API by only requiring a template ID instead of a full ImageReference.
 */
export const CoverCard: React.FC<CoverCardProps> = ({
  sourceId,
  title,
  size = "default",
  onClick,
  children,
  className = "",
}) => {
  // Create the image reference for a template cover image
  const templateCoverRef: ImageReference = useMemo(
    () => ({
      id: "cover",
      source: "template",
      sourceId: sourceId,
      fileType: "jpeg",
    }),
    [sourceId]
  );

  return (
    <ImageCard
      imageRef={templateCoverRef}
      title={title}
      size={size}
      onClick={onClick}
      className={className}
    >
      {children}
    </ImageCard>
  );
};
