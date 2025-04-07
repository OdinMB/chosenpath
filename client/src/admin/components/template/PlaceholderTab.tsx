import React from "react";

interface PlaceholderTabProps {
  message: string;
}

export const PlaceholderTab: React.FC<PlaceholderTabProps> = ({ message }) => {
  return (
    <div className="py-6 text-center text-gray-500">
      {message || "This feature will be implemented in the next phase."}
    </div>
  );
};
