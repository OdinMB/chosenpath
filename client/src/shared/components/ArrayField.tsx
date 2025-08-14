import React, { useState } from "react";
import { Icons, Input, PrimaryButton, InfoIcon } from "components/ui";

export interface ArrayFieldProps {
  title?: string | React.ReactNode;
  tooltipText?: string;
  items: string[];
  onChange?: (items: string[]) => void;
  placeholder?: string;
  emptyPlaceholder?: string;
  buttonText?: string;
  className?: string;
  inputClassName?: string;
  label?: string;
  showLabel?: boolean;
  inline?: boolean;
  readOnly?: boolean;
  extraHeaderContent?: React.ReactNode;
}

export const ArrayField: React.FC<ArrayFieldProps> = ({
  title,
  tooltipText,
  items: initialItems,
  onChange,
  placeholder = "Add an item",
  emptyPlaceholder = "Click + to add items",
  buttonText = "",
  className = "",
  inputClassName = "",
  label,
  showLabel = true,
  inline = false,
  readOnly = false,
  extraHeaderContent,
}) => {
  const [items, setItems] = useState<string[]>(initialItems);

  const handleAddItem = () => {
    if (readOnly) return;

    const updatedItems = [...items, ""];
    setItems(updatedItems);
    onChange?.(updatedItems);
  };

  const handleUpdateItem = (index: number, value: string) => {
    if (readOnly) return;

    const updatedItems = [...items];
    updatedItems[index] = value;
    setItems(updatedItems);
    onChange?.(updatedItems);
  };

  const handleRemoveItem = (index: number) => {
    if (readOnly) return;

    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
    onChange?.(updatedItems);
  };

  const fieldId =
    title && typeof title === "string"
      ? title.toLowerCase().replace(/\s+/g, "-")
      : "array-field";

  return (
    <div className={className}>
      {(title || label) && (
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            {showLabel && <h3 className="font-semibold">{title || label}</h3>}
            {tooltipText && (
              <InfoIcon
                tooltipText={tooltipText}
                position="right"
                className="ml-2"
              />
            )}
            {extraHeaderContent}
          </div>
          {!readOnly && (
            <PrimaryButton
              variant="outline"
              leftBorder={false}
              size="sm"
              onClick={handleAddItem}
              leftIcon={<Icons.Plus className="h-4 w-4" />}
            >
              {buttonText}
            </PrimaryButton>
          )}
        </div>
      )}

      {!title && !label && !readOnly && (
        <div className="flex justify-end mb-1">
          <PrimaryButton
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={handleAddItem}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            {buttonText}
          </PrimaryButton>
        </div>
      )}

      {items.length === 0 ? (
        <span className="text-tertiary-500">{emptyPlaceholder}</span>
      ) : (
        items.map((item, index) => (
          <div
            key={index}
            className={`${inline ? "inline-flex" : "flex"} gap-2 mb-2`}
          >
            <Input
              id={`${fieldId}-${index}`}
              name={`${fieldId}-${index}`}
              className={`flex-1 ${inputClassName}`}
              value={item}
              onChange={(e) => handleUpdateItem(index, e.target.value)}
              placeholder={placeholder}
              disabled={readOnly}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => handleRemoveItem(index)}
                className="text-tertiary hover:text-tertiary-700"
                aria-label={`Remove ${
                  typeof title === "string" ? title.toLowerCase() : "item"
                } ${index + 1}`}
              >
                <Icons.Trash className="h-4 w-4" />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};
