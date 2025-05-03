import { useState, useEffect, useCallback } from "react";
import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";
import { groupTagsByCategories } from "shared/tagCategories";
import { sendTrackedRequest } from "shared/utils/requestUtils";
import { SuccessResponse } from "core/types/api";

export function useLibraryBrowser() {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<StoryTemplate[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [playerCountFilter, setPlayerCountFilter] = useState<number | null>(
    null
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagCategories, setTagCategories] = useState<Record<string, string[]>>(
    {}
  );

  // Update URL with current filters - memoize this function first
  const updateUrlWithFilters = useCallback(
    (
      tags: string[] = selectedTags,
      players: number | null = playerCountFilter,
      shouldClearUrl: boolean = false
    ) => {
      // If shouldClearUrl is true, just clear URL params and return
      if (shouldClearUrl) {
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      const params = new URLSearchParams();

      // Add tags parameter if tags are selected
      if (tags && tags.length > 0) {
        params.set("tags", tags.join(","));
      }

      // Add player count parameter if set
      if (players !== null) {
        params.set("players", players.toString());
      }

      // Update URL without reloading the page
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;

      window.history.replaceState({}, "", newUrl);
    },
    [selectedTags, playerCountFilter]
  );

  // We no longer parse URL parameters directly here
  // Instead, we rely on the initialSelectedTags passed from LibraryBrowser component
  // The URL params are now handled at the App level

  // Function to set initial tags without showing filters
  const setInitialTags = useCallback((tagNames: string[]) => {
    if (!tagNames || tagNames.length === 0) return;

    const validTags = tagNames.filter((tag) => tag && tag.trim() !== "");
    if (validTags.length === 0) return;

    Logger.App.log(`Setting initial tag filters: ${validTags.join(", ")}`);

    // Add tags to selected tags if they're not already there
    setSelectedTags((prev) => {
      const newTags = [...prev];
      let changed = false;

      validTags.forEach((tag) => {
        if (!newTags.includes(tag)) {
          newTags.push(tag);
          changed = true;
        }
      });

      return changed ? newTags : prev;
    });

    // Don't update URL when setting initial tags from app component
    // updateUrlWithFilters(validTags, playerCountFilter);
  }, []);

  // Function to set a single initial tag (for backward compatibility)
  const setInitialTag = useCallback(
    (tagName: string) => {
      if (!tagName || tagName.trim() === "") return;
      setInitialTags([tagName]);
    },
    [setInitialTags]
  );

  // Fetch published templates
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch all published templates (not just for welcome screen)
        const response = await sendTrackedRequest<
          SuccessResponse<{ templates: StoryTemplate[] }>
        >({
          path: `/templates`,
          method: "GET",
          token: "", // Public endpoint doesn't need token
        });

        Logger.App.log(
          `Loaded ${response.data.templates.length} templates for library`
        );

        // Extract all unique tags
        const uniqueTags = new Set<string>();
        response.data.templates.forEach((template: StoryTemplate) => {
          if (template.tags) {
            template.tags.forEach((tag) => uniqueTags.add(tag));
          }
        });

        const allTagsArray = Array.from(uniqueTags).sort();

        // Group tags by categories
        setTagCategories(groupTagsByCategories(allTagsArray));

        setTemplates(response.data.templates);
        setFilteredTemplates(response.data.templates);
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

    // Update URL when filters change, but only if we have active filters
    if (playerCountFilter !== null || selectedTags.length > 0) {
      updateUrlWithFilters();
    } else {
      // If no filters are active, clear the URL
      updateUrlWithFilters([], null, true);
    }
  }, [templates, playerCountFilter, selectedTags, updateUrlWithFilters]);

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setPlayerCountFilter(null);
    setSelectedTags([]);
    // Clear URL parameters when filters are cleared
    updateUrlWithFilters([], null, true);
  };

  const toggleShowFilters = () => {
    setShowFilters((prev) => !prev);
  };

  // Get all available player counts based on templates
  const getAvailablePlayerCounts = useCallback(() => {
    // Find min and max possible player counts from all templates
    if (templates.length === 0)
      return Array.from({ length: 10 }, (_, i) => i + 1);

    const minCounts = templates.map((t) => t.playerCountMin);
    const maxCounts = templates.map((t) => t.playerCountMax);

    const minCount = Math.min(...minCounts);
    const maxCount = Math.max(...maxCounts);

    // Generate array of all possible player counts
    return Array.from(
      { length: maxCount - minCount + 1 },
      (_, i) => i + minCount
    );
  }, [templates]);

  return {
    templates,
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
  };
}
