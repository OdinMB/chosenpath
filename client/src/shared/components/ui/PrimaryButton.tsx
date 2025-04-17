import React from "react";
import { ColoredBox } from "./";

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonSize = "sm" | "md" | "lg";
type TextAlignment = "left" | "center" | "right";

interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  leftBorder?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  textAlign?: TextAlignment;
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
  textAlign = "center",
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

  const getTextAlignClasses = (): string => {
    switch (textAlign) {
      case "left":
        return "text-left";
      case "right":
        return "text-right";
      default:
        return "text-center";
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
        ${getTextAlignClasses()}
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
          className={`flex items-center w-full ${
            rightIcon && children
              ? "justify-between"
              : textAlign === "left"
              ? "justify-start"
              : textAlign === "right"
              ? "justify-end"
              : "justify-center"
          } gap-2`}
        >
          {(leftIcon || children) && (
            <div
              className={`flex items-center ${
                textAlign === "left"
                  ? "text-left"
                  : textAlign === "right"
                  ? "text-right"
                  : "text-center"
              }`}
            >
              {leftIcon && (
                <span className={children ? "mr-2" : ""}>{leftIcon}</span>
              )}
              {children}
            </div>
          )}
          {rightIcon && (
            <span className={children ? "ml-2" : ""}>{rightIcon}</span>
          )}
        </div>
      )}
    </ColoredBox>
  );
};
