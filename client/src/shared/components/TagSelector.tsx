import { useState, useEffect } from "react";
import { TAG_CATEGORIES } from "../tagCategories";
import { Icons } from "components/ui";

interface TagSelectorProps {
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  expandedByDefault?: boolean;
}

/**
 * A reusable component for selecting tags grouped by category
 */
export function TagSelector({
  selectedTags,
  onTagToggle,
  expandedByDefault = true,
}: TagSelectorProps) {
  // Track expanded state for each category
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [isDesktop, setIsDesktop] = useState(false);

  // Initialize expanded state when categories or default changes
  useEffect(() => {
    const initialState: Record<string, boolean> = {};
    TAG_CATEGORIES.forEach((category) => {
      initialState[category.name] = expandedByDefault;
    });
    setExpandedCategories(initialState);
  }, [expandedByDefault]);

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

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  return (
    <div className="space-y-3">
      {TAG_CATEGORIES.map((category) => (
        <div
          key={category.name}
          className="border border-primary-100 rounded-md overflow-hidden"
        >
          <div className="flex justify-between items-center bg-primary-50 px-3 py-2">
            <h3 className="text-sm font-medium text-primary-700">
              {category.name}
            </h3>
            <button
              onClick={() => toggleCategory(category.name)}
              className="text-primary-700 hover:text-primary-900 focus:outline-none sm:hidden"
              aria-label={`Toggle ${category.name} tags`}
            >
              <Icons.ChevronDown
                className={`w-4 h-4 transition-transform ${
                  expandedCategories[category.name] ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {(isDesktop || expandedCategories[category.name]) && (
            <div className="flex flex-wrap gap-1 p-2">
              {category.tags && category.tags.length > 0 ? (
                category.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onTagToggle(tag)}
                    className={`
                      px-2 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent whitespace-nowrap
                      ${
                        selectedTags.includes(tag)
                          ? "bg-secondary text-white border border-secondary"
                          : "bg-white text-primary-700 border border-primary-200 hover:bg-primary-50"
                      }
                    `}
                  >
                    {tag}
                  </button>
                ))
              ) : (
                <p className="text-xs text-primary-500 italic">
                  No tags in this category
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
