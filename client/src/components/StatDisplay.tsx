import { useState } from "react";

interface StatDisplayProps {
  name: string;
  value: number | boolean | string | string[];
  type:
    | "percentage"
    | "opposites"
    | "number"
    | "boolean"
    | "string"
    | "string[]";
  tooltip?: string;
}

export function StatDisplay({ name, value, type, tooltip }: StatDisplayProps) {
  const [stat1, stat2] = type === "opposites" ? name.split("|") : ["", ""];
  const [showTooltip, setShowTooltip] = useState(false);

  // Common tooltip component with buffer zone
  const tooltipElement =
    tooltip && showTooltip ? (
      <div className="absolute left-0 -top-12 z-50 bg-white text-primary text-xs p-2 rounded-md shadow-md border border-primary-100 w-full pointer-events-none">
        {tooltip}
      </div>
    ) : null;

  switch (type) {
    case "percentage":
      return (
        <div className="mb-2 relative">
          <div
            className="relative h-8 bg-white rounded-lg border border-primary-100 shadow-sm overflow-hidden"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div
              className="h-full bg-accent rounded-r-none"
              style={{ width: `${value}%` }}
            />
            <div className="absolute inset-0 px-2 flex items-center justify-between text-sm">
              <span className="text-white font-medium">{name}</span>
              <span className="text-primary-700 font-medium">{value}%</span>
            </div>
          </div>
          {tooltipElement}
        </div>
      );

    case "opposites":
      return (
        <div className="mb-2 relative">
          <div
            className="relative h-8 bg-white rounded-lg border border-primary-100 shadow-sm overflow-hidden flex"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div
              className="h-full bg-accent rounded-r-none"
              style={{ width: `${value}%` }}
            />
            <div
              className="h-full bg-secondary rounded-l-none"
              style={{ width: `${100 - Number(value)}%` }}
            />
            <div className="absolute inset-0 px-2 flex items-center justify-between text-sm">
              <span className="text-white font-medium">{stat1}</span>
              <span className="text-white font-medium">{value}%</span>
              <span className="text-white font-medium">{stat2}</span>
            </div>
          </div>
          {tooltipElement}
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center justify-between mb-2 relative">
          <span
            className="text-primary"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {name}
          </span>
          <span className="bg-white text-primary px-3 py-1 rounded border border-primary-100 shadow-sm">
            {value ? "Yes" : "No"}
          </span>
          {tooltipElement}
        </div>
      );

    case "string[]":
      return (
        <div className="mb-2 relative">
          <div
            className="mb-1 text-primary"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {name}:
          </div>
          {(value as string[]).length === 0 ? (
            <span className="text-primary-500">None</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(value as string[]).map((item, index) => (
                <span
                  key={index}
                  className="bg-white text-primary px-3 py-1 rounded border border-primary-100 shadow-sm text-base font-medium"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {tooltipElement}
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-between mb-2 relative">
          <span
            className="text-primary"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {name}
          </span>
          <span className="bg-white text-primary px-3 py-1 rounded border border-primary-100 shadow-sm">
            {String(value)}
          </span>
          {tooltipElement}
        </div>
      );
  }
}
