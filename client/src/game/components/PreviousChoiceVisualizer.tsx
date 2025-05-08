import React, { useState, useEffect, useRef } from "react";
import { ResolutionDetails, Resolution } from "core/types";
import { Tooltip, InfoIcon, ColoredBox, Icons } from "components/ui";
import { usePreviousChoiceVisualizer } from "game/hooks/usePreviousChoiceVisualizer";
import { useChoiceFormatting } from "game/hooks/useChoiceFormatting";

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
  forceExpanded?: boolean;
}

export const PreviousChoiceVisualizer: React.FC<
  PreviousChoiceVisualizerProps
> = ({
  choice,
  resolution,
  resolutionDetails,
  animateRoll = false,
  forceExpanded = false,
}) => {
  const isChallenge = choice.optionType === "challenge";

  // Expanded state management
  const [expanded, setExpanded] = useState(forceExpanded);

  // Track previous props to prevent unnecessary re-renders
  const prevForceExpandedRef = useRef(forceExpanded);
  const prevAnimateRollRef = useRef(animateRoll);
  const prevIsChallengeRef = useRef(isChallenge);
  const timeoutSetRef = useRef(false);

  // Update expanded state when forceExpanded prop changes
  useEffect(() => {
    if (prevForceExpandedRef.current !== forceExpanded) {
      prevForceExpandedRef.current = forceExpanded;
      setExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  // Set animation completion handler
  useEffect(() => {
    // Only act if there's an actual change in the props
    const animateRollChanged = prevAnimateRollRef.current !== animateRoll;
    const isChallengeChanged = prevIsChallengeRef.current !== isChallenge;

    if (animateRollChanged || isChallengeChanged || !timeoutSetRef.current) {
      // Update our refs
      prevAnimateRollRef.current = animateRoll;
      prevIsChallengeRef.current = isChallenge;

      // Clear any existing timeout
      if (timeoutSetRef.current) {
        timeoutSetRef.current = false;
      }

      if (animateRoll && isChallenge) {
        // Ensure expanded state during animation if forceExpanded is true
        if (forceExpanded) {
          setExpanded(true);
        }

        // Set a timeout to collapse after animation if not forceExpanded
        const timeoutId = setTimeout(() => {
          if (!forceExpanded) {
            setExpanded(false);
          }
          timeoutSetRef.current = false;
        }, 7500); // Match total animation duration (4000 + 3500)

        timeoutSetRef.current = true;
        return () => clearTimeout(timeoutId);
      }
    }
  }, [animateRoll, isChallenge, forceExpanded]);

  // Use the unified animation hook
  const {
    isEmojiAnimating,
    showEmoji,
    currentEmoji,
    isMarkerAnimating,
    currentMarkerPosition,
    visibleModifiers,
    isModifierAnimating,
    currentPoints,
    isPointsTransitioning,
    isPointsComplete,
    animationPhase,
    currentDistribution,
    // Unused but kept for debugging
    // isDistributionAnimating,
  } = usePreviousChoiceVisualizer({
    animateRoll,
    resolution,
    resolutionDetails,
    isChallenge,
    choice,
  });

  // Track previous animation phase for logging
  const prevAnimationPhaseRef = useRef(animationPhase);

  // Log animation phase changes to console
  useEffect(() => {
    if (
      animateRoll &&
      isChallenge &&
      prevAnimationPhaseRef.current !== animationPhase
    ) {
      console.log(`Animation phase: ${animationPhase}`);
      prevAnimationPhaseRef.current = animationPhase;
    }
  }, [animationPhase, animateRoll, isChallenge]);

  const {
    formatRiskDistribution,
    getResourceTypeInfo,
    getColor,
    getRiskDisplayText,
  } = useChoiceFormatting();

  // Get emoji based on resolution or exploration
  const getIconContent = () => {
    // Create a consistent container size for all states
    const emojiContainer = (content: React.ReactNode) => (
      <div className="w-12 h-12 flex items-center justify-center">
        {content}
      </div>
    );

    if (!isChallenge) {
      // Exploration beat - show fork in the road icon
      return emojiContainer(
        <Tooltip content="You chose a path" position="right">
          <div className="text-lg text-primary">
            <Icons.Fork className="w-10 h-10" />
          </div>
        </Tooltip>
      );
    }

    // For challenge beats
    if (!resolution) {
      return emojiContainer(null);
    }

    // If in modifiers phase, show empty container
    if (animationPhase === "modifiers") {
      return emojiContainer(null);
    }

    // If animating, show the current emoji in the animation sequence (without tooltip)
    if (isEmojiAnimating) {
      return emojiContainer(<div className="text-3xl">{currentEmoji}</div>);
    }

    // Show emoji after animation completes with tooltip
    if (showEmoji) {
      const tooltip =
        resolution === "favorable"
          ? "Things go well"
          : resolution === "mixed"
          ? "Results are mixed"
          : "Things don't go as planned";

      return emojiContainer(
        <Tooltip content={tooltip} position="right">
          <div className="text-3xl animate-fadeIn">{currentEmoji}</div>
        </Tooltip>
      );
    }

    // Fallback
    return emojiContainer(null);
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
        style={{
          width: `${safeWidth}%`,
          minWidth: width > 0 ? "4px" : "0",
          transition: "width 400ms ease-out",
        }}
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

  // Animated points value with color
  const renderPointsValue = (value: number) => {
    const isPositive = value >= 0;
    return (
      <span
        className="ml-1 relative flex items-center justify-end"
        style={{
          width: "36px", // Fixed width to prevent layout shifts
          height: "24px", // Fixed height
        }}
      >
        <span
          className={`
            absolute right-0
            transition-all duration-500 
            ${isPositive ? "text-emerald-600" : "text-red-600"}
            ${isPointsTransitioning || isPointsComplete ? "font-bold" : ""}
            ${isPointsTransitioning ? "text-lg" : ""}
          `}
          style={{
            transformOrigin: "right center",
            transform: isPointsTransitioning ? "scale(1.1)" : "scale(1)",
            transition: "all 0.5s ease-in-out",
          }}
        >
          {value > 0 ? `+${value}` : value}
        </span>
      </span>
    );
  };

  // Render a modifier tag for the animation
  const renderModifierTag = (name: string, value: number) => (
    <div
      className={`
        inline-flex items-center px-2 py-1 mr-2 mb-1 rounded text-sm
        bg-white border shadow-sm animate-fadeIn transition-all duration-300
        ${
          value >= 0
            ? "text-emerald-800 border-emerald-200"
            : "text-red-800 border-red-200"
        }
      `}
    >
      <span className="mr-1.5 font-medium">{name}</span>
      <span
        className={`font-bold ${
          value >= 0 ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {value >= 0 ? `+${value}` : value}
      </span>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto mb-4 flex justify-center">
      <ColoredBox
        colorType="tertiary"
        className={`
          relative
          ${
            expanded
              ? "p-4 w-full"
              : "p-2 px-3 inline-flex items-center justify-between min-w-[100px]"
          }
          ${!expanded && "cursor-pointer hover:shadow-lg"}
        `}
        onClick={!expanded ? () => setExpanded(true) : undefined}
      >
        {expanded ? (
          // Expanded layout
          <>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                {/* Icon on the left - either path icon or emoji */}
                <div className="flex-shrink-0">{getIconContent()}</div>

                {/* Choice text */}
                <span className="text-primary">{choice.text}</span>
              </div>

              {/* Expand/collapse button - vertically centered */}
              <button
                className="flex-shrink-0 text-primary-500 hover:text-primary focus:outline-none ml-2 self-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
                aria-label="Collapse details"
              >
                <Icons.ChevronUp className="w-5 h-5" />
              </button>
            </div>

            {/* Expanded view for challenge resolution */}
            {isChallenge && resolutionDetails && resolution && (
              <div className="mt-3">
                <div className="max-w-md mx-auto">
                  {/* Distribution bar - always visible */}
                  <div className="relative h-5 rounded-lg overflow-hidden shadow-inner flex z-0 w-full mb-2">
                    {/* Favorable segment */}
                    {currentDistribution.favorable > 0 && (
                      <BarSegment
                        width={currentDistribution.favorable}
                        color={getColor("favorable")}
                        isHighlighted={resolution === "favorable"}
                        isLast={
                          currentDistribution.mixed === 0 &&
                          currentDistribution.unfavorable === 0
                        }
                        tooltipText={`${currentDistribution.favorable}%`}
                        emojiIcon="😀"
                      />
                    )}

                    {/* Mixed segment */}
                    {currentDistribution.mixed > 0 && (
                      <BarSegment
                        width={currentDistribution.mixed}
                        color={getColor("mixed")}
                        isHighlighted={resolution === "mixed"}
                        isLast={currentDistribution.unfavorable === 0}
                        tooltipText={`${currentDistribution.mixed}%`}
                        emojiIcon="😐"
                      />
                    )}

                    {/* Unfavorable segment */}
                    {currentDistribution.unfavorable > 0 && (
                      <BarSegment
                        width={currentDistribution.unfavorable}
                        color={getColor("unfavorable")}
                        isHighlighted={resolution === "unfavorable"}
                        isLast={true}
                        tooltipText={`${currentDistribution.unfavorable}%`}
                        emojiIcon="🙁"
                      />
                    )}

                    {/* Cursor for roll position - hide during modifiers phase */}
                    {resolutionDetails.roll !== undefined &&
                      animationPhase !== "modifiers" && (
                        <div
                          className="absolute"
                          style={{
                            left: `${
                              isMarkerAnimating
                                ? currentMarkerPosition
                                : resolutionDetails.roll
                            }%`,
                            height: "calc(100% + 8px)",
                            top: "-4px", // Extend 4px above
                            width: "1.5px",
                            backgroundColor: "black",
                            transform: "translateX(-0.75px)",
                            zIndex: 5,
                            pointerEvents: "none",
                            transition: isMarkerAnimating
                              ? "none"
                              : "left 0.3s ease-out",
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

                  {/* Info row with Risk, Resource Type, and Points - always visible */}
                  <div className="flex items-center gap-2 md:gap-6 flex-wrap text-sm mb-3">
                    <div className="inline-flex items-center">
                      <span className="font-semibold text-primary">Risk:</span>
                      <span className="text-primary ml-1">
                        {getRiskDisplayText(choice.riskType)}
                      </span>
                      <InfoIcon
                        className="ml-1 mt-1"
                        tooltipText={formatRiskDistribution(choice.riskType)}
                      />
                    </div>

                    {choice.resourceType && choice.resourceType !== "normal" ? (
                      <div className="inline-flex items-center">
                        <span className="font-semibold text-primary capitalize">
                          {choice.resourceType}
                        </span>
                        <InfoIcon
                          className="ml-1 mt-1"
                          tooltipText={getResourceTypeInfo(choice.resourceType)}
                        />
                      </div>
                    ) : (
                      resolutionDetails?.points !== undefined && (
                        <div className="inline-flex items-center">
                          <span className="font-semibold text-primary">
                            {currentPoints >= 0 ? "Bonus" : "Malus"}:
                          </span>
                          {renderPointsValue(currentPoints)}
                          {/* InfoIcon hidden as requested */}
                        </div>
                      )
                    )}

                    {/* Only show points in third column if resource type exists */}
                    {choice.resourceType &&
                      choice.resourceType !== "normal" &&
                      resolutionDetails?.points !== undefined && (
                        <div className="inline-flex items-center">
                          <span className="font-semibold text-primary">
                            {currentPoints >= 0 ? "Bonus" : "Malus"}:
                          </span>
                          {renderPointsValue(currentPoints)}
                          {/* InfoIcon hidden as requested */}
                        </div>
                      )}
                  </div>
                </div>

                {/* Animated modifier tags */}
                {(isModifierAnimating || visibleModifiers.length > 0) && (
                  <div className="flex flex-wrap mt-2 mb-0">
                    {/* Add the same container used for emoji to ensure alignment */}
                    <div className="hidden md:block w-14 items-center justify-center"></div>
                    <div className="flex flex-wrap">
                      {visibleModifiers.map(([name, value], index) => (
                        <React.Fragment key={index}>
                          {renderModifierTag(name, value)}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          // Collapsed view with icon and expand button
          <>
            <div className="flex-shrink-0 flex items-center justify-center">
              {getIconContent()}
            </div>

            {/* Always show expand button in collapsed view */}
            <button
              className="flex-shrink-0 text-primary-500 hover:text-primary focus:outline-none ml-2 flex items-center"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              aria-label="Expand details"
            >
              <Icons.ChevronDown className="w-5 h-5" />
            </button>
          </>
        )}
      </ColoredBox>
    </div>
  );
};
