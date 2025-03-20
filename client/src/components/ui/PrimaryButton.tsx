import React from "react";

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  leftBorder?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  leftBorder = true,
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
    if (disabled || isLoading) {
      return "bg-gray-300 text-gray-500 cursor-not-allowed";
    }

    switch (variant) {
      case "secondary":
        return `bg-white border border-secondary ${
          leftBorder ? "border-l-8" : ""
        } shadow-md text-primary hover:enabled:border-accent hover:enabled:shadow-lg hover:enabled:translate-x-1 transition-all duration-300`;
      case "outline":
        return "bg-white border border-primary-100 text-primary hover:enabled:bg-primary-50 transition-colors duration-200 shadow-sm";
      default:
        return `bg-white border border-accent ${
          leftBorder ? "border-l-8" : ""
        } shadow-md text-primary hover:enabled:border-secondary hover:enabled:shadow-lg hover:enabled:translate-x-1 transition-all duration-300`;
    }
  };

  return (
    <button
      className={`font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50 ${getSizeClasses()} ${getVariantClasses()} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-primary-100 border-t-accent rounded-full animate-spin mr-2"></div>
          <span>Loading...</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
};
