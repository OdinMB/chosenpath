import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";
import { Icons, ConfirmDialog } from "components/ui";
import { Logger } from "shared/logger";
import { adminFeedbackApi } from "../../admin/adminApi";
import {
  SortableTable,
  useTableFilterSort,
  ColumnOption,
} from "shared/components";
import { FeedbackItem } from "core/types/api.js";
import { formatDate } from "shared/utils/timeUtils";

export const FeedbackOverview = () => {
  const feedback = useLoaderData() as FeedbackItem[];
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    feedbackId: string;
  }>({
    isOpen: false,
    feedbackId: "",
  });

  const handleDeleteFeedback = async (feedbackId: string) => {
    Logger.Admin.log(`Attempting to delete feedback: ${feedbackId}`);
    try {
      await adminFeedbackApi.deleteFeedback(feedbackId);
      Logger.Admin.log(`Successfully deleted feedback: ${feedbackId}`);
      // Use navigate to refresh the data without losing auth state
      navigate(".", { replace: true });
    } catch (error) {
      Logger.Admin.error(`Error deleting feedback: ${feedbackId}`, error);
      setError("Failed to delete feedback. Please try again.");
    }
  };

  const openDeleteDialog = (feedbackId: string) => {
    setDeleteDialog({
      isOpen: true,
      feedbackId,
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      isOpen: false,
      feedbackId: "",
    });
  };

  const getFeedbackTypeDisplay = (type: string) => {
    switch (type) {
      case "beat":
        return "Beat";
      case "general":
        return "General";
      case "issue":
        return "Issue";
      case "suggestion":
        return "Suggestion";
      default:
        return type;
    }
  };

  const getRatingDisplay = (rating: string | null) => {
    if (!rating) return "N/A";
    return rating === "positive" ? (
      <span className="text-green-600 font-medium">👍 Positive</span>
    ) : (
      <span className="text-red-600 font-medium">👎 Negative</span>
    );
  };

  const tableColumns: ColumnOption<FeedbackItem>[] = [
    {
      key: "type",
      label: "Type",
      filterable: true,
      sortable: true,
      render: (item) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {getFeedbackTypeDisplay(item.type)}
        </span>
      ),
    },
    {
      key: "rating",
      label: "Rating",
      filterable: true,
      sortable: true,
      className: "py-3 px-4 text-left hidden md:table-cell",
      render: (item) => getRatingDisplay(item.rating),
    },
    {
      key: "comment",
      label: "Comment",
      filterable: true,
      render: (item) => (
        <div className="max-w-xs">
          <p className="text-sm text-gray-900 truncate" title={item.comment}>
            {item.comment.length > 100
              ? `${item.comment.substring(0, 100)}...`
              : item.comment}
          </p>
        </div>
      ),
    },
    {
      key: "username",
      label: "User",
      filterable: true,
      className: "py-3 px-4 text-left hidden lg:table-cell",
      render: (item) => (
        <span className="text-sm">{item.username || "Anonymous"}</span>
      ),
    },
    {
      key: "storyTitle",
      label: "Story",
      filterable: true,
      className: "py-3 px-4 text-left hidden lg:table-cell",
      render: (item) => (
        <span className="text-sm" title={item.storyTitle || "N/A"}>
          {item.storyTitle
            ? item.storyTitle.length > 30
              ? `${item.storyTitle.substring(0, 30)}...`
              : item.storyTitle
            : "N/A"}
        </span>
      ),
    },
    {
      key: "createdAt",
      label: "Submitted",
      className: "py-3 px-4 text-left whitespace-nowrap",
      sortable: true,
      render: (item) => formatDate(item.createdAt),
    },
    {
      key: "id",
      label: "Actions",
      sortable: false,
      filterable: false,
      render: (item) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openDeleteDialog(item.id)}
            className="text-tertiary hover:text-tertiary-700 transition-colors"
            title="Delete feedback"
          >
            <Icons.Trash className="h-5 w-5" />
          </button>
        </div>
      ),
    },
  ];

  const {
    filteredAndSortedData: filteredFeedback,
    sortConfig,
    filters,
    requestSort,
    addFilter,
    removeFilter,
    clearFilters,
  } = useTableFilterSort({
    data: feedback,
    initialSort: { key: "createdAt", direction: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-secondary">Feedback</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage user feedback submissions and reports.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <Icons.Error className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  type="button"
                  className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100"
                  onClick={() => setError(null)}
                >
                  <Icons.Close className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SortableTable
        data={filteredFeedback}
        columns={tableColumns}
        sortConfig={sortConfig}
        onSort={requestSort}
        filters={filters}
        onFilter={addFilter}
        onRemoveFilter={removeFilter}
        onClearFilters={clearFilters}
        emptyMessage="No feedback submissions found"
      />

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={closeDeleteDialog}
        onConfirm={() => {
          handleDeleteFeedback(deleteDialog.feedbackId);
          closeDeleteDialog();
        }}
        title="Delete Feedback"
        message="Are you sure you want to delete this feedback submission? This action cannot be undone."
        confirmText="Delete"
      />
    </div>
  );
};
