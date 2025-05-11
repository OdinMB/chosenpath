import { useState, useEffect, useCallback } from "react";
import { PrimaryButton, Icons, ConfirmDialog } from "components/ui";
import { Logger } from "shared/logger";
import { adminApi } from "../adminApi";
import {
  SortableTable,
  useTableFilterSort,
  ColumnOption,
} from "shared/components";

type StoryListItem = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt?: string;
  gameMode: string;
  playerCount: number;
  characterSelectionCompleted: boolean;
  maxTurns: number;
  error?: string;
  currentBeat?: number;
};

type StoriesOverviewProps = {
  token: string;
};

export const StoriesOverview = ({ token }: StoriesOverviewProps) => {
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    storyId: string;
  }>({
    isOpen: false,
    storyId: "",
  });

  const loadStories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    Logger.Admin.log("Loading stories list");

    try {
      const response = await adminApi.get("/admin/stories", token);

      Logger.Admin.log(
        `Successfully loaded ${response.data.stories.length} stories`
      );
      setStories(response.data.stories);
    } catch (error) {
      Logger.Admin.error("Failed to load stories", error);
      setError("Failed to load stories. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";

    const date = new Date(dateString);

    // Format: "2025-04-07, 9:34pm"
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    let hours = date.getHours();
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}, ${hours}:${minutes}${ampm}`;
  };

  const handleDeleteStory = async (storyId: string) => {
    Logger.Admin.log(`Attempting to delete story: ${storyId}`);
    try {
      await adminApi.delete(`/admin/stories/${storyId}`, token);

      Logger.Admin.log(`Successfully deleted story: ${storyId}`);
      // Refresh the list
      loadStories();
    } catch (error) {
      Logger.Admin.error(`Error deleting story: ${storyId}`, error);
      setError("Failed to delete story. Please try again.");
    }
  };

  const openDeleteDialog = (storyId: string) => {
    setDeleteDialog({
      isOpen: true,
      storyId,
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      isOpen: false,
      storyId: "",
    });
  };

  const tableColumns: ColumnOption<StoryListItem>[] = [
    {
      key: "title",
      label: "Title",
      filterable: true,
      render: (story) => (
        <div>
          <span className={story.error ? "text-tertiary" : "font-medium"}>
            {story.title}
          </span>
        </div>
      ),
    },
    {
      key: "playerCount",
      label: "Players",
      filterable: true,
      className: "py-3 px-4 text-left hidden md:table-cell",
    },
    {
      key: "currentBeat",
      label: "Beat",
      render: (story) => (
        <>
          {story.characterSelectionCompleted ? story.currentBeat || 1 : 0} /{" "}
          {story.maxTurns}
        </>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      className: "py-3 px-4 text-left hidden md:table-cell",
      render: (story) => formatDate(story.createdAt || story.updatedAt),
    },
    {
      key: "updatedAt",
      label: "Updated",
      render: (story) => formatDate(story.updatedAt),
    },
    {
      key: "id" as keyof StoryListItem,
      label: "Actions",
      sortable: false,
      filterable: false,
      render: (story) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openDeleteDialog(story.id)}
            className="text-tertiary hover:text-tertiary-700 transition-colors"
            title="Delete story"
          >
            <Icons.Trash className="h-5 w-5" />
          </button>
        </div>
      ),
    },
  ];

  const {
    filteredAndSortedData: filteredStories,
    sortConfig,
    filters,
    requestSort,
    addFilter,
    removeFilter,
    clearFilters,
  } = useTableFilterSort({
    data: stories,
    initialSort: { key: "updatedAt", direction: "desc" },
  });

  return (
    <div className="bg-gray-50 pt-4 rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-secondary">Stored Stories</h2>
        <PrimaryButton
          onClick={loadStories}
          variant="outline"
          leftBorder={false}
          disabled={isLoading}
          leftIcon={<Icons.Refresh className="h-4 w-4" />}
        ></PrimaryButton>
      </div>

      {error && (
        <div className="mb-4 flex items-center rounded-md bg-tertiary-100 p-4 text-sm text-tertiary">
          <Icons.Error className="mr-2 h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={closeDeleteDialog}
        onConfirm={() => handleDeleteStory(deleteDialog.storyId)}
        title="Delete Story"
        message="Are you sure you want to delete this story? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

      <SortableTable
        data={filteredStories}
        columns={tableColumns}
        filters={filters}
        sortConfig={sortConfig}
        onSort={requestSort}
        onFilter={addFilter}
        onRemoveFilter={removeFilter}
        onClearFilters={clearFilters}
        isLoading={isLoading}
        emptyMessage="No stories found."
      />
    </div>
  );
};
