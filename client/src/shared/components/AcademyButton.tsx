import { PrimaryButton } from "./ui";
import { Icons } from "./ui";

interface AcademyButtonProps {
  onClick?: () => void;
  variant?: "primary" | "outline";
  className?: string;
  showText?: boolean;
  leftBorder?: boolean;
  rightIcon?: boolean;
}

export function AcademyButton({
  onClick,
  variant = "primary",
  className = "",
  showText = true,
  leftBorder = true,
  rightIcon = false,
}: AcademyButtonProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      window.open("/academy", "_blank");
    }
  };

  const icon = <Icons.Academy className="w-4 h-4" />;

  return (
    <PrimaryButton
      onClick={handleClick}
      size={className.includes("w-full") ? undefined : "sm"}
      variant={variant}
      className={`flex items-center ${className} ${
        !leftBorder ? "border-l-0" : ""
      }`}
      aria-label="Visit Academy"
      title="Visit Academy"
      leftIcon={rightIcon ? undefined : icon}
      rightIcon={rightIcon ? icon : undefined}
    >
      {showText ? (
        <span className={rightIcon ? "font-semibold text-sm mr-4" : ""}>
          Academy
        </span>
      ) : null}
    </PrimaryButton>
  );
}