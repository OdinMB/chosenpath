import { useState, useEffect } from "react";
import { Icons } from "@components/ui";

interface FilterTagGroupProps {
  title: string;
  tags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  expandedByDefault?: boolean;
}

/**
 * A reusable component for filtering by tags
 * Shows a collapsible section of filter tags (collapsible only on mobile)
 */
export function FilterTagGroup({
  title,
  tags,
  selectedTags,
  onTagToggle,
  expandedByDefault = true,
}: FilterTagGroupProps) {
  const [isExpanded, setIsExpanded] = useState(expandedByDefault);
  const [isDesktop, setIsDesktop] = useState(false);

  // Check if we're on desktop safely after mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkIfDesktop = () => {
        setIsDesktop(window.innerWidth >= 640);
      };

      checkIfDesktop();
      window.addEventListener("resize", checkIfDesktop);
      return () => window.removeEventListener("resize", checkIfDesktop);
    }
  }, []);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-xs md:text-sm font-medium text-primary-700">
          {title}
        </h3>
        <button
          onClick={toggleExpanded}
          className="sm:hidden text-primary-700 hover:text-primary-900 focus:outline-none"
          aria-label={`Toggle ${title} filter`}
        >
          <Icons.ChevronDown
            className={`w-4 h-4 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {(isExpanded || isDesktop) && (
        <div className="flex flex-wrap gap-1 md:gap-2 mt-2">
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`
                px-2 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent whitespace-nowrap
                ${
                  selectedTags.includes(tag)
                    ? "bg-secondary text-white border border-secondary"
                    : "bg-white text-primary-700 border border-primary-200 hover:bg-primary-50"
                }
              `}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
