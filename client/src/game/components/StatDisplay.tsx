import { Tooltip } from "components/ui";

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

  // Add safety check for string array type
  const safeStringArray = Array.isArray(value) ? value : [];

  switch (type) {
    case "percentage": {
      const percentValue = Number(value);

      return (
        <div className="mb-2 relative w-full">
          <div className="relative h-8 bg-white rounded-lg border border-primary-100 shadow-sm overflow-hidden w-full">
            <div
              className="h-full bg-accent-300 rounded-r-none"
              style={{ width: `${percentValue}%` }}
            />
            <div className="absolute inset-0 px-2 flex items-center justify-between text-sm">
              <Tooltip
                content={tooltip}
                disabled={!tooltip}
                position="top"
                className="inline font-medium text-primary-800"
                contentClassName="max-w-[250px]"
              >
                {name}
              </Tooltip>
              <span className="font-medium px-1.5 py-0.5 rounded bg-white/90 shadow-sm text-primary-800">
                {value}%
              </span>
            </div>
          </div>
        </div>
      );
    }

    case "opposites": {
      const leftValuePercent = Number(value);
      const rightValuePercent = 100 - leftValuePercent;

      return (
        <div className="mb-2 relative w-full">
          <div className="relative h-8 bg-white rounded-lg border border-primary-100 shadow-sm overflow-hidden flex w-full">
            <div
              className="h-full bg-accent-300 rounded-r-none"
              style={{ width: `${leftValuePercent}%` }}
            />
            <div
              className="h-full bg-secondary-300 rounded-l-none"
              style={{ width: `${rightValuePercent}%` }}
            />
            <div className="absolute inset-0 px-2 flex items-center justify-between text-sm">
              <Tooltip
                content={tooltip}
                disabled={!tooltip}
                position="top"
                className="inline font-medium text-primary-800"
                contentClassName="max-w-[250px]"
              >
                {stat1}
              </Tooltip>
              <span className="font-medium px-1.5 py-0.5 rounded bg-white/90 shadow-sm text-primary-800">
                {value}%
              </span>
              <Tooltip
                content={tooltip}
                disabled={!tooltip}
                position="top"
                className="inline font-medium text-primary-800"
                contentClassName="max-w-[250px]"
              >
                {stat2}
              </Tooltip>
            </div>
          </div>
        </div>
      );
    }

    case "boolean":
      return (
        <div className="flex items-center justify-between mb-2">
          <Tooltip
            content={tooltip}
            disabled={!tooltip}
            position="top"
            contentClassName="max-w-[250px]"
          >
            <span className="text-primary">{name}</span>
          </Tooltip>
          <span className="bg-white text-primary px-3 py-1 rounded border border-primary-100 shadow-sm">
            {value ? "Yes" : "No"}
          </span>
        </div>
      );

    case "string[]":
      return (
        <div className="mb-2">
          <Tooltip
            content={tooltip}
            disabled={!tooltip}
            position="top"
            contentClassName="max-w-[250px]"
          >
            <div className="mb-1 text-primary">{name}:</div>
          </Tooltip>
          {!Array.isArray(value) || safeStringArray.length === 0 ? (
            <span className="text-primary-500 ml-2">None</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {safeStringArray.map((item, index) => (
                <span
                  key={index}
                  className="bg-white text-primary px-3 py-1 rounded border border-primary-100 shadow-sm text-base font-medium"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-between mb-2">
          <Tooltip
            content={tooltip}
            disabled={!tooltip}
            position="top"
            contentClassName="max-w-[250px]"
          >
            <span className="text-primary">{name}</span>
          </Tooltip>
          <span className="bg-white text-primary px-3 py-1 rounded border border-primary-100 shadow-sm">
            {String(value)}
          </span>
        </div>
      );
  }
}
