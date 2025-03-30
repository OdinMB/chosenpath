interface AppTitleProps {
  className?: string;
  size?: "small" | "medium" | "large";
  onClick?: () => void;
}

export function AppTitle({
  className = "",
  size = "medium",
  onClick,
}: AppTitleProps) {
  // Base size in pixels for each size option
  const baseSizes = {
    small: 128,
    medium: 192,
    large: 256,
  };

  return (
    <div
      className={`text-center ${className} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="inline-block">
        <img
          src="/ChosenPath-512.png"
          alt="ChosenPath.ai"
          className="w-full object-contain -my-6"
          style={{
            width: baseSizes[size],
          }}
        />
      </div>
    </div>
  );
}
