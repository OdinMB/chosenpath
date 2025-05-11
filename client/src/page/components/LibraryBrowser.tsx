import { StoryTemplate } from "core/types";
import { TemplateCard } from "./TemplateCard";
import { PrimaryButton, Icons } from "components/ui";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Modal } from "shared/components/ui";
import { CreateYourOwnCard } from "./CreateYourOwnCard";
import { NoMatchesCard } from "./NoMatchesCard";
import { useNewsletter } from "shared/hooks/useNewsletter";
import { NewsletterModal } from "shared/components";
import { NewsletterCard } from "./NewsletterCard";
import { useNavigate, useLoaderData } from "react-router-dom";
import { useLibraryBrowser } from "../hooks/useLibraryBrowser";

interface LibraryLoaderData {
  templates: StoryTemplate[];
  tagCategories: Record<string, string[]>;
  initialTags: string[];
  initialPlayerCount: number | null;
}

// Simple share modal component
function ShareFilterModal({
  isOpen,
  onClose,
  shareUrl,
}: {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Filtered Library"
      width="md"
    >
      <div className="mb-4">
        <div className="flex items-stretch">
          <input
            type="text"
            value={shareUrl}
            readOnly
            className="flex-1 p-2 border border-r-0 rounded-l-md text-sm bg-gray-50"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <PrimaryButton
            onClick={handleCopy}
            variant="outline"
            leftBorder={false}
            className="rounded-l-none"
            aria-label="Copy to clipboard"
            type="button"
            rightIcon={
              copied ? (
                <Icons.Check className="w-5 h-5" />
              ) : (
                <Icons.Copy className="w-5 h-5" />
              )
            }
          />
        </div>
      </div>

      {copied && (
        <div className="text-green-600 text-sm flex items-center">
          <Icons.Check className="w-4 h-4 mr-1" />
          Copied to clipboard!
        </div>
      )}
    </Modal>
  );
}

export function LibraryBrowser() {
  const navigate = useNavigate();
  const { templates, tagCategories, initialTags, initialPlayerCount } =
    useLoaderData() as LibraryLoaderData;

  const {
    filteredTemplates,
    showFilters,
    playerCountFilter,
    selectedTags,
    setPlayerCountFilter,
    handleTagToggle,
    clearFilters,
    toggleShowFilters,
    getAvailablePlayerCounts,
    applyFilters,
  } = useLibraryBrowser({
    templates,
    initialTags,
    initialPlayerCount,
  });

  // State for Share Modal
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  // Newsletter setup
  const {
    isNewsletterModalOpen,
    openNewsletterModal,
    closeNewsletterModal,
    handleSubscribe,
  } = useNewsletter();

  // Apply filters when they change
  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Calculate filter indicator and display
  const activeFilterCount =
    (playerCountFilter !== null ? 1 : 0) + selectedTags.length;
  const hasActiveFilters = activeFilterCount > 0;

  // Generate share URL with current filter configuration
  const getShareUrl = () => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams();

    if (selectedTags.length > 0) {
      params.set("tags", selectedTags.join(","));
    }

    if (playerCountFilter !== null) {
      params.set("players", playerCountFilter.toString());
    }

    return `${baseUrl}/library?${params.toString()}`;
  };

  // Handle share button click
  const handleShare = () => {
    setShareUrl(getShareUrl());
    setIsShareModalOpen(true);
  };

  const handleSelectTemplate = useCallback(
    (template: StoryTemplate) => {
      navigate(`/templates/${template.id}/configure`);
    },
    [navigate]
  );

  const handleBack = () => {
    // Clear URL parameters before going back
    window.history.replaceState({}, document.title, window.location.pathname);
    navigate("/");
  };

  const handleCreateStory = useCallback(() => {
    navigate("/setup");
  }, [navigate]);

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
                  className="ml-1 text-primary-400 hover:text-primary-600"
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
                  className="ml-1 text-primary-400 hover:text-primary-600"
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
                    {getAvailablePlayerCounts().map((count) => (
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

  // Shuffle the templates and position the create card
  const shuffledAndPositionedItems = useMemo(() => {
    if (!filteredTemplates.length) return [];

    // Create a copy and shuffle the templates
    const shuffled = [...filteredTemplates].sort(() => Math.random() - 0.5);

    // Create the final arrangement with JSX elements, using a pattern to ensure equal height
    const result = shuffled.map((template) => (
      <div key={template.id} className="flex">
        <TemplateCard
          template={template}
          onPlay={() => handleSelectTemplate(template)}
          className="flex-1 h-full"
        />
      </div>
    ));

    // Position the "Create your own" card
    if (handleCreateStory) {
      const createYourOwnCard = (
        <div key="create-your-own" className="flex">
          <CreateYourOwnCard
            onCreateStory={handleCreateStory}
            className="flex-1 h-full"
          />
        </div>
      );

      // Position as 4th item or last if fewer than 4 items
      const position = Math.min(3, result.length);
      result.splice(position, 0, createYourOwnCard);
    }

    // Add the newsletter card as the last item
    const newsletterCard = (
      <div key="newsletter" className="flex">
        <NewsletterCard
          onOpenNewsletter={openNewsletterModal}
          className="flex-1 h-full"
        />
      </div>
    );

    result.push(newsletterCard);

    return result;
  }, [
    filteredTemplates,
    handleCreateStory,
    handleSelectTemplate,
    openNewsletterModal,
  ]);

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <div className="max-w-4xl mx-auto p-4 font-lora">
          <div className="flex justify-between items-center mb-6 relative">
            <div className="w-full flex justify-start lg:justify-center">
              <h1 className="text-2xl font-bold text-primary-800">Library</h1>
            </div>
            <div className="flex items-center gap-2 absolute right-0">
              {/* Share button - only visible when filters are active */}
              {hasActiveFilters && (
                <PrimaryButton
                  onClick={handleShare}
                  size="sm"
                  variant="outline"
                  leftBorder={false}
                  className="flex items-center gap-1 h-[32px]"
                  aria-label="Share current filters"
                  title="Share current filters"
                  leftIcon={<Icons.Share className="w-4 h-4" />}
                />
              )}
              <PrimaryButton
                onClick={handleBack}
                size="sm"
                variant="outline"
                leftBorder={false}
                className="flex items-center gap-1 h-[32px]"
              >
                <Icons.ArrowLeft className="w-4 h-4" />
                Back
              </PrimaryButton>
            </div>
          </div>

          {/* Text-based filters */}
          {renderFilters()}

          {/* Templates grid */}
          {filteredTemplates.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              <CreateYourOwnCard
                onCreateStory={handleCreateStory}
                className="h-full"
              />
              <NoMatchesCard onClearFilters={clearFilters} className="h-full" />
              <div className="md:col-span-2">
                <NewsletterCard
                  onOpenNewsletter={openNewsletterModal}
                  className="h-full"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              {shuffledAndPositionedItems}
            </div>
          )}

          {/* Share modal */}
          <ShareFilterModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            shareUrl={shareUrl}
          />

          {/* Newsletter Modal */}
          <NewsletterModal
            isOpen={isNewsletterModalOpen}
            onClose={closeNewsletterModal}
            onSubmit={handleSubscribe}
          />
        </div>
      </main>
    </div>
  );
}
