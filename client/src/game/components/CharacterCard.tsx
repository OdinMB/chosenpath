import { ReactNode } from "react";
import { ColoredBox } from "components/ui";

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
    <ColoredBox
      as="button"
      colorType={isSelected ? "tertiary" : "secondary"}
      className={`
        p-4 cursor-pointer flex flex-col h-full text-left
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent
        ${!isSelected && "border-secondary-800 hover:border-secondary"}
      `}
      onClick={onClick}
      role="button"
      aria-pressed={isSelected}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </ColoredBox>
  );
}
