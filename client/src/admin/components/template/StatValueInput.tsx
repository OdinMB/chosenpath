import React from "react";
import { Input } from "@components/ui/Input";
import { Stat } from "@core/types/stat";

interface StatValueInputProps {
  value: string | number | string[];
  onChange: (value: string | number | string[]) => void;
  statType: Stat["type"];
  placeholder?: string;
  className?: string;
}

export const StatValueInput: React.FC<StatValueInputProps> = ({
  value,
  onChange,
  statType,
  placeholder,
  className = "",
}) => {
  // Convert value to string[] if needed
  const ensureArray = (val: string | number | string[]): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === "number") return [];
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  if (statType === "string[]") {
    const arrayValue = ensureArray(value);
    return (
      <Input
        type="text"
        value={arrayValue.join(", ")}
        onChange={(e) => {
          const inputValue = e.target.value;
          // Allow empty string to clear the input
          const values =
            inputValue === "" ? [] : inputValue.split(",").map((s) => s.trim());
          onChange(values);
        }}
        placeholder={placeholder || "Enter comma-separated values"}
        className={className}
      />
    );
  }

  if (statType === "string") {
    return (
      <Input
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  // For number, percentage, and opposites types
  return (
    <Input
      type="number"
      value={value as number}
      onChange={(e) => onChange(Number(e.target.value))}
      min={0}
      max={100}
      placeholder={placeholder}
      className={className}
    />
  );
};
