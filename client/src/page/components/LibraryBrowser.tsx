import { StoryTemplate } from "core/types";
import { TemplateCard } from "./TemplateCard";
import { PrimaryButton, Icons } from "components/ui";
import { useLibraryBrowser } from "../hooks/useLibraryBrowser";
import { useEffect } from "react";

type LibraryBrowserProps = {
  onSelectTemplate: (template: StoryTemplate) => void;
  onBack: () => void;
  initialSelectedTag?: string | null; // For backward compatibility
  initialSelectedTags?: string[]; // New prop for multiple tags
};

export function LibraryBrowser({
  onSelectTemplate,
  onBack,
  initialSelectedTag = null,
  initialSelectedTags = [],
}: LibraryBrowserProps) {
  const {
    filteredTemplates,
    isLoading,
    error,
    showFilters,
    playerCountFilter,
    selectedTags,
    tagCategories,
    setPlayerCountFilter,
    handleTagToggle,
    clearFilters,
    toggleShowFilters,
    setInitialTag,
    setInitialTags,
    getAvailablePlayerCounts,
  } = useLibraryBrowser();

  // Set initial tags when the component mounts
  useEffect(() => {
    // First check for multiple tags
    if (initialSelectedTags && initialSelectedTags.length > 0) {
      setInitialTags(initialSelectedTags);
    }
    // For backward compatibility, also check for single tag
    else if (initialSelectedTag) {
      setInitialTag(initialSelectedTag);
    }
  }, [initialSelectedTag, initialSelectedTags, setInitialTag, setInitialTags]);

  // Calculate filter indicator and display
  const activeFilterCount =
    (playerCountFilter !== null ? 1 : 0) + selectedTags.length;
  const hasActiveFilters = activeFilterCount > 0;

  // Get available player counts
  const availablePlayerCounts = getAvailablePlayerCounts();

  // Render text-based filter UI
  const renderFilters = () => {
    return (
      <div className="mb-6">
        {/* Everything now goes in the grey box */}
        <div className="border border-gray-200 rounded-md p-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Integrated Filter button with arrow */}
            <button
              onClick={toggleShowFilters}
              className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium border border-primary-300 rounded-md text-primary-700 hover:bg-primary-50"
              aria-label={showFilters ? "Collapse filters" : "Expand filters"}
            >
              Filters
              <Icons.ChevronDown
                className={`w-3 h-3 transform transition-transform ${
                  showFilters ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Active filters display with Clear All at the end */}
            {playerCountFilter !== null && (
              <span className="px-2 py-0.5 text-xs rounded-md bg-primary-50 text-primary-800 border border-primary-200 flex items-center">
                {playerCountFilter} player{playerCountFilter !== 1 ? "s" : ""}
                <button
                  onClick={() => setPlayerCountFilter(null)}
                  className="ml-1 text-primary-600 hover:text-primary-800"
                  aria-label="Remove player count filter"
                >
                  <Icons.Close className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedTags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs rounded-md bg-primary-50 text-primary-800 border border-primary-200 flex items-center"
              >
                {tag}
                <button
                  onClick={() => handleTagToggle(tag)}
                  className="ml-1 text-primary-600 hover:text-primary-800"
                  aria-label={`Remove ${tag} filter`}
                >
                  <Icons.Close className="w-3 h-3" />
                </button>
              </span>
            ))}

            {/* Clear all button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-2 py-0.5 text-xs rounded-md bg-white text-primary-600 hover:text-primary-800 border border-primary-200 flex items-center"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Expanded filter categories */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              {/* Two-column layout for Players and Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* First row: Players and Categories */}
                <div>
                  <span className="text-sm text-primary-700 mr-2">Players</span>
                  <div className="inline-flex flex-wrap gap-1">
                    {availablePlayerCounts.map((count) => (
                      <button
                        key={count}
                        onClick={() =>
                          setPlayerCountFilter(
                            count === playerCountFilter ? null : count
                          )
                        }
                        className={`px-1.5 py-0.5 text-xs rounded-md transition-colors ${
                          playerCountFilter === count
                            ? "bg-primary-600 text-white"
                            : "bg-primary-50 text-primary-700 hover:bg-primary-100"
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Extract the first category (likely Categories) for first row */}
                {Object.entries(tagCategories).length > 0 && (
                  <div>
                    <span className="text-sm text-primary-700 mr-2">
                      {Object.keys(tagCategories)[0]}
                    </span>
                    <div className="inline-flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {tagCategories[Object.keys(tagCategories)[0]].map(
                        (tag) => (
                          <button
                            key={tag}
                            onClick={() => handleTagToggle(tag)}
                            className={`px-1.5 py-0.5 text-xs rounded-md transition-colors ${
                              selectedTags.includes(tag)
                                ? "bg-primary-600 text-white"
                                : "bg-primary-50 text-primary-700 hover:bg-primary-100"
                            }`}
                          >
                            {tag}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Second row: Remaining categories in 3 columns on non-mobile */}
              <div className="mt-4">
                {/* Using flex column on mobile, grid on desktop for more consistent spacing */}
                <div className="flex flex-col md:grid md:grid-cols-3 md:gap-4 space-y-4 md:space-y-0">
                  {Object.entries(tagCategories)
                    .slice(1)
                    .map(([category, tags]) => (
                      <div key={category}>
                        <span className="text-sm text-primary-700 mr-2">
                          {category}
                        </span>
                        <div className="inline-flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                          {tags.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => handleTagToggle(tag)}
                              className={`px-1.5 py-0.5 text-xs rounded-md transition-colors ${
                                selectedTags.includes(tag)
                                  ? "bg-primary-600 text-white"
                                  : "bg-primary-50 text-primary-700 hover:bg-primary-100"
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4 font-lora">
      <div className="flex justify-between items-center mb-6 relative">
        <div className="w-full flex justify-start lg:justify-center">
          <h1 className="text-2xl font-bold text-primary-800">Story Library</h1>
        </div>
        <PrimaryButton
          onClick={() => {
            // Clear URL parameters before going back
            window.history.replaceState(
              {},
              document.title,
              window.location.pathname
            );
            onBack();
          }}
          size="sm"
          variant="outline"
          leftBorder={false}
          className="flex items-center gap-1 absolute right-0"
        >
          <Icons.ArrowLeft className="w-4 h-4" />
          Back
        </PrimaryButton>
      </div>

      {/* Text-based filters */}
      {renderFilters()}

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
