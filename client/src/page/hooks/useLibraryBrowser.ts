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

  // Filters
  const [playerCountFilter, setPlayerCountFilter] = useState<number | null>(
    initialPlayerCount
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags || []);

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

      if (tags && tags.length > 0) {
        params.set("tags", tags.join(","));
      }

      if (players !== null) {
        params.set("players", players.toString());
      }

      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;

      window.history.replaceState({}, "", newUrl);
    },
    [selectedTags, playerCountFilter]
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

    if (selectedTags.length > 0) {
      result = result.filter(
        (template) =>
          template.tags &&
          selectedTags.every((tag) => template.tags.includes(tag))
      );
    }

    setFilteredTemplates(result);

    if (playerCountFilter !== null || selectedTags.length > 0) {
      updateUrlWithFilters();
    } else {
      updateUrlWithFilters([], null, true);
    }
  }, [templates, playerCountFilter, selectedTags, updateUrlWithFilters]);

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
    if (templates.length === 0)
      return Array.from({ length: 10 }, (_, i) => i + 1);

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
