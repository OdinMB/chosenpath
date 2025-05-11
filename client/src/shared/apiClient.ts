import axios, { AxiosRequestConfig } from "axios";
import { v4 as uuidv4 } from "uuid";
import { API_CONFIG } from "core/config";
import {
  ResponseStatus,
  BaseServerResponse,
  ErrorResponse,
  UserStoryCodesResponse,
  UserStoriesResponse,
  AssociateStoryCodeRequest,
  CreateStoryRequest,
  CreateStoryResponse,
  CreateStoryFromTemplateRequest,
  RateLimitedResponse,
  ModerationBlockedResponse,
} from "core/types/api";
import { Logger } from "./logger";
import {
  ModerationNotification,
  RateLimitNotification,
} from "./notifications/notifications";
import { notificationService } from "./notifications/notificationService";

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
    // Log all requests
    Logger.API?.info?.(
      `Request: ${config.method?.toUpperCase() || "UNKNOWN"} ${
        config.baseURL || ""
      }${config.url || ""}`
    );

    // Skip token from localStorage if adminAuth is true in config
    if (!(config as AdminRequestConfig).adminAuth) {
      const token = localStorage.getItem("authToken");
      if (token) {
        config.headers["Authorization"] = `Bearer ${token}`;
      }
    }

    // Add requestId to all requests
    let requestId = uuidv4();
    if (config.method === "get") {
      // For GET requests, add requestId as query parameter
      const url = config.url || "";
      const separator = url.includes("?") ? "&" : "?";
      config.url = `${url}${separator}requestId=${requestId}`;
    } else if (config.data && typeof config.data === "object") {
      // For other requests, add requestId to request body if not present
      // Skip for FormData objects
      if (!(config.data instanceof FormData) && !("requestId" in config.data)) {
        requestId = uuidv4();
        config.data = {
          ...config.data,
          requestId,
        };
      } else if (config.data instanceof FormData) {
        // Don't modify FormData but we can log it
        Logger.API?.debug?.("Request contains FormData");
      }
    }

    // Log request details including the generated requestId
    Logger.API?.debug?.(
      `Request details - ID: ${requestId}, Headers: ${JSON.stringify(
        config.headers
      )}`
    );

    // Log request payload for non-GET requests if it's not too large
    if (config.data && config.method !== "get") {
      const dataToLog =
        config.data instanceof FormData
          ? "[FormData]"
          : JSON.stringify(config.data).substring(0, 500) +
            (JSON.stringify(config.data).length > 500 ? "..." : "");
      Logger.API?.debug?.(`Request payload: ${dataToLog}`);
    }

    return config;
  },
  (error) => {
    // Log request errors
    Logger.API?.error?.(`Request error: ${error.message}`);
    return Promise.reject(error);
  }
);

