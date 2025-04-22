import { StoryTemplate } from "core/types";
import { TemplateCard } from "./TemplateCard";
import { PrimaryButton, Icons } from "components/ui";
import { MAX_PLAYERS } from "core/config";
import { useLibraryBrowser } from "../hooks/useLibraryBrowser";

type LibraryBrowserProps = {
  onSelectTemplate: (template: StoryTemplate) => void;
  onBack: () => void;
};

export function LibraryBrowser({
  onSelectTemplate,
  onBack,
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
  } = useLibraryBrowser();

  const renderFilterSection = () => {
    // Count of active filters
    const activeFilterCount =
      (playerCountFilter !== null ? 1 : 0) + selectedTags.length;

    return (
      <div
        className={`mb-8 p-4 ${
          !showFilters ? "pb-1" : ""
        } bg-white rounded-lg border border-primary-100 shadow-md`}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-medium text-primary-800">
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </h2>
          <div className="flex items-center gap-2 sm:ml-0 ml-auto">
            {activeFilterCount > 0 && (
              <>
                <PrimaryButton
                  onClick={clearFilters}
                  size="sm"
                  variant="outline"
                  leftBorder={false}
                  leftIcon={<Icons.Close className="w-3 h-3" />}
                  className="text-xs py-0.5 px-2"
                >
                  <span className="hidden sm:inline">Clear filters</span>
                  <span className="sm:hidden">Clear</span>
                </PrimaryButton>
              </>
            )}
            <PrimaryButton
              onClick={toggleShowFilters}
              size="sm"
              variant="outline"
              leftBorder={false}
              leftIcon={
                showFilters ? (
                  <Icons.ChevronUp className="w-4 h-4" />
                ) : (
                  <Icons.ChevronDown className="w-4 h-4" />
                )
              }
              className="text-xs py-0.5 px-2"
            >
              <span className="hidden sm:inline">
                {showFilters ? "Hide" : "Show"} filters
              </span>
              <span className="sm:hidden">{showFilters ? "Hide" : "Show"}</span>
            </PrimaryButton>
          </div>
        </div>

        {showFilters && (
          <div className="space-y-4">
            {/* Player Count as horizontal row */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-primary-700 mb-2">
                Players
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map(
                  (count) => (
                    <button
                      key={count}
                      onClick={() =>
                        setPlayerCountFilter(
                          count === playerCountFilter ? null : count
                        )
                      }
                      className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                        playerCountFilter === count
                          ? "bg-primary-600 text-white"
                          : "bg-primary-50 text-primary-700 hover:bg-primary-100"
                      }`}
                    >
                      {count}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Categories in a compact grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
              {Object.entries(tagCategories).map(([category, tags]) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-medium text-primary-700">
                    {category}
                  </h3>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleTagToggle(tag)}
                        className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
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
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6 font-lora">
      <div className="flex justify-between items-center mb-6 relative">
        <div className="w-full flex justify-start lg:justify-center">
          <h1 className="text-2xl font-bold text-primary-800">Story Library</h1>
        </div>
        <PrimaryButton
          onClick={onBack}
          size="sm"
          variant="outline"
          leftBorder={false}
          className="flex items-center gap-1 absolute right-0"
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
