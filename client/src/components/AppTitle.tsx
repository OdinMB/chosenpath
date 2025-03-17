import { useState } from "react";

interface AppTitleProps {
  className?: string;
  size?: "small" | "medium" | "large";
}

export function AppTitle({ className = "", size = "medium" }: AppTitleProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoverChosen, setHoverChosen] = useState(false);
  const [hoverPath, setHoverPath] = useState(false);
  const [hoverAi, setHoverAi] = useState(false);

  // Size-based classes for the main title
  const sizeClasses = {
    small: "text-3xl",
    medium: "text-4xl",
    large: "text-5xl md:text-6xl",
  };

  // Size-based classes for the tagline
  const taglineSizeClasses = {
    small: "text-lg",
    medium: "text-xl",
    large: "text-2xl",
  };

  return (
    <div className={`text-center ${className}`}>
      <div className="inline-block relative">
        {/* Main title with ChosenPath */}
        <h1 className={`font-bold ${sizeClasses[size]}`}>
          <span
            className="relative inline-block cursor-help"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {/* "Chosen" as a group */}
            <span
              className="inline-block"
              onMouseEnter={() => setHoverChosen(true)}
              onMouseLeave={() => setHoverChosen(false)}
            >
              <span
                className={`font-henny-penny text-accent transform inline-block ${
                  hoverChosen ? "scale-110 rotate-2" : ""
                } transition-all duration-300 text-[90%] drop-shadow-md`}
              >
                Chosen
              </span>
            </span>

            {/* "Path" as a group */}
            <span
              className="inline-block"
              onMouseEnter={() => setHoverPath(true)}
              onMouseLeave={() => setHoverPath(false)}
            >
              <span
                className={`font-henny-penny text-secondary transform inline-block ${
                  hoverPath ? "scale-110 -rotate-2" : ""
                } transition-all duration-300 text-[90%] drop-shadow-md`}
              >
                Path
              </span>
            </span>

            {/* ".ai" as a group */}
            <span
              className="inline-block"
              onMouseEnter={() => setHoverAi(true)}
              onMouseLeave={() => setHoverAi(false)}
            >
              <span
                className={`font-henny-penny text-black inline-block text-[50%] relative top-1 ml-2 transform ${
                  hoverAi ? "scale-110 rotate-2" : ""
                } transition-all duration-300`}
              >
                .ai
              </span>
            </span>
          </span>
        </h1>

        {/* Tagline on its own line - no tooltip trigger */}
        <p
          className={`${taglineSizeClasses[size]} text-primary font-henny-penny mt-4`}
        >
          Any story. Any time.
        </p>

        {/* Tooltip - positioned below without diamond */}
        {showTooltip && (
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-10 px-6 py-4 bg-white text-primary text-sm rounded-md shadow-lg z-10 animate-fadeIn border border-primary-100 w-72 md:w-96">
            <div className="text-left">
              Step into an <strong>interactive story</strong> where your choices
              shape the journey. <strong>Play solo or with friends</strong> and
              create unforgettable adventures, any time.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
