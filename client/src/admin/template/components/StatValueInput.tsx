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
}

export const StatValueInput: React.FC<StatValueInputProps> = ({
  value,
  onChange,
  statType = "string",
  placeholder,
  className = "",
  label,
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
        buttonText="Add Item"
      />
    );
  }

  // For string value
  if (statType === "string") {
    if (label) {
      return (
        <div className="flex items-center gap-2">
          <span className="font-semibold flex-grow">{label}</span>
          <Input
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "Enter text value"}
            className="flex-1"
          />
        </div>
      );
    }

    return (
      <Input
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Enter text value"}
        className={className}
      />
    );
  }

  // For number, percentage, and opposites types
  if (label) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-semibold flex-grow">{label}</span>
        <Input
          type="number"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          min={0}
          max={100}
          placeholder={placeholder || "Enter a value from 0-100"}
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <Input
      type="number"
      value={value as number}
      onChange={(e) => onChange(Number(e.target.value))}
      min={0}
      max={100}
      placeholder={placeholder || "Enter a value from 0-100"}
      className={className}
    />
  );
};
