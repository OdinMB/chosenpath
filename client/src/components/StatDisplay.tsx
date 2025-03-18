import { Tooltip } from "./ui/Tooltip";

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

  switch (type) {
    case "percentage":
      return (
        <div className="mb-2 relative w-full">
          <div className="relative h-8 bg-white rounded-lg border border-primary-100 shadow-sm overflow-hidden w-full">
            <div
              className="h-full bg-accent rounded-r-none"
              style={{ width: `${value}%` }}
            />
            <div className="absolute inset-0 px-2 flex items-center justify-between text-sm">
              <Tooltip
                content={tooltip}
                disabled={!tooltip}
                position="top"
                className="inline text-white font-medium"
              >
                {name}
              </Tooltip>
              <span className="text-primary-700 font-medium">{value}%</span>
            </div>
          </div>
        </div>
      );

    case "opposites":
      return (
        <div className="mb-2 relative w-full">
          <div className="relative h-8 bg-white rounded-lg border border-primary-100 shadow-sm overflow-hidden flex w-full">
            <div
              className="h-full bg-accent rounded-r-none"
              style={{ width: `${value}%` }}
            />
            <div
              className="h-full bg-secondary rounded-l-none"
              style={{ width: `${100 - Number(value)}%` }}
            />
            <div className="absolute inset-0 px-2 flex items-center justify-between text-sm">
              <Tooltip
                content={tooltip}
                disabled={!tooltip}
                position="top"
                className="inline text-white font-medium"
              >
                {stat1}
              </Tooltip>
              <span className="text-white font-medium">{value}%</span>
              <Tooltip
                content={tooltip}
                disabled={!tooltip}
                position="top"
                className="inline text-white font-medium"
              >
                {stat2}
              </Tooltip>
            </div>
          </div>
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center justify-between mb-2">
          <Tooltip content={tooltip} disabled={!tooltip} position="top">
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
          <Tooltip content={tooltip} disabled={!tooltip} position="top">
            <div className="mb-1 text-primary">{name}:</div>
          </Tooltip>
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
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-between mb-2">
          <Tooltip content={tooltip} disabled={!tooltip} position="top">
            <span className="text-primary">{name}</span>
          </Tooltip>
          <span className="bg-white text-primary px-3 py-1 rounded border border-primary-100 shadow-sm">
            {String(value)}
          </span>
        </div>
      );
  }
}
