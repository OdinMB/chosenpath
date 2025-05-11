import { apiClient } from "shared/apiClient.ts";
import type { AdminRequestConfig } from "shared/apiClient.ts";
import type { AxiosRequestConfig } from "axios";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "shared/logger";

// Admin API functions that use an explicit admin token
// These bypass the normal auth token from localStorage
export const adminApi = {
  get: (url: string, adminToken: string, config: AxiosRequestConfig = {}) => {
    return apiClient.get(url, {
      ...config,
      adminAuth: true,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${adminToken}`,
      },
    } as AdminRequestConfig);
  },

  post: <T>(
    url: string,
    data: T,
    adminToken: string,
    config: AxiosRequestConfig = {}
  ) => {
    return apiClient.post(url, data, {
      ...config,
      adminAuth: true,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${adminToken}`,
      },
    } as AdminRequestConfig);
  },

  put: <T>(
    url: string,
    data: T,
    adminToken: string,
    config: AxiosRequestConfig = {}
  ) => {
    return apiClient.put(url, data, {
      ...config,
      adminAuth: true,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${adminToken}`,
      },
    } as AdminRequestConfig);
  },

  delete: (
    url: string,
    adminToken: string,
    config: AxiosRequestConfig = {}
  ) => {
    return apiClient.delete(url, {
      ...config,
      adminAuth: true,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${adminToken}`,
      },
    } as AdminRequestConfig);
  },

  // Special method for uploading files with FormData
  upload: (
    url: string,
    formData: FormData,
    adminToken: string,
    config: AxiosRequestConfig = {}
  ) => {
    // Log file details for debugging
    let fileInfo = "";
    for (const pair of formData.entries()) {
      if (pair[1] instanceof File) {
        const file = pair[1] as File;
        fileInfo = `Field: ${pair[0]}, Filename: ${file.name}, Size: ${file.size}, Type: ${file.type}`;
        Logger.API?.debug?.(`Uploading file: ${fileInfo}`);
      }
    }

    // For FormData uploads, we need special handling
    const uploadConfig: AdminRequestConfig = {
      ...config,
      adminAuth: true,
      // For FormData containing files, do NOT set Content-Type manually
      // axios will set it correctly with the multipart boundary
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      params: {
        ...config.params,
        requestId: uuidv4(), // Add requestId as query param for FormData
      },
    };

    // Copy any additional headers except Content-Type
    if (config.headers) {
      uploadConfig.headers = {
        ...uploadConfig.headers,
        ...Object.entries(config.headers)
          .filter(([key]) => key.toLowerCase() !== "content-type")
          .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
      };
    }

    // Critical for FormData uploads:
    // 1. Don't transform the FormData
    uploadConfig.transformRequest = undefined;

    // Log the request for debugging
    Logger.API?.debug?.(
      `Uploading FormData to ${url} with adminApi, contains file: ${!!fileInfo}`
    );

    return apiClient.post(url, formData, uploadConfig);
  },
};

export const adminUsersApi = {
  getUsers: async (): Promise<PublicUser[]> => {
    return apiClient
      .get<{ users: PublicUser[] }>(`/users`)
      .then((response) => response.users);
  },
};
