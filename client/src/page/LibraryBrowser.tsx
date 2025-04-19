import { useState, useEffect, useCallback } from "react";
import { StoryTemplate } from "@core/types";
import { config } from "@/config";
import { Logger } from "@common/logger";
import { TemplateCard } from "./components/TemplateCard";
import { PrimaryButton, Icons } from "@components/ui";
import { MAX_PLAYERS } from "@core/config";
import { groupTagsByCategories } from "../shared/tag-categories";

type LibraryBrowserProps = {
  onSelectTemplate: (template: StoryTemplate) => void;
  onBack: () => void;
};

export function LibraryBrowser({
  onSelectTemplate,
  onBack,
}: LibraryBrowserProps) {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<StoryTemplate[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [playerCountFilter, setPlayerCountFilter] = useState<number | null>(
    null
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagCategories, setTagCategories] = useState<Record<string, string[]>>(
    {}
  );

  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({
    Players: true, // Players section expanded by default
  });

  // Fetch published templates
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch all published templates (not just for welcome screen)
        const response = await fetch(`${config.apiUrl}/templates`);

        if (!response.ok) {
          throw new Error(`Error fetching templates: ${response.status}`);
        }

        const data = await response.json();
        Logger.App.log(`Loaded ${data.templates.length} templates for library`);

        // Extract all unique tags
        const uniqueTags = new Set<string>();
        data.templates.forEach((template: StoryTemplate) => {
          if (template.tags) {
            template.tags.forEach((tag) => uniqueTags.add(tag));
          }
        });

        const allTagsArray = Array.from(uniqueTags).sort();

        // Group tags by categories
        setTagCategories(groupTagsByCategories(allTagsArray));

        setTemplates(data.templates);
        setFilteredTemplates(data.templates);
      } catch (error) {
        Logger.App.error("Failed to load templates", error);
        setError("Failed to load story templates");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  // Apply filters when they change
  useEffect(() => {
    let result = [...templates];

    // Filter by player count
    if (playerCountFilter !== null) {
      result = result.filter(
        (template) =>
          playerCountFilter >= template.playerCountMin &&
          playerCountFilter <= template.playerCountMax
      );
    }

    // Filter by selected tags
    if (selectedTags.length > 0) {
      result = result.filter(
        (template) =>
          template.tags &&
          selectedTags.every((tag) => template.tags.includes(tag))
      );
    }

    setFilteredTemplates(result);
  }, [templates, playerCountFilter, selectedTags]);

  // Check if we're on mobile on initial render
  useEffect(() => {
    const checkIfMobile = () => {
      const mobile = window.innerWidth < 640; // sm breakpoint in Tailwind

      // On mobile, collapse all categories except Players by default
      if (mobile) {
        const initialState: Record<string, boolean> = { Players: true };
        Object.keys(tagCategories).forEach((category) => {
          initialState[category] = false;
        });
        setExpandedCategories(initialState);
      } else {
        // On desktop, expand all categories by default
        const initialState: Record<string, boolean> = { Players: true };
        Object.keys(tagCategories).forEach((category) => {
          initialState[category] = true;
        });
        setExpandedCategories(initialState);
      }
    };

    checkIfMobile();

    // Also update when window is resized
    window.addEventListener("resize", checkIfMobile);
    return () => window.removeEventListener("resize", checkIfMobile);
  }, [tagCategories]);

  // Toggle category expansion
  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setPlayerCountFilter(null);
    setSelectedTags([]);
  };

  const renderFilterSection = () => {
    return (
      <div className="mb-8 p-4 bg-white rounded-lg border border-primary-100 shadow-md">
        <div className="space-y-4">
          {/* Player Count section */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-xs md:text-sm font-medium text-primary-700">
                Players
              </h3>
              <button
                onClick={() => toggleCategory("Players")}
                className="sm:hidden text-primary-700 hover:text-primary-900 focus:outline-none"
                aria-label="Toggle Players filter"
              >
                <Icons.ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    expandedCategories["Players"] ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>

            {expandedCategories["Players"] && (
              <div className="flex flex-wrap gap-1 md:gap-2 mt-2">
                {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map(
                  (count) => (
                    <button
                      key={count}
                      onClick={() =>
                        setPlayerCountFilter(
                          count === playerCountFilter ? null : count
                        )
                      }
                      className={`
                      px-2 py-1 md:px-3 md:py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent
                      ${
                        count === playerCountFilter
                          ? "bg-secondary text-white border border-secondary"
                          : "bg-white text-primary-700 border border-primary-200 hover:bg-primary-50"
                      }
                    `}
                    >
                      {count}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Categories Sections - in columns on larger screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {Object.entries(tagCategories).map(([category, tags]) => (
              <div key={category}>
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xs md:text-sm font-medium text-primary-700">
                    {category}
                  </h3>
                  <button
                    onClick={() => toggleCategory(category)}
                    className="sm:hidden text-primary-700 hover:text-primary-900 focus:outline-none"
                    aria-label={`Toggle ${category} filter`}
                  >
                    <Icons.ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        expandedCategories[category] ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>

                {expandedCategories[category] && (
                  <div className="flex flex-wrap gap-1 md:gap-2 mt-2">
                    {tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleTagToggle(tag)}
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
            ))}
          </div>

          {/* Clear Filters Button */}
          {(playerCountFilter !== null || selectedTags.length > 0) && (
            <div className="flex justify-end mt-2">
              <PrimaryButton
                onClick={clearFilters}
                size="sm"
                variant="outline"
                leftBorder={false}
                leftIcon={<Icons.Close className="w-3 h-3" />}
              >
                Clear filters
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6 font-lora">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-primary-800 md:text-center md:w-full">
          Story Library
        </h1>
        <PrimaryButton
          onClick={onBack}
          size="sm"
          variant="outline"
          leftBorder={false}
          className="flex items-center gap-1 md:absolute md:right-8"
        >
          <Icons.ArrowLeft className="w-4 h-4" />
          Back
        </PrimaryButton>
      </div>

      {/* Filters section */}
      {renderFilterSection()}

      {/* Templates grid */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="w-8 h-8 border-t-2 border-b-2 border-secondary rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="text-center py-6 text-tertiary">{error}</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-primary-600">
          <p className="mb-4">No templates match your current filters.</p>
          <PrimaryButton
            onClick={clearFilters}
            size="sm"
            variant="outline"
            leftBorder={false}
          >
            Clear Filters
          </PrimaryButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTemplates.map((template) => (
            <div key={template.id}>
              <TemplateCard
                template={template}
                onPlay={() => onSelectTemplate(template)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
