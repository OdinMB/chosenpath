import axios, { AxiosRequestConfig } from "axios";
import { v4 as uuidv4 } from "uuid";
import { API_CONFIG } from "core/config.js";
import {
  ResponseStatus,
  BaseServerResponse,
  ErrorResponse,
} from "core/types/api.js";
import { Logger } from "./logger.js";

// Extend axios request config to include adminAuth property
interface AdminRequestConfig extends AxiosRequestConfig {
  adminAuth?: boolean;
}

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_CONFIG.DEFAULT_API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Special timeout for AI operations that take longer
export const LONG_OPERATION_TIMEOUT = 180000; // 3 minutes

// Add request interceptor to include auth token in all requests
apiClient.interceptors.request.use(
  (config) => {
    // Skip token from localStorage if adminAuth is true in config
    if (!(config as AdminRequestConfig).adminAuth) {
      const token = localStorage.getItem("authToken");
      if (token) {
        config.headers["Authorization"] = `Bearer ${token}`;
      }
    }

    // Add requestId to all requests
    if (config.method === "get") {
      // For GET requests, add requestId as query parameter
      const requestId = uuidv4();
      const url = config.url || "";
      const separator = url.includes("?") ? "&" : "?";
      config.url = `${url}${separator}requestId=${requestId}`;
    } else if (config.data && typeof config.data === "object") {
      // For other requests, add requestId to request body if not present
      // Skip for FormData objects
      if (!(config.data instanceof FormData) && !("requestId" in config.data)) {
        config.data = {
          ...config.data,
          requestId: uuidv4(),
        };
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle common response tasks
apiClient.interceptors.response.use(
  (response) => {
    // Check if the response is a valid API response
    if (
      response.data &&
      typeof response.data === "object" &&
      "status" in response.data
    ) {
      const apiResponse = response.data as BaseServerResponse;

      // Check for errors in the response
      if (
        apiResponse.status === ResponseStatus.ERROR ||
        apiResponse.status === ResponseStatus.INVALID
      ) {
        const errorResp = apiResponse as unknown as ErrorResponse;
        Logger.API?.error?.(`Error in response: ${errorResp.errorMessage}`);
        return Promise.reject(errorResp);
      }

      // Handle successful responses
      if (apiResponse.status === ResponseStatus.SUCCESS) {
        // For success responses, extract the data property from API response
        return {
          ...response,
          data: response.data.data,
        };
      }
    }

    return response;
  },
  (error) => {
    // For errors, extract the error message from API response
    if (error.response?.data?.errorMessage) {
      error.message = error.response.data.errorMessage;
    }

    return Promise.reject(error);
  }
);

// Admin API functions that use an explicit admin token
// These bypass the normal auth token from localStorage
const adminApi = {
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

export { apiClient, adminApi };
