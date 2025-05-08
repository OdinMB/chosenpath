import { AppTitle } from "./AppTitle";
import { UserAccountButton } from "../../users/components";

interface HeaderProps {
  onTitleClick?: () => void;
  size?: "small" | "medium" | "large";
}

export function Header({ onTitleClick, size = "medium" }: HeaderProps) {
  console.log("Header: Rendering");

  return (
    <header className="px-4 pt-4 md:px-6">
      <div className="max-w-md mx-auto relative">
        <div className="absolute right-2 top-4">
          <UserAccountButton />
        </div>

        <div className="flex justify-center">
          <AppTitle size={size} onClick={onTitleClick} />
        </div>
      </div>
    </header>
  );
}
