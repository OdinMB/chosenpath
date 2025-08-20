interface AppLogoProps {
  className?: string;
  size?: "small" | "medium" | "large";
  onClick?: () => void;
}

export function AppLogo({
  className = "",
  size = "medium",
  onClick,
}: AppLogoProps) {
  // Size mappings for different screen sizes
  const sizeMappings = {
    small: "w-24 sm:w-32", // 96px, 128px
    medium: "w-36 sm:w-48", // 144px, 192px
    large: "w-48 sm:w-64", // 192px, 256px
  };

  return (
    <div
      className={`text-center ${className} ${onClick ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent rounded" : ""}`}
      onClick={onClick}
      {...(onClick && {
        tabIndex: 0,
        role: "button",
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }
      })}
    >
      <div className="inline-block">
        <img
          src="/ChosenPath-512.png"
          alt="ChosenPath.ai"
          className={`${sizeMappings[size]} object-contain -my-4 sm:-my-6`}
        />
      </div>
    </div>
  );
}
