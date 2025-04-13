import { ReactNode } from "react";
import { ColoredBox } from "@components/ui";

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
      colorType={isSelected ? "tertiary" : "secondary"}
      className={`
        p-4 cursor-pointer flex flex-col h-full
        ${!isSelected && "border-secondary-800 hover:border-secondary"}
      `}
      onClick={onClick}
    >
      {children}
    </ColoredBox>
  );
}
