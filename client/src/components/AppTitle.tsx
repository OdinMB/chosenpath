import { useState } from "react";

interface AppTitleProps {
  className?: string;
  size?: "small" | "medium" | "large";
}

export function AppTitle({ className = "", size = "medium" }: AppTitleProps) {
  const [showTooltip, setShowTooltip] = useState(false);

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
        {/* Main title with MIFE - only this has tooltip trigger */}
        <h1 className={`font-bold ${sizeClasses[size]}`}>
          <span
            className="relative inline-block cursor-help"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {/* MIFE with colorful letters and story-like styling */}
            <span className="font-henny-penny text-emerald-600 transform inline-block hover:scale-110 hover:rotate-2 transition-all duration-300 text-[90%]">
              J
            </span>
            <span className="font-henny-penny text-amber-600 transform inline-block hover:scale-110 hover:-rotate-2 transition-all duration-300 text-[80%]">
              I
            </span>
            <span className="font-henny-penny text-indigo-600 transform inline-block hover:scale-110 hover:rotate-2 transition-all duration-300">
              F
            </span>
            <span className="font-henny-penny text-rose-600 transform inline-block hover:scale-110 hover:-rotate-2 transition-all duration-300 text-[80%] relative">
              E
              {/* Info icon with animation - now positioned further right and up */}
              <span className="absolute -top-6 -right-6 w-5 h-5 border border-gray-400 rounded-full flex items-center justify-center text-xs text-gray-400 transition-all hover:scale-110 hover:rotate-12 duration-300 bg-white">
                i
              </span>
            </span>

            {/* .ai suffix - positioned further right and down with animation */}
            <span className="font-henny-penny text-gray-600 inline-block text-[50%] relative top-1 ml-2 transform hover:scale-110 hover:rotate-2 transition-all duration-300">
              .ai
            </span>
          </span>
        </h1>

        {/* Tagline on its own line - no tooltip trigger */}
        <p
          className={`${taglineSizeClasses[size]} text-gray-700 font-henny-penny mt-4`}
        >
          Where Stories Connect
        </p>

        {/* Tooltip - positioned below without diamond */}
        {showTooltip && (
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-10 px-4 py-2 bg-gray-800 text-white text-sm rounded-md shadow-lg whitespace-nowrap z-10 animate-fadeIn">
            <div>Joint Interactive Fiction Engine</div>
            <div className="text-gray-300 text-s mt-1">
              Create stories for multiple players to experience together
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
