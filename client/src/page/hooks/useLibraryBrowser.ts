import { useState, useCallback } from "react";
import { StoryTemplate } from "core/types";

interface UseLibraryBrowserProps {
  templates: StoryTemplate[];
  initialTags: string[];
  initialPlayerCount: number | null;
}

export function useLibraryBrowser({
  templates,
  initialTags,
  initialPlayerCount,
}: UseLibraryBrowserProps) {
  const [filteredTemplates, setFilteredTemplates] =
    useState<StoryTemplate[]>(templates);
  const [showFilters, setShowFilters] = useState(false);

  // Get all valid tags from templates
  const getValidTags = useCallback(() => {
    const uniqueTags = new Set<string>();
    templates.forEach((template) => {
      if (template.tags && Array.isArray(template.tags)) {
        template.tags.forEach((tag) => {
          if (tag && typeof tag === "string") {
            uniqueTags.add(tag);
          }
        });
      }
    });
    return uniqueTags;
  }, [templates]);

  // Filters
  const [playerCountFilter, setPlayerCountFilter] = useState<number | null>(
    initialPlayerCount
  );

  // Filter initialTags to only include valid tags that exist in templates
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const validTags = getValidTags();
    return (initialTags || []).filter((tag) => validTags.has(tag));
  });

  // Update URL with current filters
  const updateUrlWithFilters = useCallback(
    (
      tags: string[] = selectedTags,
      players: number | null = playerCountFilter,
      shouldClearUrl: boolean = false
    ) => {
      if (shouldClearUrl) {
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      const params = new URLSearchParams();
      const validTags = getValidTags();

      // Only include tags that actually exist in templates
      const filteredTags = tags.filter((tag) => validTags.has(tag));
      if (filteredTags && filteredTags.length > 0) {
        params.set("tags", filteredTags.join(","));
      }

      // Only add players parameter if it's a valid number
      if (
        players !== null &&
        players !== undefined &&
        !isNaN(Number(players))
      ) {
        params.set("players", String(players));
      }

      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;

      window.history.replaceState({}, "", newUrl);
    },
    [selectedTags, playerCountFilter, getValidTags]
  );

  // Apply filters when they change
  const applyFilters = useCallback(() => {
    let result = [...templates];

    if (playerCountFilter !== null) {
      result = result.filter(
        (template) =>
          playerCountFilter >= template.playerCountMin &&
          playerCountFilter <= template.playerCountMax
      );
    }

    // Get valid tags to filter against
    const validTags = getValidTags();
    const validSelectedTags = selectedTags.filter((tag) => validTags.has(tag));

    if (validSelectedTags.length > 0) {
      result = result.filter(
        (template) =>
          template.tags &&
          validSelectedTags.every((tag) => template.tags.includes(tag))
      );
    }

    setFilteredTemplates(result);

    if (playerCountFilter !== null || validSelectedTags.length > 0) {
      updateUrlWithFilters(validSelectedTags);
    } else {
      updateUrlWithFilters([], null, true);
    }
  }, [
    templates,
    playerCountFilter,
    selectedTags,
    updateUrlWithFilters,
    getValidTags,
  ]);

  const handleTagToggle = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setPlayerCountFilter(null);
    setSelectedTags([]);
    updateUrlWithFilters([], null, true);
  }, [updateUrlWithFilters]);

  const toggleShowFilters = useCallback(() => {
    setShowFilters((prev) => !prev);
  }, []);

  // Get all available player counts based on templates
  const getAvailablePlayerCounts = useCallback(() => {
    if (!templates || templates.length === 0) {
      return Array.from({ length: 10 }, (_, i) => i + 1);
    }

    const minCounts = templates.map((t) => t.playerCountMin);
    const maxCounts = templates.map((t) => t.playerCountMax);

    const minCount = Math.min(...minCounts);
    const maxCount = Math.max(...maxCounts);

    return Array.from(
      { length: maxCount - minCount + 1 },
      (_, i) => i + minCount
    );
  }, [templates]);

  return {
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
  };
}
