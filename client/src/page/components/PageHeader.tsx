import { AppLogo } from "client/shared/components/AppLogo";
import { useLocation } from "react-router-dom";

interface PageHeaderProps {
  onTitleClick?: () => void;
  size?: "small" | "medium" | "large";
}

export function PageHeader({ onTitleClick, size = "medium" }: PageHeaderProps) {
  const location = useLocation();
  const isSetupPage = location.pathname === "/setup";
  
  return (
    <header className="px-4 pt-2 md:px-6">
      <div className="max-w-md mx-auto relative">
        <div className={`flex justify-center ${isSetupPage ? "hidden sm:flex" : ""}`}>
          <AppLogo size={size} onClick={onTitleClick} />
        </div>
      </div>
    </header>
  );
}
