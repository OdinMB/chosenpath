import React, { useState } from "react";
import {
  ResolutionDetails,
  DEFAULT_DISTRIBUTION,
  SAFE_DISTRIBUTION,
  RISKY_DISTRIBUTION,
} from "../../../shared/types/beat";
import { Resolution } from "../../../shared/types/thread";
import { ChallengeOption } from "../../../shared/types/beat";
import { Tooltip } from "./ui/Tooltip";
import { InfoIcon } from "./InfoIcon";

interface ChallengeResolutionVisualizerProps {
  resolutionDetails: ResolutionDetails;
  resolution: Resolution;
  option?: ChallengeOption;
}

export const ChallengeResolutionVisualizer: React.FC<
  ChallengeResolutionVisualizerProps
> = ({ resolutionDetails, resolution, option }) => {
  const [expanded, setExpanded] = useState(false);
  const { distribution, roll, points, readablePointModifiers } =
    resolutionDetails;

  // First, add a helper function to create a formatted point breakdown component
  const formatPointBreakdown = (): React.ReactNode => {
    if (!readablePointModifiers || readablePointModifiers.length === 0)
      return null;

    return (
      <div className="text-left w-full">
        <div className="space-y-2">
          {readablePointModifiers.map(([name, value], index) => (
            <div key={index} className="flex justify-between text-sm">
              <span className="mr-3">{name}</span>
              <span
                className={value >= 0 ? "text-emerald-600" : "text-red-600"}
              >
                {value > 0 ? `+${value}` : value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Calculate the position for the marker
  const markerPosition = roll != null ? roll : 50;

  // Get color for an outcome type
  const getColor = (outcome: string): string => {
    switch (outcome) {
      case "favorable":
        return "bg-secondary";
      case "mixed":
        return "bg-secondary bg-opacity-60";
      case "unfavorable":
        return "bg-secondary bg-opacity-30";
      default:
        return "bg-primary-200";
    }
  };

  // Get outcome description text
  const getOutcomeDescription = (outcome: Resolution): string => {
    switch (outcome) {
      case "favorable":
        return "Things went well";
      case "mixed":
        return "Results were mixed";
      case "unfavorable":
        return "Things didn't go as planned";
      default:
        return "";
    }
  };

  // Get thumbs icon based on outcome
  const getThumbsIcon = () => {
    const tooltip = getOutcomeDescription(resolution);

    switch (resolution) {
      case "favorable":
        return (
          <Tooltip content={tooltip} position="right">
            <div className="text-2xl">😀</div>
          </Tooltip>
        );
      case "mixed":
        return (
          <Tooltip content={tooltip} position="right">
            <div className="text-2xl">😐</div>
          </Tooltip>
        );
      case "unfavorable":
        return (
          <Tooltip content={tooltip} position="right">
            <div className="text-2xl">🙁</div>
          </Tooltip>
        );
      default:
        return null;
    }
  };

  // Format risk distribution for tooltip text
  const formatRiskDistribution = (riskType?: string): string => {
    switch (riskType) {
      case "normal":
        return `😀 ${DEFAULT_DISTRIBUTION.favorable}% | 😐 ${DEFAULT_DISTRIBUTION.mixed}% | 🙁 ${DEFAULT_DISTRIBUTION.unfavorable}%`;
      case "safe":
        return `😀 ${SAFE_DISTRIBUTION.favorable}% | 😐 ${SAFE_DISTRIBUTION.mixed}% | 🙁 ${SAFE_DISTRIBUTION.unfavorable}%`;
      case "risky":
        return `😀 ${RISKY_DISTRIBUTION.favorable}% | 😐 ${RISKY_DISTRIBUTION.mixed}% | 🙁 ${RISKY_DISTRIBUTION.unfavorable}%`;
      default:
        return "Unknown risk type";
    }
  };

  // Get resource type info as string
  const getResourceTypeInfo = (resourceType?: string): string => {
    switch (resourceType) {
      case "sacrifice":
        return "You paid a price to gain an edge.";
      case "reward":
        return "You chased a reward, which made things harder.";
      default:
        return "Standard option with no special effects.";
    }
  };

  // Bar segment with tooltip
  const BarSegment = ({
    width,
    color,
    isHighlighted,
    isLast,
    tooltipText,
    emojiIcon,
  }: {
    width: number;
    color: string;
    isHighlighted: boolean;
    isLast: boolean;
    tooltipText: string;
    emojiIcon: string;
  }) => {
    // Prevent zero width segments from causing layout issues
    const safeWidth = Math.max(width, 0.1);

    return (
      <div
        className="h-full"
        style={{ width: `${safeWidth}%`, minWidth: width > 0 ? "4px" : "0" }}
      >
        <Tooltip
          content={`${emojiIcon} ${tooltipText}`}
          position="top"
          delay={400}
          contentClassName="bg-secondary border-secondary"
          className="block w-full h-full"
        >
          <div
            className={`w-full h-full ${color} ${
              isHighlighted
                ? "ring-1 ring-white border-r border-white"
                : isLast
                ? ""
                : "border-r border-white border-opacity-50"
            } cursor-pointer`}
          />
        </Tooltip>
      </div>
    );
  };

  // Determine risk type (default to "unknown" if not specified)
  const riskType = option?.riskType || "unknown";
  const resourceType = option?.resourceType;

  // Convert risk type to display text
  const getRiskDisplayText = (riskType?: string): string => {
    switch (riskType) {
      case "risky":
        return "High";
      case "normal":
        return "Medium";
      case "safe":
        return "Low";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="challenge-resolution-visualizer p-4 bg-white rounded-lg border border-primary-100 shadow-md mx-auto w-full max-w-sm">
      <div className="flex flex-col space-y-3">
        <div className="flex items-center space-x-3">
          {/* Thumbs icon based on outcome */}
          <div className="flex-shrink-0">{getThumbsIcon()}</div>

          {/* Distribution bar - using distinct blocks */}
          <div className="relative flex-grow h-6 max-w-xs rounded-lg overflow-hidden shadow-inner flex z-0 w-full">
            {/* Favorable segment */}
            {distribution.favorable > 0 && (
              <BarSegment
                width={distribution.favorable}
                color={getColor("favorable")}
                isHighlighted={resolution === "favorable"}
                isLast={
                  distribution.mixed === 0 && distribution.unfavorable === 0
                }
                tooltipText={`${distribution.favorable}%`}
                emojiIcon="😀"
              />
            )}

            {/* Mixed segment */}
            {distribution.mixed > 0 && (
              <BarSegment
                width={distribution.mixed}
                color={getColor("mixed")}
                isHighlighted={resolution === "mixed"}
                isLast={distribution.unfavorable === 0}
                tooltipText={`${distribution.mixed}%`}
                emojiIcon="😐"
              />
            )}

            {/* Unfavorable segment */}
            {distribution.unfavorable > 0 && (
              <BarSegment
                width={distribution.unfavorable}
                color={getColor("unfavorable")}
                isHighlighted={resolution === "unfavorable"}
                isLast={true}
                tooltipText={`${distribution.unfavorable}%`}
                emojiIcon="🙁"
              />
            )}

            {/* Cursor positioned directly on the bar */}
            <div
              className="absolute"
              style={{
                left: `${markerPosition}%`,
                height: "calc(100% + 8px)",
                top: "-4px", // Extend 4px above
                width: "1.5px",
                backgroundColor: "black",
                transform: "translateX(-0.75px)",
                zIndex: 5,
                pointerEvents: "none", // Ensure tooltips work through the marker
              }}
            >
              {/* Top horizontal line of cursor */}
              <div
                className="absolute top-0 bg-black"
                style={{
                  width: "3px",
                  height: "1.5px",
                  left: "-0.75px",
                  pointerEvents: "none",
                }}
              ></div>

              {/* Bottom horizontal line of cursor */}
              <div
                className="absolute bottom-0 bg-black"
                style={{
                  width: "3px",
                  height: "1.5px",
                  left: "-0.75px",
                  pointerEvents: "none",
                }}
              ></div>
            </div>
          </div>

          {/* Expand/collapse button */}
          <button
            className="flex-shrink-0 text-primary-500 hover:text-primary focus:outline-none"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Extended information */}
        {expanded && (
          <div className="mt-2 text-sm">
            {option && (
              <div className="mb-2">
                <span className="font-semibold text-primary mr-1">
                  {option.resourceType === "sacrifice"
                    ? "Sacrifice"
                    : option.resourceType === "reward"
                    ? "Reward"
                    : "Choice"}
                  :
                </span>
                <span className="text-primary">{option.text}</span>
              </div>
            )}

            <div className="flex flex-wrap mb-1">
              <div className="flex items-baseline mr-10">
                <span className="font-semibold text-primary mr-1">Risk:</span>
                <span className="text-primary flex items-center">
                  <span>{getRiskDisplayText(riskType)}</span>
                  <InfoIcon tooltipText={formatRiskDistribution(riskType)} />
                </span>
              </div>

              {resourceType && resourceType !== "normal" && (
                <div className="flex items-baseline mr-10">
                  <span className="font-semibold text-primary capitalize">
                    {resourceType}
                  </span>
                  <InfoIcon tooltipText={getResourceTypeInfo(resourceType)} />
                </div>
              )}

              <div className="flex items-baseline">
                <span className="font-semibold text-primary mr-1">
                  {points >= 0 ? "Bonus" : "Malus"}:
                </span>
                <span className="text-primary mr-1">{points}</span>
                {readablePointModifiers &&
                  readablePointModifiers.length > 0 && (
                    <InfoIcon
                      tooltipText={formatPointBreakdown()}
                      contentClassName="max-w-[400px]"
                    />
                  )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
