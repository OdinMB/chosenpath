import React, { useState, useEffect, useRef } from "react";
import {
  ResolutionDetails,
  DEFAULT_DISTRIBUTION,
  SAFE_DISTRIBUTION,
  RISKY_DISTRIBUTION,
} from "../../../shared/types/beat";
import { Resolution } from "../../../shared/types/thread";
import { Tooltip } from "./ui/Tooltip";
import { InfoIcon } from "./ui/InfoIcon";

interface PreviousChoiceVisualizerProps {
  choice: {
    text: string;
    optionType: string;
    resourceType?: string;
    riskType?: string;
  };
  resolution?: Resolution;
  resolutionDetails?: ResolutionDetails;
  animateRoll?: boolean;
}

export const PreviousChoiceVisualizer: React.FC<
  PreviousChoiceVisualizerProps
> = ({ choice, resolution, resolutionDetails, animateRoll = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(animateRoll);
  const [showEmoji, setShowEmoji] = useState(!animateRoll);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isChallenge = choice.optionType === "challenge";

  // Set up animation when component mounts or when animateRoll changes
  useEffect(() => {
    if (animateRoll && isChallenge && resolution) {
      setIsAnimating(true);
      setShowEmoji(false);

      // Clear any existing timeouts
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      // Set a timeout to show the emoji after animation
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        setShowEmoji(true);
      }, 6000); // Match animation duration in ChallengeResolutionVisualizer
    } else {
      setIsAnimating(false);
      setShowEmoji(true);
    }

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [animateRoll, isChallenge, resolution]);

  // Get emoji based on resolution or exploration
  const getIconContent = () => {
    if (!isChallenge) {
      // Exploration beat - show fork in the road icon
      return (
        <Tooltip content="You chose a path" position="right">
          <div className="text-lg text-primary">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-10 h-10"
            >
              {/* Road starts at bottom center and forks to top left and right */}
              <path
                d="M16 29C16 29 16 22 16 19C16 16 18 15 19 14C20 13 22 11 23 9C24 7 24 4 24 4"
                stroke="#1B1F3A"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M16 19C16 19 14 16 13 15C12 14 10 12 9 10C8 8 8 4 8 4"
                stroke="#1B1F3A"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="8" cy="4" r="2.5" fill="#1B1F3A" />
              <circle cx="24" cy="4" r="2.5" fill="#1B1F3A" />
              <circle cx="16" cy="29" r="2.5" fill="#1B1F3A" />

              {/* Add small arrows to indicate direction */}
              <path
                d="M11 6L8 4L5 6"
                stroke="#1B1F3A"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M27 6L24 4L21 6"
                stroke="#1B1F3A"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </Tooltip>
      );
    }

    // For challenge beats
    if (!resolution) {
      return <div className="w-8 h-8"></div>;
    }

    // If animating, show a placeholder
    if (isAnimating && !expanded) {
      return (
        <div className="w-8 h-8 animate-pulse bg-gray-200 rounded-full"></div>
      );
    }

    // Show emoji after animation completes
    if (showEmoji) {
      const emoji =
        resolution === "favorable"
          ? "😀"
          : resolution === "mixed"
          ? "😐"
          : "🙁";
      const tooltip =
        resolution === "favorable"
          ? "Things go well"
          : resolution === "mixed"
          ? "Results are mixed"
          : "Things don't go as planned";

      return (
        <Tooltip content={tooltip} position="right">
          <div className="text-3xl animate-fadeIn">{emoji}</div>
        </Tooltip>
      );
    }

    // Fallback
    return <div className="w-8 h-8"></div>;
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

  // Convert risk type to display text
  const getRiskDisplayText = (riskType?: string): string => {
    switch (riskType) {
      case "risky":
        return "High";
      case "normal":
        return "Balanced";
      case "safe":
        return "Low";
      default:
        return "Unknown";
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

  // Format the point modifiers into a readable component
  const formatPointBreakdown = (): React.ReactNode => {
    if (
      !resolutionDetails?.readablePointModifiers ||
      resolutionDetails.readablePointModifiers.length === 0
    ) {
      return null;
    }

    return (
      <div className="text-left w-full">
        <div className="space-y-2">
          {resolutionDetails.readablePointModifiers.map(
            ([name, value], index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="mr-3">{name}</span>
                <span
                  className={value >= 0 ? "text-emerald-600" : "text-red-600"}
                >
                  {value > 0 ? `+${value}` : value}
                </span>
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto mb-4">
      <div className="bg-white p-4 rounded-lg border-l-8 border border-secondary shadow-md text-lg">
        <div className="flex justify-between">
          <div className="flex items-center gap-3">
            {/* Icon on the left - either path icon or emoji */}
            <div className="flex-shrink-0">{getIconContent()}</div>

            {/* Choice text */}
            <span className="text-primary">{choice.text}</span>
          </div>

          {/* Expand/collapse button for challenge choices */}
          {isChallenge && resolutionDetails && resolution && (
            <button
              className="flex-shrink-0 text-primary-500 hover:text-primary focus:outline-none ml-2"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse details" : "Expand details"}
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
          )}
        </div>

        {/* Expanded view for challenge resolution */}
        {expanded && isChallenge && resolutionDetails && resolution && (
          <div className="mt-3">
            <div className="max-w-md mx-auto">
              {/* Distribution bar */}
              <div className="relative h-5 rounded-lg overflow-hidden shadow-inner flex z-0 w-full mb-2">
                {/* Favorable segment */}
                {resolutionDetails.distribution.favorable > 0 && (
                  <BarSegment
                    width={resolutionDetails.distribution.favorable}
                    color={getColor("favorable")}
                    isHighlighted={resolution === "favorable"}
                    isLast={
                      resolutionDetails.distribution.mixed === 0 &&
                      resolutionDetails.distribution.unfavorable === 0
                    }
                    tooltipText={`${resolutionDetails.distribution.favorable}%`}
                    emojiIcon="😀"
                  />
                )}

                {/* Mixed segment */}
                {resolutionDetails.distribution.mixed > 0 && (
                  <BarSegment
                    width={resolutionDetails.distribution.mixed}
                    color={getColor("mixed")}
                    isHighlighted={resolution === "mixed"}
                    isLast={resolutionDetails.distribution.unfavorable === 0}
                    tooltipText={`${resolutionDetails.distribution.mixed}%`}
                    emojiIcon="😐"
                  />
                )}

                {/* Unfavorable segment */}
                {resolutionDetails.distribution.unfavorable > 0 && (
                  <BarSegment
                    width={resolutionDetails.distribution.unfavorable}
                    color={getColor("unfavorable")}
                    isHighlighted={resolution === "unfavorable"}
                    isLast={true}
                    tooltipText={`${resolutionDetails.distribution.unfavorable}%`}
                    emojiIcon="🙁"
                  />
                )}

                {/* Cursor for roll position */}
                {resolutionDetails.roll !== undefined && (
                  <div
                    className="absolute"
                    style={{
                      left: `${resolutionDetails.roll}%`,
                      height: "calc(100% + 8px)",
                      top: "-4px", // Extend 4px above
                      width: "1.5px",
                      backgroundColor: "black",
                      transform: "translateX(-0.75px)",
                      zIndex: 5,
                      pointerEvents: "none",
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
                )}
              </div>

              {/* Info row with Risk, Resource Type, and Points */}
              <div className="flex flex-wrap justify-between text-sm gap-4">
                <div className="flex items-baseline">
                  <span className="font-semibold text-primary mr-1">Risk:</span>
                  <span className="text-primary flex items-center">
                    <span>{getRiskDisplayText(choice.riskType)}</span>
                    <InfoIcon
                      tooltipText={formatRiskDistribution(choice.riskType)}
                    />
                  </span>
                </div>

                {choice.resourceType && choice.resourceType !== "normal" ? (
                  <div className="flex items-baseline">
                    <span className="font-semibold text-primary mr-1 capitalize">
                      {choice.resourceType}:
                    </span>
                    <InfoIcon
                      tooltipText={getResourceTypeInfo(choice.resourceType)}
                    />
                  </div>
                ) : (
                  resolutionDetails?.points !== undefined && (
                    <div className="flex items-baseline">
                      <span className="font-semibold text-primary mr-1">
                        {resolutionDetails.points >= 0 ? "Bonus" : "Malus"}:
                      </span>
                      <span className="text-primary mr-1">
                        {resolutionDetails.points}
                      </span>
                      {resolutionDetails.readablePointModifiers &&
                        resolutionDetails.readablePointModifiers.length > 0 && (
                          <InfoIcon
                            tooltipText={formatPointBreakdown()}
                            contentClassName="max-w-[400px]"
                          />
                        )}
                    </div>
                  )
                )}

                {/* Only show points in third column if resource type exists */}
                {choice.resourceType &&
                  choice.resourceType !== "normal" &&
                  resolutionDetails?.points !== undefined && (
                    <div className="flex items-baseline">
                      <span className="font-semibold text-primary mr-1">
                        {resolutionDetails.points >= 0 ? "Bonus" : "Malus"}:
                      </span>
                      <span className="text-primary mr-1">
                        {resolutionDetails.points}
                      </span>
                      {resolutionDetails.readablePointModifiers &&
                        resolutionDetails.readablePointModifiers.length > 0 && (
                          <InfoIcon
                            tooltipText={formatPointBreakdown()}
                            contentClassName="max-w-[400px]"
                          />
                        )}
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
