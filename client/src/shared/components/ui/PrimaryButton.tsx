import React from "react";
import { ColoredBox } from "./";

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  leftBorder?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  leftBorder = true,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}) => {
  const getSizeClasses = (): string => {
    switch (size) {
      case "sm":
        return "py-1.5 px-3 text-sm";
      case "lg":
        return "py-3 px-5 text-base";
      default:
        return "py-2 px-4 text-sm";
    }
  };

  const getVariantClasses = (): string => {
    switch (variant) {
      case "outline":
        return "text-primary hover:enabled:bg-primary-50 transition-colors duration-200 shadow-sm";
      default:
        return "text-primary";
    }
  };

  return (
    <ColoredBox
      as="button"
      isActive={variant !== "outline"}
      leftBorder={leftBorder}
      colorType={variant === "outline" ? "primary" : "secondary"}
      disabled={disabled || isLoading}
      className={`
        font-medium focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50
        ${getSizeClasses()}
        ${getVariantClasses()}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-primary-100 border-t-accent rounded-full animate-spin mr-2"></div>
          <span>Loading...</span>
        </div>
      ) : (
        <div
          className={`flex items-center ${
            rightIcon ? "justify-between" : "justify-center"
          } gap-2`}
        >
          <div className="flex items-center gap-2">
            {leftIcon}
            {children}
          </div>
          {rightIcon}
        </div>
      )}
    </ColoredBox>
  );
};
