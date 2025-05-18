import { AppLogo } from "client/shared/components/AppLogo";

interface PageHeaderProps {
  onTitleClick?: () => void;
  size?: "small" | "medium" | "large";
}

export function PageHeader({ onTitleClick, size = "medium" }: PageHeaderProps) {
  return (
    <header className="px-4 pt-4 md:px-6">
      <div className="max-w-md mx-auto relative">
        <div className="flex justify-center">
          <AppLogo size={size} onClick={onTitleClick} />
        </div>
      </div>
    </header>
  );
}
