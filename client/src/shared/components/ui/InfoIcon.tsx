import React, { ReactNode } from "react";
import { Tooltip } from "./Tooltip.js";
import { Icons } from "./Icons.js";

interface InfoIconProps {
  tooltipText: ReactNode;
  position?: "top" | "right" | "bottom" | "left";
  className?: string;
  contentClassName?: string;
}

export const InfoIcon: React.FC<InfoIconProps> = ({
  tooltipText,
  position = "top",
  className = "",
  contentClassName = "",
}) => (
  <Tooltip
    content={tooltipText}
    position={position}
    contentClassName={contentClassName}
  >
    <div
      className={`inline-block ml-1 align-top text-primary-400 ${className}`}
      style={{ position: "relative", top: "-2px" }}
    >
      <Icons.Info />
    </div>
  </Tooltip>
);
