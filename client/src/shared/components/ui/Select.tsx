import React, { useRef, useEffect, useState } from "react";
import { Icons } from "./";

interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "outline" | "large";
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
  className = "",
  size = "md",
  variant = "default",
  placeholder = "Select...",
  ...props
}) => {
  const sizeClasses = {
    sm: "text-sm py-1 pl-2 pr-8",
    md: "py-2 pl-3 pr-10",
    lg: "text-lg py-2 pl-3 pr-10",
  };

  const variantClasses = {
    default: "border bg-white",
    outline:
      "border-2 border-secondary text-secondary bg-white hover:bg-secondary/5",
    large:
      "border-2 border-primary font-medium text-primary bg-white hover:bg-primary/5 shadow-sm",
  };

  // Track the selected text value
  const [selectedText, setSelectedText] = useState<string>(placeholder);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Update the displayed text whenever the select value changes
  useEffect(() => {
    if (selectRef.current) {
      const selectedOption =
        selectRef.current.options[selectRef.current.selectedIndex];
      setSelectedText(selectedOption?.textContent || placeholder);
    }
  }, [props.value, props.defaultValue, placeholder]);

  return (
    <div className="relative inline-block">
      {/* The actual select element with native browser behavior */}
      <select
        ref={selectRef}
        className={`w-full h-full absolute inset-0 opacity-0 cursor-pointer z-10`}
        onChange={(e) => {
          if (props.onChange) {
            props.onChange(e);
          }
          // Update the displayed text when selection changes
          setSelectedText(
            e.target.options[e.target.selectedIndex]?.textContent || placeholder
          );
        }}
        {...props}
      />

      {/* Custom styled display that looks like a select */}
      <div
        className={`rounded transition-colors ${sizeClasses[size]} ${variantClasses[variant]} ${className} relative`}
      >
        {/* Text display */}
        <span className="block truncate pr-8">{selectedText}</span>

        {/* Custom arrow icon with consistent positioning */}
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <Icons.ChevronDown
            className={`${variant === "large" ? "h-5 w-5" : "h-4 w-4"}`}
          />
        </span>
      </div>
    </div>
  );
};
