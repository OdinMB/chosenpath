import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { v4 as uuidv4 } from "uuid";
import { API_CONFIG } from "client/config";
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
  CreateStoryInfo,
} from "core/types/api";
import { Logger } from "./logger";
import {
  ModerationNotification,
  RateLimitNotification,
} from "./notifications/notifications";
import { notificationService } from "./notifications/notificationService";
import { StoryTemplate } from "core/types/story";

// Extend axios request config to include adminAuth property
export interface AdminRequestConfig extends AxiosRequestConfig {
  adminAuth?: boolean;
}

// Type for our transformed API client
type TransformedApiClient = {
  get: <T>(url: string, config?: AxiosRequestConfig) => Promise<T>;
  post: <T>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig
  ) => Promise<T>;
  put: <T>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig
  ) => Promise<T>;
  delete: <T>(url: string, config?: AxiosRequestConfig) => Promise<T>;
  head: (url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse>;
};

// Create axios instance with default config
const axiosInstance = axios.create({
  baseURL: API_CONFIG.DEFAULT_API_URL,
  withCredentials: true, // Enable sending cookies
  headers: {
    "Content-Type": "application/json",
  },
});

// Special timeout for AI operations that take longer
export const LONG_OPERATION_TIMEOUT = 180000; // 3 minutes

// Add request interceptor to include auth token and CSRF token
axiosInstance.interceptors.request.use(
  async (config) => {
    // Log all requests
    Logger.API?.info?.(
      `Request: ${config.method?.toUpperCase() || "UNKNOWN"} ${
        config.baseURL || ""
      }${config.url || ""}`
    );

    // Get CSRF token from cookie
    const csrfToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("XSRF-TOKEN="))
      ?.split("=")[1];

    console.log("[CSRF] Current cookies:", document.cookie);
    console.log("[CSRF] Found token:", csrfToken || "none");

    if (csrfToken) {
      config.headers["X-CSRF-TOKEN"] = csrfToken;
      console.log("[CSRF] Request headers:", config.headers);
    } else {
      console.warn("[CSRF] No token available for request");
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
axiosInstance.interceptors.response.use(
  (response) => {
    // Log all server responses
    Logger.API?.info?.(
      `Response from ${response.config.url}: ${response.status} ${
        response.statusText
      }: ${JSON.stringify(response.data).substring(0, 500)}`
    );

    // Skip API response handling for health check
    if (response.config.url?.includes("/health")) {
      return response;
    }

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
          // For success responses, return just the data payload
          // Log the transformed return value
          Logger.API?.debug?.(
            `Transformed data: ${JSON.stringify(response.data.data).substring(
              0,
              500
            )}${JSON.stringify(response.data.data).length > 500 ? "..." : ""}`
          );
          return response.data.data;

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

// Cast the axios instance to our transformed type
export const apiClient = axiosInstance as unknown as TransformedApiClient;

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

// Story creation API functions
export const storyApi = {
  /**
   * Create a new story
   */
  createStory: async (data: CreateStoryRequest): Promise<CreateStoryInfo> => {
    return apiClient.post<CreateStoryResponse["data"]>("/stories", data);
  },

  /**
   * Create a story from template
   */
  createStoryFromTemplate: async (
    data: CreateStoryFromTemplateRequest
  ): Promise<CreateStoryInfo> => {
    return apiClient.post<CreateStoryResponse["data"]>(
      "/stories/template",
      data
    );
  },

  /**
   * Check story status
   */
  checkStoryStatus: async (
    storyId: string
  ): Promise<{ status: "queued" | "ready" }> => {
    return apiClient.get<{ status: "queued" | "ready" }>(
      `/stories/${storyId}/status`
    );
  },
};

export const templateApi = {
  getTemplates: async (forWelcomeScreen = false): Promise<StoryTemplate[]> => {
    return apiClient
      .get<{ templates: StoryTemplate[] }>(
        `/templates${forWelcomeScreen ? "?forWelcomeScreen=true" : ""}`
      )
      .then((response) => response.templates);
  },
  getTemplate: async (templateId: string): Promise<StoryTemplate> => {
    const response = await apiClient.get<{ template: StoryTemplate }>(
      `/templates/${templateId}`
    );
    return response.template;
  },
};
