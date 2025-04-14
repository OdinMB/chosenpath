import React from "react";
import { Icons, Input, PrimaryButton } from "@components/ui";
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

    const handleAddItem = () => {
      onChange([...arrayValues, ""]);
    };

    const handleUpdateItem = (index: number, newValue: string) => {
      const updatedArray = [...arrayValues];
      updatedArray[index] = newValue;
      onChange(updatedArray);
    };

    const handleDeleteItem = (index: number) => {
      const updatedArray = arrayValues.filter((_, i) => i !== index);
      onChange(updatedArray);
    };

    return (
      <div className={className}>
        <div className="flex justify-between items-center">
          {label && <span className="font-semibold flex-grow">{label}</span>}
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={handleAddItem}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        <div className="space-y-2 mt-2 ml-0">
          {arrayValues.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => handleUpdateItem(index, e.target.value)}
                placeholder={placeholder || `Item ${index + 1}`}
                className="flex-1"
              />
              <button
                onClick={() => handleDeleteItem(index)}
                className="text-tertiary hover:text-tertiary-700"
                aria-label={`Delete item ${index + 1}`}
              >
                <Icons.Trash className="h-4 w-4" />
              </button>
            </div>
          ))}
          {arrayValues.length === 0 && (
            <div className="text-gray-500 text-sm">No items added</div>
          )}
        </div>
      </div>
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
