import { PrimaryButton } from "./ui";
import { Icons } from "./ui";
import { config } from "../../config";

interface DiscordButtonProps {
  onClick?: () => void;
  variant?: "primary" | "outline";
  className?: string;
  showText?: boolean;
  leftBorder?: boolean;
  rightIcon?: boolean;
}

export function DiscordButton({
  onClick,
  variant = "primary",
  className = "",
  showText = true,
  leftBorder = true,
  rightIcon = false,
}: DiscordButtonProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      window.open(config.discordUrl, "_blank");
    }
  };

  const icon = <Icons.Discord className="w-4 h-4" />;

  return (
    <PrimaryButton
      onClick={handleClick}
      size={className.includes("w-full") ? undefined : "sm"}
      variant={variant}
      className={`flex items-center ${className} ${
        !leftBorder ? "border-l-0" : ""
      }`}
      aria-label="Join Discord"
      title="Join Discord"
      leftIcon={rightIcon ? undefined : icon}
      rightIcon={rightIcon ? icon : undefined}
    >
      {showText ? (
        <span className={rightIcon ? "font-semibold text-sm mr-4" : ""}>
          Discord
        </span>
      ) : null}
    </PrimaryButton>
  );
}
