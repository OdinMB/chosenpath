import React from "react";
import { Icons } from "@components/ui/Icons";

interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "outline";
}

export const Select: React.FC<SelectProps> = ({
  className = "",
  size = "md",
  variant = "default",
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
  };

  return (
    <div className="relative inline-block">
      <select
        className={`appearance-none rounded transition-colors [-webkit-appearance:none] [-moz-appearance:none] ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        {...props}
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-current">
        <Icons.ChevronDown className="h-4 w-4" />
      </div>
    </div>
  );
};
