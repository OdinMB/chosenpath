import React, { ReactNode } from "react";
import { Tooltip, Icons } from "./";

interface InfoIconProps {
  tooltipText: ReactNode;
  position?: "top" | "right" | "bottom" | "left";
  className?: string;
  contentClassName?: string;
}

export const InfoIcon: React.FC<InfoIconProps> = ({
  tooltipText,
  position = "right",
  className = "ml-2 mt-1",
  contentClassName = "",
}) => (
  <Tooltip
    content={tooltipText}
    position={position}
    contentClassName={contentClassName}
  >
    <div
      className={`inline-block align-top text-primary-400 ${className}`}
      style={{ position: "relative", top: "-2px" }}
    >
      <Icons.Info />
    </div>
  </Tooltip>
);
