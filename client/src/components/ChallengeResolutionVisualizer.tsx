import React, { useState } from "react";
import type { ResolutionDetails } from "../../../shared/types/beat";
import type { Resolution } from "../../../shared/types/thread";

interface ChallengeResolutionVisualizerProps {
  resolutionDetails: ResolutionDetails;
  resolution: Resolution;
}

export const ChallengeResolutionVisualizer: React.FC<
  ChallengeResolutionVisualizerProps
> = ({ resolutionDetails, resolution }) => {
  const [expanded, setExpanded] = useState(false);
  const { distribution, roll, points } = resolutionDetails;

  // Calculate the position for the marker
  const markerPosition = roll != null ? roll : 50;

  // Get color for an outcome type
  const getColor = (outcome: string): string => {
    switch (outcome) {
      case "favorable":
        return "bg-green-500";
      case "mixed":
        return "bg-yellow-500";
      case "unfavorable":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // Get display text for an outcome
  const getText = (outcome: string): string => {
    switch (outcome) {
      case "favorable":
        return "Favorable";
      case "mixed":
        return "Mixed";
      case "unfavorable":
        return "Unfavorable";
      case "sideAWins":
        return "Side A Wins";
      case "sideBWins":
        return "Side B Wins";
      case "resolution1":
      case "resolution2":
      case "resolution3":
        return `Resolution ${outcome.slice(-1)}`;
      default:
        return "Unknown";
    }
  };

  return (
    <div className="challenge-resolution-visualizer p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="flex flex-col space-y-2">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <h3 className="text-lg font-semibold">
            Challenge Outcome:{" "}
            <span
              className={`font-bold ${
                resolution === "favorable"
                  ? "text-green-600"
                  : resolution === "mixed"
                  ? "text-yellow-600"
                  : "text-red-600"
              }`}
            >
              {getText(resolution as string)}
            </span>
          </h3>
          <button className="text-gray-500 hover:text-gray-700">
            {expanded ? "▲" : "▼"}
          </button>
        </div>

        {/* Distribution bar */}
        <div className="relative h-10 rounded-lg overflow-hidden flex">
          {/* Favorable segment */}
          <div
            className={`h-full ${getColor("favorable")} ${
              resolution === "favorable" ? "ring-2 ring-blue-500" : ""
            }`}
            style={{ width: `${distribution.favorable}%` }}
          ></div>

          {/* Mixed segment */}
          <div
            className={`h-full ${getColor("mixed")} ${
              resolution === "mixed" ? "ring-2 ring-blue-500" : ""
            }`}
            style={{ width: `${distribution.mixed}%` }}
          ></div>

          {/* Unfavorable segment */}
          <div
            className={`h-full ${getColor("unfavorable")} ${
              resolution === "unfavorable" ? "ring-2 ring-blue-500" : ""
            }`}
            style={{ width: `${distribution.unfavorable}%` }}
          ></div>

          {/* Marker for the roll */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white border-l border-r border-gray-800"
            style={{ left: `${markerPosition}%` }}
          ></div>
        </div>

        {/* Labels */}
        <div className="flex justify-between text-xs text-gray-600">
          <div>Favorable ({distribution.favorable}%)</div>
          <div>Mixed ({distribution.mixed}%)</div>
          <div>Unfavorable ({distribution.unfavorable}%)</div>
        </div>

        {/* Extended information */}
        {expanded && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="font-semibold">Roll value:</div>
              <div>{roll ? roll.toFixed(1) : "N/A"}</div>

              <div className="font-semibold">Points:</div>
              <div>{points}</div>

              <div className="font-semibold">Status:</div>
              <div
                className={
                  resolution === "favorable"
                    ? "text-green-600"
                    : resolution === "mixed"
                    ? "text-yellow-600"
                    : "text-red-600"
                }
              >
                {getText(resolution as string)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
