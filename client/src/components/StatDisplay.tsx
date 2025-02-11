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
}

export function StatDisplay({ name, value, type }: StatDisplayProps) {
  const [stat1, stat2] = type === "opposites" ? name.split("|") : ["", ""];

  switch (type) {
    case "percentage":
      return (
        <div className="relative h-8 bg-gray-200 rounded mb-3">
          <div
            className="h-full bg-blue-500 rounded"
            style={{ width: `${value}%` }}
          />
          <div className="absolute inset-0 px-2 flex items-center justify-between text-sm">
            <span className="text-white">
              {name} ({value}%)
            </span>
          </div>
        </div>
      );

    case "opposites":
      return (
        <div className="relative h-8 bg-gray-200 rounded flex mb-3">
          <div
            className="h-full bg-blue-500 rounded-l"
            style={{ width: `${value}%` }}
          />
          <div
            className="h-full bg-red-500 rounded-r"
            style={{ width: `${100 - Number(value)}%` }}
          />
          <div className="absolute inset-0 px-2 flex items-center justify-between text-sm">
            <span className="text-white">
              {stat1} ({value}%)
            </span>
            <span className="text-white">
              {stat2} ({100 - Number(value)}%)
            </span>
          </div>
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center justify-between mb-3 bg-gray-200 rounded px-2 h-8">
          <span>{name}</span>
          <span className={value ? "text-green-600" : "text-red-600"}>
            {value ? "Yes" : "No"}
          </span>
        </div>
      );

    case "string[]":
      return (
        <div className="flex flex-wrap gap-1 mb-3 bg-gray-200 rounded px-2 py-1">
          {(value as string[]).map((item) => (
            <span
              key={item}
              className="px-2 py-0.5 bg-gray-100 rounded-full text-sm"
            >
              {item}
            </span>
          ))}
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-between mb-3 bg-gray-200 rounded px-2 h-8">
          <span>{name}</span>
          <span>{String(value)}</span>
        </div>
      );
  }
}
