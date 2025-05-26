import { apiClient } from "../apiClient";
import {
  RegisterUserRequest,
  RegisterUserResponse,
  LoginUserRequest,
  LoginUserResponse,
  GetCurrentUserResponse,
  LogoutUserResponse,
  PasswordUpdateRequest,
  PasswordUpdateResponse,
  PublicUser,
} from "core/types";

export const authApi = {
  /**
   * Register a new user
   */
  register: async (data: RegisterUserRequest): Promise<PublicUser> => {
    return apiClient.post<RegisterUserResponse["data"]>("/auth/register", data);
  },

  /**
   * Login a user
   */
  login: async (
    data: LoginUserRequest
  ): Promise<{
    user: PublicUser;
    token: string;
    expiresAt: number;
  }> => {
    return apiClient.post<LoginUserResponse["data"]>("/auth/login", data);
  },

  /**
   * Get current user
   */
  getCurrentUser: async (): Promise<PublicUser | null> => {
    const response = await apiClient.get<GetCurrentUserResponse["data"]>(
      "/auth/me"
    );
    return response.user;
  },

  /**
   * Logout current user
   */
  logout: async (): Promise<void> => {
    await apiClient.post<LogoutUserResponse["data"]>("/auth/logout", {});
  },

  /**
   * Update user password
   */
  updatePassword: async (data: PasswordUpdateRequest): Promise<void> => {
    await apiClient.post<PasswordUpdateResponse["data"]>(
      "/auth/password",
      data
    );
  },
};
