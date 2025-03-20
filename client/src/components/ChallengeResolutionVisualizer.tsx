import React, { useState, useEffect, useRef, useCallback } from "react";
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
  animateRoll?: boolean;
}

export const ChallengeResolutionVisualizer: React.FC<
  ChallengeResolutionVisualizerProps
> = ({ resolutionDetails, resolution, option, animateRoll = false }) => {
  const [expanded, setExpanded] = useState(false);
  const { distribution, roll, points, readablePointModifiers } =
    resolutionDetails;

  // Animation states
  const [animatingMarker, setAnimatingMarker] = useState(animateRoll);
  const [showResults, setShowResults] = useState(!animateRoll);
  const [currentMarkerPosition, setCurrentMarkerPosition] = useState(50);
  const [emojiAnimationStage, setEmojiAnimationStage] = useState<
    "hidden" | "rotating" | "final"
  >("hidden");
  const animationRef = useRef<number | null>(null);
  const animationStartTime = useRef<number | null>(null);
  const animationDuration = 6000; // 6 seconds total
  const animationCompletedRef = useRef(false);
  const emojiAnimationStartedRef = useRef(false);

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

  // Function to stop animation and show results
  const completeAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    setCurrentMarkerPosition(roll != null ? roll : 50);
    setAnimatingMarker(false);
    setShowResults(true);
    setEmojiAnimationStage("final");
    animationCompletedRef.current = true;
  }, [roll]);

  // Animation function for the marker
  const animateMarker = useCallback(
    (timestamp: number) => {
      // Don't continue if animation was marked as completed
      if (animationCompletedRef.current) {
        return;
      }

      if (!animationStartTime.current) {
        animationStartTime.current = timestamp;
      }

      const elapsed = timestamp - animationStartTime.current;
      const progress = Math.min(elapsed / animationDuration, 1);

      // Handle normal animation progress
      if (progress < 0.95) {
        // Phase 1 (0-50%): Go back and forth between ends twice
        if (progress < 0.5) {
          // Creates 4 full sweeps (2 complete cycles) in the first 50% of animation time
          const fullSweepPosition =
            50 + 50 * Math.sin((4 * Math.PI * progress) / 0.5);
          setCurrentMarkerPosition(fullSweepPosition);
        }
        // Phase 2 (50-80%): Oscillate around the final position with gradually decreasing amplitude
        else if (progress < 0.8) {
          const phaseProgress = (progress - 0.5) / 0.3; // Normalized progress for this phase
          const targetPosition = roll != null ? roll : 50;

          // Start with large oscillations that gradually decrease
          // Use more oscillations (higher frequency) as we progress
          const frequency = 6 + 3 * phaseProgress; // Gentler frequency increase
          const amplitude = 40 * (1 - phaseProgress); // Decrease amplitude over time

          const oscillation =
            amplitude * Math.sin(frequency * Math.PI * phaseProgress);
          const convergence =
            50 + (targetPosition - 50) * (0.4 + 0.6 * phaseProgress);

          setCurrentMarkerPosition(convergence + oscillation);
        }
        // Phase 3 (80-95%): Settle gently on final position with smoother, slower oscillations
        else if (progress < 0.95) {
          const phaseProgress = (progress - 0.8) / 0.15;
          const targetPosition = roll != null ? roll : 50;

          // Gentler final oscillations with lower frequency
          const smallAmplitude = 5 * (1 - phaseProgress);
          const gentleOscillation =
            smallAmplitude * Math.sin(3 * Math.PI * phaseProgress);

          setCurrentMarkerPosition(targetPosition + gentleOscillation);
        }

        // Request next animation frame
        animationRef.current = requestAnimationFrame(animateMarker);
      }
      // Final phase - start emoji animation and finalize
      else {
        // Set marker to final position
        setCurrentMarkerPosition(roll != null ? roll : 50);

        // Start emoji animation sequence only once
        if (!emojiAnimationStartedRef.current) {
          emojiAnimationStartedRef.current = true;

          // Start rotation animation
          setEmojiAnimationStage("rotating");

          // After rotation completes, set to final state
          setTimeout(() => {
            setEmojiAnimationStage("final");
            completeAnimation();
          }, 1200); // 1.2 seconds for the rotation

          // Stop requesting animation frames here
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }
        }
      }
    },
    [roll, completeAnimation]
  );

  // Start or stop animation based on prop
  useEffect(() => {
    // Reset animation state when animateRoll changes
    if (animateRoll) {
      // Clear any existing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      // Reset state
      setAnimatingMarker(true);
      setShowResults(false);
      setEmojiAnimationStage("hidden");
      animationStartTime.current = null;
      animationCompletedRef.current = false;
      emojiAnimationStartedRef.current = false;

      // Start new animation
      animationRef.current = requestAnimationFrame(animateMarker);
    }

    // Cleanup function
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [animateRoll, animateMarker]);

  // Calculate the position for the marker - use roll directly for static display
  const markerPosition = animatingMarker
    ? currentMarkerPosition
    : roll != null
    ? roll
    : 50;

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
        return "Things go well";
      case "mixed":
        return "Results are mixed";
      case "unfavorable":
        return "Things don't go as planned";
      default:
        return "";
    }
  };

  // Get thumbs icon based on outcome with rotation animation
  const getThumbsIcon = () => {
    const tooltip = getOutcomeDescription(resolution);

    // If no animation is happening (non-animated mode), show emoji immediately
    if (!animateRoll) {
      return (
        <Tooltip content={tooltip} position="right">
          <div className="text-2xl opacity-100">
            {resolution === "favorable"
              ? "😀"
              : resolution === "mixed"
              ? "😐"
              : "🙁"}
          </div>
        </Tooltip>
      );
    }

    // Get emoji based on resolution
    const emoji =
      resolution === "favorable" ? "😀" : resolution === "mixed" ? "😐" : "🙁";

    // Determine animation class based on stage
    let animationClass = "opacity-0";
    let rotationStyle = {};

    switch (emojiAnimationStage) {
      case "rotating":
        animationClass = "opacity-100";
        rotationStyle = {
          animation: "rotate720 1.2s ease-in-out forwards",
          transformOrigin: "center center",
        };
        break;
      case "final":
        animationClass = "opacity-100";
        break;
      default:
        // Hidden state
        animationClass = "opacity-0";
        break;
    }

    // Render emoji with rotation animation
    return (
      <Tooltip content={tooltip} position="right">
        <div
          className={`text-2xl ${animationClass} inline-block`}
          style={{
            ...rotationStyle,
          }}
        >
          {emoji}
          <style>{`
            @keyframes rotate720 {
              from { transform: rotate(0deg); }
              to { transform: rotate(720deg); }
            }
          `}</style>
        </div>
      </Tooltip>
    );
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
              isHighlighted && showResults
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
        return "Balanced";
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
                transition: animatingMarker ? "none" : "left 0.3s ease-out",
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
            className={`flex-shrink-0 text-primary-500 hover:text-primary focus:outline-none ${
              showResults ? "opacity-100" : "opacity-0"
            } transition-opacity duration-300`}
            onClick={() => setExpanded(!expanded)}
            disabled={!showResults}
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
        {expanded && showResults && (
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
              <div className="flex items-baseline mr-8">
                <span className="font-semibold text-primary mr-1">Risk:</span>
                <span className="text-primary flex items-center">
                  <span>{getRiskDisplayText(riskType)}</span>
                  <InfoIcon tooltipText={formatRiskDistribution(riskType)} />
                </span>
              </div>

              {resourceType && resourceType !== "normal" && (
                <div className="flex items-baseline mr-8">
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
