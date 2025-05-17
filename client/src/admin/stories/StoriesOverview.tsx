import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";
import { PrimaryButton, Icons, ConfirmDialog } from "components/ui";
import { Logger } from "shared/logger";
import { adminStoryApi } from "admin/adminApi";
import {
  SortableTable,
  useTableFilterSort,
  ColumnOption,
} from "shared/components";
import { AdminStoriesListItem } from "core/types/story.js";
import { formatDate } from "core/utils/dateUtils";

export const StoriesOverview = () => {
  const stories = useLoaderData() as AdminStoriesListItem[];
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    storyId: string;
  }>({
    isOpen: false,
    storyId: "",
  });

  const handleDeleteStory = async (storyId: string) => {
    Logger.Admin.log(`Attempting to delete story: ${storyId}`);
    try {
      await adminStoryApi.deleteStory(storyId);
      Logger.Admin.log(`Successfully deleted story: ${storyId}`);
      // Use navigate to refresh the data without losing auth state
      navigate(".", { replace: true });
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

  const tableColumns: ColumnOption<AdminStoriesListItem>[] = [
    {
      key: "title",
      label: "Title",
      filterable: true,
      render: (story) => (
        <div>
          <span className={story.error ? "text-tertiary" : "font-medium"}>
            {story.title ||
              (story.error ? "Error Loading Title" : "[Untitled Story]")}
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
      key: "id" as keyof AdminStoriesListItem,
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
          onClick={() => window.location.reload()}
          variant="outline"
          leftBorder={false}
          leftIcon={<Icons.Refresh className="h-4 w-4" />}
        />
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
        emptyMessage="No stories found."
      />
    </div>
  );
};
