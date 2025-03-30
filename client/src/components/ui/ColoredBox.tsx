import React from "react";

type ElementType = "div" | "button";

type ColoredBoxBaseProps = {
  children: React.ReactNode;
  isActive?: boolean;
  leftBorder?: boolean;
  colorType?: "primary" | "secondary" | "tertiary";
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

    if (isActive) {
      return `border ${borderBase} border-${colorType}-800 hover:enabled:border-${colorType} hover:enabled:shadow-lg hover:enabled:translate-x-1`;
    }

    return `border ${borderBase} border-${colorType}`;
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
