import React, { ReactNode, ElementType, useId } from "react";
import { Tooltip, Icons } from "./";

interface InfoIconProps {
  /** The button's name: what it explains, such as "About unique images" */
  label: string;
  tooltipText: ReactNode;
  position?: "top" | "right" | "bottom" | "left";
  className?: string;
  contentClassName?: string;
  icon?: ElementType;
}

/**
 * An icon whose tooltip explains something. It is a button, so keyboard and
 * touch users reach it: keyboard focus or a tap opens the tooltip, as hovering
 * does, and screen readers read the tooltip's text as its description.
 */
export const InfoIcon: React.FC<InfoIconProps> = ({
  label,
  tooltipText,
  position = "right",
  className = "ml-2 mt-1",
  contentClassName = "",
  icon: IconComponent,
}) => {
  const RenderedIcon = IconComponent || Icons.Info;
  const descriptionId = useId();

  return (
    <Tooltip
      content={tooltipText}
      position={position}
      contentClassName={contentClassName}
      openOnClick
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={descriptionId}
        className={`inline-block align-middle text-primary-400 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
      >
        <RenderedIcon />
      </button>
      {/* The description at all times, not only while the tooltip shows */}
      <span id={descriptionId} hidden>
        {tooltipText}
      </span>
    </Tooltip>
  );
};
