import { useState, useEffect, useCallback } from "react";
import { PrimaryButton, Icons, ConfirmDialog } from "components/ui";
import { Logger } from "shared/logger";
import { adminApi } from "shared/apiClient";
import {
  SortableTable,
  useTableFilterSort,
  ColumnOption,
} from "shared/components";
import { PublicUser } from "core/types/user";

type UserListItem = PublicUser & {
  lastLoginAt?: number;
};

type UsersOverviewProps = {
  token: string;
};

export const UsersOverview = ({ token }: UsersOverviewProps) => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    userId: string;
  }>({
    isOpen: false,
    userId: "",
  });

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    Logger.Admin.log("Loading users list");

    try {
      const response = await adminApi.get("/admin/users", token);

      Logger.Admin.log(
        `Successfully loaded ${response.data.users.length} users`
      );
      setUsers(response.data.users);
    } catch (error) {
      Logger.Admin.error("Failed to load users", error);
      setError("Failed to load users. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Never";

    const date = new Date(timestamp);

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

  const handleDeleteUser = async (userId: string) => {
    Logger.Admin.log(`Attempting to delete user: ${userId}`);
    try {
      await adminApi.delete(`/admin/users/${userId}`, token);

      Logger.Admin.log(`Successfully deleted user: ${userId}`);
      // Refresh the list
      loadUsers();
    } catch (error) {
      Logger.Admin.error(`Error deleting user: ${userId}`, error);
      setError("Failed to delete user. Please try again.");
    }
  };

  const openDeleteDialog = (userId: string) => {
    setDeleteDialog({
      isOpen: true,
      userId,
    });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({
      isOpen: false,
      userId: "",
    });
  };

  const tableColumns: ColumnOption<UserListItem>[] = [
    {
      key: "username",
      label: "Username",
      filterable: true,
    },
    {
      key: "email",
      label: "Email",
      filterable: true,
    },
    {
      key: "createdAt",
      label: "Registered",
      render: (user) => formatDate(user.createdAt),
    },
    {
      key: "lastLoginAt",
      label: "Last Login",
      render: (user) => formatDate(user.lastLoginAt),
    },
    {
      key: "id" as keyof UserListItem,
      label: "Actions",
      sortable: false,
      filterable: false,
      render: (user) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openDeleteDialog(user.id)}
            className="text-tertiary hover:text-tertiary-700 transition-colors"
            title="Delete user"
          >
            <Icons.Trash className="h-5 w-5" />
          </button>
        </div>
      ),
    },
  ];

  const {
    filteredAndSortedData: filteredUsers,
    sortConfig,
    filters,
    requestSort,
    addFilter,
    removeFilter,
    clearFilters,
  } = useTableFilterSort({
    data: users,
    initialSort: { key: "createdAt", direction: "desc" },
  });

  return (
    <div className="bg-gray-50 pt-4 rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-secondary">
          Registered Users
        </h2>
        <PrimaryButton
          onClick={loadUsers}
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
        onConfirm={() => handleDeleteUser(deleteDialog.userId)}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone and will remove all associated data."
        confirmText="Delete"
        cancelText="Cancel"
      />

      <SortableTable
        data={filteredUsers}
        columns={tableColumns}
        filters={filters}
        sortConfig={sortConfig}
        onSort={requestSort}
        onFilter={addFilter}
        onRemoveFilter={removeFilter}
        onClearFilters={clearFilters}
        isLoading={isLoading}
        emptyMessage="No users found."
      />
    </div>
  );
};
