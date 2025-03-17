import { ReactNode } from "react";

interface CharacterCardProps {
  isSelected: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function CharacterCard({
  isSelected,
  onClick,
  children,
}: CharacterCardProps) {
  return (
    <div
      className={`
        border-l-4 border rounded-lg p-4 cursor-pointer transition-all duration-200 flex flex-col h-full bg-white
        ${
          isSelected
            ? "border-secondary shadow-md"
            : "border-primary-100 shadow-sm hover:border-secondary hover:shadow-md"
        }
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
