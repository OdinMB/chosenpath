import React from "react";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Checkbox({ className = "", ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={`h-4 w-4 rounded border-gray-300 text-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent ${className}`}
      {...props}
    />
  );
}
