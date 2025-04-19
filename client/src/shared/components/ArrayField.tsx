import React from "react";
import { Icons, Input, PrimaryButton, InfoIcon } from "@components/ui";
import { useArrayField } from "../hooks/useArrayField";

export interface ArrayFieldProps {
  title?: string;
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
}) => {
  const { items, handleAddItem, handleUpdateItem, handleRemoveItem } =
    useArrayField({
      initialItems,
      onChange,
      readOnly,
    });

  const fieldId = title
    ? title.toLowerCase().replace(/\s+/g, "-")
    : "array-field";

  return (
    <div className={className}>
      {(title || label) && (
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center">
            {showLabel && <h3 className="font-semibold">{title || label}</h3>}
            {tooltipText && (
              <InfoIcon
                tooltipText={tooltipText}
                position="right"
                className="ml-2 mt-1"
              />
            )}
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
        <Input
          id={`new-${fieldId}`}
          name={`new-${fieldId}`}
          placeholder={emptyPlaceholder}
          disabled
          className={inputClassName}
        />
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
                aria-label={`Remove ${title ? title.toLowerCase() : "item"} ${
                  index + 1
                }`}
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
