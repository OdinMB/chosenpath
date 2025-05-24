import { PrimaryButton } from "./ui";
import { Icons } from "./ui";

interface DiscordButtonProps {
  onClick: () => void;
  variant?: "primary" | "outline";
  className?: string;
  showText?: boolean;
  leftBorder?: boolean;
}

export function DiscordButton({
  onClick,
  variant = "primary",
  className = "",
  showText = true,
  leftBorder = true,
}: DiscordButtonProps) {
  return (
    <PrimaryButton
      onClick={onClick}
      size="sm"
      variant={variant}
      className={`flex items-center gap-1 ${className} ${
        !leftBorder ? "border-l-0" : ""
      }`}
      aria-label="Join Discord"
      title="Join Discord"
      leftIcon={<Icons.Discord className="w-4 h-4" />}
    >
      {showText ? "Discord" : null}
    </PrimaryButton>
  );
}
