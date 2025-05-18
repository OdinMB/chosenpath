import { useState } from "react";
import { PrimaryButton, Icons, ConfirmDialog } from "components/ui";
import { Logger } from "shared/logger";
import { adminUsersApi } from "admin/adminApi";
import {
  SortableTable,
  useTableFilterSort,
  ColumnOption,
} from "shared/components";
import { formatDate } from "shared/utils/timeUtils";
import { useLoaderData, useNavigate } from "react-router-dom";
import { UserListItem, UsersLoaderData } from "./usersLoader";

export const UsersOverview = () => {
  const { users: initialUsers } = useLoaderData() as UsersLoaderData;
  const [users, setUsers] = useState<UserListItem[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    userId: string;
  }>({
    isOpen: false,
    userId: "",
  });
  const navigate = useNavigate();

  const handleDeleteUser = async (userId: string) => {
    Logger.Admin.log(`Attempting to delete user: ${userId}`);
    try {
      await adminUsersApi.deleteUser(userId);
      Logger.Admin.log(`Successfully deleted user: ${userId}`);
      // Update the local state
      setUsers(users.filter((user) => user.id !== userId));
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
      render: (user) => formatDate(user.lastLoginAt ?? undefined),
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
    <div className="pt-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-secondary">
          Registered Users
        </h2>
        <PrimaryButton
          onClick={() => navigate(".", { replace: true })}
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
        emptyMessage="No users found."
      />
    </div>
  );
};
