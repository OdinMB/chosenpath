import React, { ReactNode, ElementType } from "react";
import { Tooltip, Icons } from "./";

interface InfoIconProps {
  tooltipText: ReactNode;
  position?: "top" | "right" | "bottom" | "left";
  className?: string;
  contentClassName?: string;
  icon?: ElementType;
}

export const InfoIcon: React.FC<InfoIconProps> = ({
  tooltipText,
  position = "right",
  className = "ml-2 mt-1",
  contentClassName = "",
  icon: IconComponent,
}) => {
  const RenderedIcon = IconComponent || Icons.Info;

  return (
    <Tooltip
      content={tooltipText}
      position={position}
      contentClassName={contentClassName}
    >
      <div
        className={`inline-block align-middle text-primary-400 ${className}`}
      >
        <RenderedIcon />
      </div>
    </Tooltip>
  );
};
