import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, id, name, className = "", ...props }, ref) => {
    const uniqueId = React.useId();
    // Use provided id/name or fall back to generated uniqueId
    const inputId = id || name || uniqueId;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          name={name || inputId}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:border-accent ${className}`}
          {...props}
        />
      </div>
    );
  }
);
