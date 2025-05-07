import React, { useState, useEffect } from "react";
import { ResolutionDetails, Resolution } from "core/types";
import { Tooltip, InfoIcon, ColoredBox, Icons } from "components/ui";
import { useEmojiAnimation } from "game/hooks/useEmojiAnimation";
import { useMarkerAnimation } from "game/hooks/useMarkerAnimation";
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

  // Expanded state management (previously in useExpandCollapse)
  const [expanded, setExpanded] = useState(forceExpanded);

  // Update expanded state when forceExpanded prop changes
  useEffect(() => {
    setExpanded(forceExpanded);
  }, [forceExpanded]);

  // Set animation completion handler
  useEffect(() => {
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
      }, 6000); // Match animation duration

      return () => clearTimeout(timeoutId);
    }
  }, [animateRoll, isChallenge, forceExpanded]);

  // Use custom hooks to manage state and animations
  const { isAnimating, showEmoji, currentEmoji } = useEmojiAnimation({
    animateRoll,
    resolution,
    isChallenge,
    forceExpanded,
  });

  const { animatingMarker, currentMarkerPosition } = useMarkerAnimation({
    animateRoll,
    resolutionDetails,
    isChallenge,
  });

  const {
    formatRiskDistribution,
    getResourceTypeInfo,
    getColor,
    getRiskDisplayText,
  } = useChoiceFormatting();

  // Get emoji based on resolution or exploration
  const getIconContent = () => {
    if (!isChallenge) {
      // Exploration beat - show fork in the road icon
      return (
        <Tooltip content="You chose a path" position="right">
          <div className="text-lg text-primary">
            <Icons.Fork className="w-10 h-10" />
          </div>
        </Tooltip>
      );
    }

    // For challenge beats
    if (!resolution) {
      return <div className="w-8 h-8"></div>;
    }

    // If animating, show the current emoji in the animation sequence (without tooltip)
    if (isAnimating) {
      return <div className="text-3xl">{currentEmoji}</div>;
    }

    // Show emoji after animation completes with tooltip
    if (showEmoji) {
      const tooltip =
        resolution === "favorable"
          ? "Things go well"
          : resolution === "mixed"
          ? "Results are mixed"
          : "Things don't go as planned";

      return (
        <Tooltip content={tooltip} position="right">
          <div className="text-3xl animate-fadeIn">{currentEmoji}</div>
        </Tooltip>
      );
    }

    // Fallback
    return <div className="w-8 h-8"></div>;
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
    if (!resolutionDetails?.points) {
      return "No points awarded";
    }

    return (
      <div className="text-left w-full">
        <div className="space-y-2">
          {resolutionDetails.readablePointModifiers?.map(
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
          ) || (
            <div className="flex justify-between text-sm">
              <span className="mr-3">Base points</span>
              <span
                className={
                  resolutionDetails.points >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                }
              >
                {resolutionDetails.points > 0
                  ? `+${resolutionDetails.points}`
                  : resolutionDetails.points}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

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
                        isLast={
                          resolutionDetails.distribution.unfavorable === 0
                        }
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
                          left: `${
                            animatingMarker
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
                          transition: animatingMarker
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

                  {/* Info row with Risk, Resource Type, and Points */}
                  <div className="flex items-center gap-2 md:gap-6 flex-wrap text-sm">
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
                            {resolutionDetails.points >= 0 ? "Bonus" : "Malus"}:
                          </span>
                          <span className="text-primary ml-1">
                            {resolutionDetails.points}
                          </span>
                          <InfoIcon
                            className="ml-1 mt-1"
                            tooltipText={formatPointBreakdown()}
                            contentClassName="max-w-[400px]"
                          />
                        </div>
                      )
                    )}

                    {/* Only show points in third column if resource type exists */}
                    {choice.resourceType &&
                      choice.resourceType !== "normal" &&
                      resolutionDetails?.points !== undefined && (
                        <div className="inline-flex items-center">
                          <span className="font-semibold text-primary">
                            {resolutionDetails.points >= 0 ? "Bonus" : "Malus"}:
                          </span>
                          <span className="text-primary ml-1">
                            {resolutionDetails.points}
                          </span>
                          <InfoIcon
                            className="ml-1 mt-1"
                            tooltipText={formatPointBreakdown()}
                            contentClassName="max-w-[400px]"
                          />
                        </div>
                      )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          // Collapsed view with icon and expand button
          <>
            <div className="flex-shrink-0 flex items-center justify-center w-12 h-12">
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
