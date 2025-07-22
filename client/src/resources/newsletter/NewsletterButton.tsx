import { PrimaryButton } from "../../shared/components/ui";
import { Icons } from "../../shared/components/ui";

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
      leftIcon={<Icons.Mail className="w-4 h-4" />}
    >
      {showText ? (
        <>
          <span className="md:hidden">News</span>
          <span className="hidden md:inline">Newsletter</span>
        </>
      ) : null}
    </PrimaryButton>
  );
}
