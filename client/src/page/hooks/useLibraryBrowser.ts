import { useState, useEffect } from "react";
import { StoryTemplate } from "@core/types";
import { Logger } from "@common/logger";
import { groupTagsByCategories } from "@common/tag-categories";
import { sendTrackedRequest } from "@/shared/requestUtils";
import { SuccessResponse } from "@core/types/api";

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
  }, [templates, playerCountFilter, selectedTags]);

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setPlayerCountFilter(null);
    setSelectedTags([]);
  };

  const toggleShowFilters = () => {
    setShowFilters((prev) => !prev);
  };

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
  };
}
