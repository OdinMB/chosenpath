import { adminUsersApi } from "../adminApi";
import { UserListItem } from "core/types";
import { Logger } from "shared/logger";

export type { UserListItem };

export interface UsersLoaderData {
  users: UserListItem[];
}

export async function adminUsersLoader(): Promise<UsersLoaderData> {
  try {
    const users = await adminUsersApi.getUsers();
    return { users };
  } catch (error) {
    Logger.Admin.error("Failed to load users", error);
    throw error; // Let React Router handle the error
  }
}
