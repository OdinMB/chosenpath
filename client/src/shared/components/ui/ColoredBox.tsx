import React from "react";

type ElementType = "div" | "button";

type ColoredBoxBaseProps = {
  children: React.ReactNode;
  isActive?: boolean;
  leftBorder?: boolean;
  colorType?: "primary" | "secondary" | "tertiary" | "accent";
  className?: string;
  disabled?: boolean;
};

type ColoredBoxProps<T extends ElementType> = ColoredBoxBaseProps & {
  as?: T;
} & (T extends "button"
    ? Omit<
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        keyof ColoredBoxBaseProps
      >
    : Omit<React.HTMLAttributes<HTMLDivElement>, keyof ColoredBoxBaseProps>);

export function ColoredBox<T extends ElementType = "div">({
  children,
  isActive = false,
  leftBorder = true,
  colorType = "secondary",
  className = "",
  as,
  disabled = false,
  ...props
}: ColoredBoxProps<T>) {
  const baseClasses =
    "bg-white shadow-md rounded-lg transition-all duration-300";
  const disabledClasses = disabled ? "cursor-not-allowed opacity-70" : "";

  const getBorderClasses = () => {
    const borderBase = leftBorder ? "border-l-8" : "";
    const borderClass = "border " + borderBase;

    // Static classes for color types instead of template literals
    if (isActive) {
      if (colorType === "primary") {
        return `${borderClass} border-primary-800 hover:enabled:border-primary hover:enabled:shadow-lg hover:enabled:translate-x-1`;
      } else if (colorType === "secondary") {
        return `${borderClass} border-secondary-800 hover:enabled:border-secondary hover:enabled:shadow-lg hover:enabled:translate-x-1`;
      } else if (colorType === "tertiary") {
        return `${borderClass} border-tertiary-800 hover:enabled:border-tertiary hover:enabled:shadow-lg hover:enabled:translate-x-1`;
      } else if (colorType === "accent") {
        return `${borderClass} border-accent-800 hover:enabled:border-accent hover:enabled:shadow-lg hover:enabled:translate-x-1`;
      }
    }

    // Non-active state
    if (colorType === "primary") {
      return `${borderClass} border-primary`;
    } else if (colorType === "secondary") {
      return `${borderClass} border-secondary`;
    } else if (colorType === "tertiary") {
      return `${borderClass} border-tertiary`;
    } else if (colorType === "accent") {
      return `${borderClass} border-accent`;
    }

    // Fallback to secondary
    return `${borderClass} border-secondary`;
  };

  const Element = (as || "div") as "div" | "button";

  return React.createElement(
    Element,
    {
      className: `${baseClasses} ${getBorderClasses()} ${disabledClasses} ${className}`,
      ...(Element === "button" ? { type: "button", disabled } : {}),
      ...props,
    },
    children
  );
}
