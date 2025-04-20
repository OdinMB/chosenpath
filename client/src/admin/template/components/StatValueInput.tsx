import React from "react";
import { Input } from "@components/ui";
import { ArrayField } from "@components";
import { Stat } from "@core/types";

interface StatValueInputProps {
  value: string | number | string[];
  onChange: (value: string | number | string[]) => void;
  statType?: Stat["type"];
  placeholder?: string;
  className?: string;
  label?: string;
  disabled?: boolean;
}

export const StatValueInput: React.FC<StatValueInputProps> = ({
  value,
  onChange,
  statType = "string",
  placeholder,
  className = "",
  label,
  disabled = false,
}) => {
  // For string arrays
  if (statType === "string[]") {
    const arrayValues = Array.isArray(value) ? value : [];

    return (
      <ArrayField
        label={label}
        items={arrayValues}
        onChange={onChange}
        placeholder={placeholder || "Enter a value"}
        emptyPlaceholder="No items added"
        className={className}
        readOnly={disabled}
      />
    );
  }

  // For string value
  if (statType === "string") {
    if (label) {
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          <span className="font-semibold w-24">{label}</span>
          <Input
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "Enter text value"}
            className="flex-1"
            disabled={disabled}
          />
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="font-semibold w-24">{label}</span>
        <Input
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Enter text value"}
          className="flex-1"
          disabled={disabled}
        />
      </div>
    );
  }

  // For number, percentage, and opposites types
  if (label) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="font-semibold w-24">{label}</span>
        <Input
          type="number"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          min={0}
          max={100}
          placeholder={placeholder || "Enter a value from 0-100"}
          className="w-24"
          disabled={disabled}
        />
        {statType === "percentage" && <span className="ml-1">%</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-semibold w-24">{label}</span>
      <Input
        type="number"
        value={value as number}
        onChange={(e) => onChange(Number(e.target.value))}
        min={0}
        max={100}
        placeholder={placeholder || "Enter a value from 0-100"}
        className="w-24"
        disabled={disabled}
      />
      {statType === "percentage" && <span className="ml-1">%</span>}
    </div>
  );
};
