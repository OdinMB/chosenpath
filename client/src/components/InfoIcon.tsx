import React from "react";
import { Tooltip } from "./ui/Tooltip";

interface InfoIconProps {
  tooltipText: string;
  position?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export const InfoIcon: React.FC<InfoIconProps> = ({
  tooltipText,
  position = "top",
  className = "",
}) => (
  <Tooltip content={tooltipText} position={position}>
    <div
      className={`inline-block ml-1 align-top ${className}`}
      style={{ position: "relative", top: "-2px" }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 text-primary-400 inline-block"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
  </Tooltip>
);
