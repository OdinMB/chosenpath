import { PrimaryButton } from "./ui";

interface NewsletterButtonProps {
  onClick: () => void;
  variant?: "primary" | "outline";
  className?: string;
  showText?: boolean;
  leftBorder?: boolean;
}

export function NewsletterButton({
  onClick,
  variant = "primary",
  className = "",
  showText = true,
  leftBorder = true,
}: NewsletterButtonProps) {
  return (
    <PrimaryButton
      onClick={onClick}
      size="sm"
      variant={variant}
      className={`flex items-center gap-1 ${className} ${
        !leftBorder ? "border-l-0" : ""
      }`}
      aria-label="Subscribe to newsletter"
      title="Subscribe to newsletter"
    >
      {showText ? "Newsletter" : null}
    </PrimaryButton>
  );
}