// Add response interceptor to handle common response tasks
apiClient.interceptors.response.use(
  (response) => {
    // Log all server responses
    Logger.API?.info?.(
      `Response from ${response.config.url}: ${response.status} ${
        response.statusText
      }: ${JSON.stringify(response.data).substring(0, 500)}`
    );

    // Check if the response is a valid API response
    if (
      response.data &&
      typeof response.data === "object" &&
      "status" in response.data
    ) {
      const apiResponse = response.data as BaseServerResponse;

      // Log the API response status and data structure
      Logger.API?.debug?.(
        `API Response status: ${apiResponse.status}, Data: ${JSON.stringify(
          apiResponse
        ).substring(0, 500)}${
          JSON.stringify(apiResponse).length > 500 ? "..." : ""
        }`
      );

      // Handle different response statuses
      switch (apiResponse.status) {
        case ResponseStatus.SUCCESS:
          // For success responses, extract the data property from API response
          return {
            ...response,
            data: response.data.data,
          };

        case ResponseStatus.MODERATION_BLOCKED: {
          const moderationError = apiResponse as ModerationBlockedResponse;
          notificationService.addNotification({
            type: "error",
            title: "Content Moderation",
            message: "Your content was flagged by our moderation system.",
            reason: moderationError.moderation.reason,
            autoClose: false,
          } as ModerationNotification);
          return Promise.reject(apiResponse);
        }

        case ResponseStatus.RATE_LIMITED: {
          const rateLimitError = apiResponse as RateLimitedResponse;
          notificationService.addNotification({
            type: "warning",
            title: "Rate Limit Exceeded",
            message: "You've reached the maximum number of requests.",
            timeRemaining: rateLimitError.rateLimit.timeRemaining,
            autoClose: false,
          } as RateLimitNotification);
          return Promise.reject(apiResponse);
        }

        case ResponseStatus.ERROR:
        case ResponseStatus.INVALID: {
          const errorResponse = apiResponse as ErrorResponse;
          notificationService.addNotification({
            type: "error",
            title: "Error",
            message:
              errorResponse.errorMessage || "An unexpected error occurred.",
            duration: 5000,
          });
          return Promise.reject(apiResponse);
        }

        default: {
          // Add notification for unknown status
          notificationService.addNotification({
            type: "error",
            title: "Error",
            message: "An unexpected error occurred.",
            duration: 5000,
          });
          return Promise.reject({
            status: ResponseStatus.ERROR,
            errorMessage: "Unknown response status",
            requestId: apiResponse.requestId,
            timestamp: apiResponse.timestamp,
          } as ErrorResponse);
        }
      }
    } else {
      // Log non-standard responses
      Logger.API?.debug?.(
        `Non-standard response structure: ${typeof response.data}`
      );
      // Add notification for invalid response format
      notificationService.addNotification({
        type: "error",
        title: "Error",
        message: "Invalid response format",
        duration: 5000,
      });
      // For non-standard responses, reject with a generic error
      return Promise.reject({
        status: ResponseStatus.ERROR,
        errorMessage: "Invalid response format",
        requestId: uuidv4(),
        timestamp: Date.now(),
      } as ErrorResponse);
    }
  },
  (error) => {
    // Log error responses
    Logger.API?.error?.(`API Error: ${error.message}`);
    if (error.response) {
      Logger.API?.error?.(
        `Status: ${error.response.status}, URL: ${
          error.config?.url || "unknown"
        }`
      );
    }

    // For errors, extract the error message from API response
    const errorMessage = error.response?.data?.errorMessage || error.message;

    // Add notification for network/other errors
    notificationService.addNotification({
      type: "error",
      title: "Error",
      message: errorMessage || "An unexpected error occurred.",
      duration: 5000,
    });

    return Promise.reject(error);
  }
);

// User story API functions
export const userStoriesApi = {
  /**
   * Get all story codes associated with the current user
   */
  getStoryCodes: () => {
    return apiClient.get<UserStoryCodesResponse>("/users/story-codes");
  },

  /**
   * Associate a story code with the current user
   */
  associateStoryCode: (data: AssociateStoryCodeRequest) => {
    return apiClient.post("/users/story-codes", data);
  },

  /**
   * Get all stories created by the current user
   */
  getUserStories: () => {
    return apiClient.get<UserStoriesResponse>("/users/stories");
  },

  /**
   * Get all stories where the current user is a player (has a code)
   */
  getPlayerStories: () => {
    return apiClient.get<UserStoriesResponse>("/users/player-stories");
  },

  /**
   * Get all stories related to the current user (both as creator and player)
   */
  getAllUserStories: () => {
    return apiClient.get<UserStoriesResponse>("/users/all-stories");
  },
};

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

// Story creation API functions
export const storyApi = {
  /**
   * Create a new story
   */
  createStory: (data: CreateStoryRequest) => {
    return apiClient.post<CreateStoryResponse>("/stories", data);
  },

  /**
   * Create a story from template
   */
  createStoryFromTemplate: (data: CreateStoryFromTemplateRequest) => {
    return apiClient.post<CreateStoryResponse>("/stories/template", data);
  },

  /**
   * Check story status
   */
  checkStoryStatus: (storyId: string) => {
    return apiClient.get<{ status: "queued" | "ready" }>(
      `/stories/${storyId}/status`
    );
  },
};

export { apiClient, adminApi };
