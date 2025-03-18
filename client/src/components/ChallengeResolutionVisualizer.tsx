import React, { useState } from "react";
import {
  ResolutionDetails,
  DEFAULT_DISTRIBUTION,
  SAFE_DISTRIBUTION,
  RISKY_DISTRIBUTION,
} from "../../../shared/types/beat";
import { Resolution } from "../../../shared/types/thread";
import { ChallengeOption } from "../../../shared/types/beat";

interface ChallengeResolutionVisualizerProps {
  resolutionDetails: ResolutionDetails;
  resolution: Resolution;
  option?: ChallengeOption;
}

export const ChallengeResolutionVisualizer: React.FC<
  ChallengeResolutionVisualizerProps
> = ({ resolutionDetails, resolution, option }) => {
  const [expanded, setExpanded] = useState(false);
  const { distribution, roll, points } = resolutionDetails;

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
    switch (resolution) {
      case "favorable":
        return (
          <div className="group relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-secondary"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
            </svg>
            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-max mb-1 px-2 py-1 bg-white rounded shadow-lg text-xs text-primary z-20 border border-primary-100 hidden group-hover:block">
              {getOutcomeDescription("favorable")}
            </span>
          </div>
        );
      case "mixed":
        return (
          <div className="group relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-max mb-1 px-2 py-1 bg-white rounded shadow-lg text-xs text-primary z-20 border border-primary-100 hidden group-hover:block">
              {getOutcomeDescription("mixed")}
            </span>
          </div>
        );
      case "unfavorable":
        return (
          <div className="group relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-primary-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
            </svg>
            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-max mb-1 px-2 py-1 bg-white rounded shadow-lg text-xs text-primary z-20 border border-primary-100 hidden group-hover:block">
              {getOutcomeDescription("unfavorable")}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  // Info tooltip for risk types
  const getRiskTypeInfo = (riskType?: string) => {
    switch (riskType) {
      case "normal":
        return (
          <div className="flex justify-center items-center px-2 w-full">
            <span className="flex space-x-4 text-base">
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👍</span>
                {DEFAULT_DISTRIBUTION.favorable}%
              </span>
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👉</span>
                {DEFAULT_DISTRIBUTION.mixed}%
              </span>
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👎</span>
                {DEFAULT_DISTRIBUTION.unfavorable}%
              </span>
            </span>
          </div>
        );
      case "safe":
        return (
          <div className="flex justify-center items-center px-4 py-1 w-full">
            <span className="flex space-x-6 text-base">
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👍</span>
                {SAFE_DISTRIBUTION.favorable}%
              </span>
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👉</span>
                {SAFE_DISTRIBUTION.mixed}%
              </span>
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👎</span>
                {SAFE_DISTRIBUTION.unfavorable}%
              </span>
            </span>
          </div>
        );
      case "risky":
        return (
          <div className="flex justify-center items-center px-4 py-1 w-full">
            <span className="flex space-x-6 text-base">
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👍</span>
                {RISKY_DISTRIBUTION.favorable}%
              </span>
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👉</span>
                {RISKY_DISTRIBUTION.mixed}%
              </span>
              <span className="whitespace-nowrap">
                <span className="text-xl mr-2">👎</span>
                {RISKY_DISTRIBUTION.unfavorable}%
              </span>
            </span>
          </div>
        );
      default:
        return "Unknown risk type";
    }
  };

  // Get resource type info
  const getResourceTypeInfo = (resourceType?: string) => {
    switch (resourceType) {
      case "sacrifice":
        return "You made things easier for yourself but had to pay for it.";
      case "reward":
        return "You made things harder for yourself and got rewarded.";
      default:
        return "Standard option with no special effects.";
    }
  };

  const InfoIcon = ({
    tooltipContent,
    width = "w-64",
  }: {
    tooltipContent: React.ReactNode;
    width?: string;
  }) => (
    <div
      className="group relative inline-block ml-1 align-top"
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
      <div
        className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block ${width} p-2 bg-white rounded shadow-lg text-primary z-20 border border-primary-100`}
      >
        {tooltipContent}
      </div>
    </div>
  );

  // Determine risk type (default to "unknown" if not specified)
  const riskType = option?.riskType || "unknown";
  const resourceType = option?.resourceType;

  return (
    <div className="challenge-resolution-visualizer p-4 bg-white rounded-lg border border-primary-100 shadow-md">
      <div className="flex flex-col space-y-3">
        <div className="flex items-center space-x-3">
          {/* Thumbs icon based on outcome */}
          <div className="flex-shrink-0">{getThumbsIcon()}</div>

          {/* Distribution bar - using distinct blocks */}
          <div className="relative flex-grow h-8 rounded-lg overflow-hidden shadow-inner flex">
            {/* Favorable segment */}
            {distribution.favorable > 0 && (
              <div
                className={`h-full ${getColor("favorable")} ${
                  resolution === "favorable"
                    ? "ring-1 ring-white border-r border-white"
                    : "border-r border-white border-opacity-50"
                } group cursor-pointer`}
                style={{ width: `${distribution.favorable}%` }}
              >
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block">
                  <div className="px-2 py-1 bg-white rounded shadow-lg text-xs text-primary border border-primary-100 whitespace-nowrap">
                    👍 {distribution.favorable}%
                  </div>
                </div>
              </div>
            )}

            {/* Mixed segment */}
            {distribution.mixed > 0 && (
              <div
                className={`h-full ${getColor("mixed")} ${
                  resolution === "mixed"
                    ? "ring-1 ring-white border-r border-white"
                    : "border-r border-white border-opacity-50"
                } group cursor-pointer`}
                style={{ width: `${distribution.mixed}%` }}
              >
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block">
                  <div className="px-2 py-1 bg-white rounded shadow-lg text-xs text-primary border border-primary-100 whitespace-nowrap">
                    👉 {distribution.mixed}%
                  </div>
                </div>
              </div>
            )}

            {/* Unfavorable segment */}
            {distribution.unfavorable > 0 && (
              <div
                className={`h-full ${getColor("unfavorable")} ${
                  resolution === "unfavorable" ? "ring-1 ring-white" : ""
                } group cursor-pointer`}
                style={{ width: `${distribution.unfavorable}%` }}
              >
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block">
                  <div className="px-2 py-1 bg-white rounded shadow-lg text-xs text-primary border border-primary-100 whitespace-nowrap">
                    👎 {distribution.unfavorable}%
                  </div>
                </div>
              </div>
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
                zIndex: 10,
              }}
            >
              {/* Top horizontal line of cursor */}
              <div
                className="absolute top-0 bg-black"
                style={{
                  width: "3px",
                  height: "1.5px",
                  left: "-0.75px",
                }}
              ></div>

              {/* Bottom horizontal line of cursor */}
              <div
                className="absolute bottom-0 bg-black"
                style={{
                  width: "3px",
                  height: "1.5px",
                  left: "-0.75px",
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
                <span className="font-semibold text-primary mr-1">Choice:</span>
                <span className="text-primary">{option.text}</span>
              </div>
            )}

            <div className="flex flex-wrap mb-2">
              <div className="flex items-baseline mr-10">
                <span className="font-semibold text-primary mr-1">Type:</span>
                <span className="text-primary flex items-center">
                  <span className="capitalize">{riskType}</span>
                  <InfoIcon
                    tooltipContent={getRiskTypeInfo(riskType)}
                    width="w-80"
                  />
                </span>
              </div>

              {resourceType && resourceType !== "normal" && (
                <div className="flex items-baseline">
                  <span className="font-semibold text-primary capitalize">
                    {resourceType}
                  </span>
                  <InfoIcon
                    tooltipContent={getResourceTypeInfo(resourceType)}
                  />
                </div>
              )}
            </div>

            <div className="flex items-baseline">
              <span className="font-semibold text-primary mr-1">Points:</span>
              <span className="text-primary">{points}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
