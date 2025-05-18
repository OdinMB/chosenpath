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
  GetResumableStoriesRequest,
  ResumableStoryMetadata,
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
  // headers: { // Removing default Content-Type to let Axios handle it dynamically
  //   "Content-Type": "application/json",
  // },
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

    // Only add CSRF token for non-GET requests
    if (csrfToken && config.method !== "get") {
      config.headers["X-CSRF-TOKEN"] = csrfToken;
      console.log("[CSRF] Using token:", csrfToken);
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
    const responseUrl = response.config.url || "";

    if (
      response.config.responseType === "blob" &&
      response.data instanceof Blob
    ) {
      Logger.API?.info?.(
        `Response from ${responseUrl}: ${response.status} ${response.statusText} - Blob data received (type: ${response.data.type}, size: ${response.data.size})`
      );
      return response.data;
    }

    Logger.API?.info?.(
      `Response from ${responseUrl}: ${response.status} ${
        response.statusText
      }: ${JSON.stringify(response.data).substring(0, 500)}`
    );

    if (responseUrl.includes("/health")) {
      return response;
    }

    // For successful (2xx) responses, if it's our standard API structure with data.status === SUCCESS,
    // we return response.data.data. Other 2xx responses that don't fit this (e.g. plain JSON object not wrapped)
    // would be handled by the final else block in this success handler.
    if (
      response.data &&
      typeof response.data === "object" &&
      "status" in response.data &&
      response.data.status === ResponseStatus.SUCCESS
    ) {
      const apiResponse = response.data as BaseServerResponse;
      Logger.API?.debug?.(
        `API Response status: ${apiResponse.status}, Data: ${JSON.stringify(
          apiResponse
        ).substring(0, 500)}${
          JSON.stringify(apiResponse).length > 500 ? "..." : ""
        }`
      );
      Logger.API?.debug?.(
        `Transformed data (SUCCESS): ${JSON.stringify(
          response.data.data
        ).substring(0, 500)}${
          JSON.stringify(response.data.data).length > 500 ? "..." : ""
        }`
      );
      return response.data.data; // Return just the nested 'data' payload
    } else {
      // This handles 2xx responses that are not our standard {status: "success", data: ...} format
      // OR if somehow a non-SUCCESS status (like ERROR) was sent with a 2xx HTTP code (which would be unusual).
      Logger.API?.debug?.(
        `Non-standard successful response structure or unexpected status in 2xx from ${responseUrl}: ${typeof response.data}`
      );
      // If it has a status field but it's not SUCCESS, it's an issue for a 2xx response.
      if (
        response.data &&
        response.data.status &&
        response.data.status !== ResponseStatus.SUCCESS
      ) {
        notificationService.addNotification({
          type: "error",
          title: "API Error",
          message: `Unexpected API status '${response.data.status}' in a successful HTTP response.`,
          duration: 7000,
        });
        return Promise.reject(response.data); // Reject with the problematic data.
      }
      // If it's a 2xx but not our expected wrapper, return the data as is.
      // This could be for endpoints that return direct JSON objects/arrays without the status wrapper.
      return response.data;
    }
  },
  async (error) => {
    Logger.API?.error?.(`API Error: ${error.message}`);
    if (error.response) {
      Logger.API?.error?.(
        `Status: ${error.response.status}, URL: ${
          error.config?.url || "unknown"
        }`
      );

      const apiResponse = error.response.data as BaseServerResponse; // Type assertion

      if (apiResponse && apiResponse.status) {
        switch (apiResponse.status) {
          case ResponseStatus.MODERATION_BLOCKED: {
            const moderationError = apiResponse as ModerationBlockedResponse;
            const detailedMessage = `Story creation blocked. Reason: ${moderationError.moderation.reason}`;
            notificationService.addNotification({
              type: "error",
              title: "Content Moderation",
              message: detailedMessage,
              reason: moderationError.moderation.reason, // Keep for potential richer display
              // moderationInfo: moderationError.moderation, // To use ContentModerationNotification.tsx directly
              autoClose: false,
            } as ModerationNotification);
            return Promise.reject(apiResponse); // Reject with the structured API error
          }
          case ResponseStatus.RATE_LIMITED: {
            const rateLimitError = apiResponse as RateLimitedResponse;
            notificationService.addNotification({
              type: "warning",
              title: "Rate Limit Exceeded",
              message:
                "You've reached the maximum number of requests for this action.",
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
              title: errorResponse.operationType
                ? `Error: ${errorResponse.operationType}`
                : "Error",
              message:
                errorResponse.errorMessage ||
                "An unexpected server error occurred.",
              duration: 5000,
            });
            return Promise.reject(apiResponse);
          }
          default: {
            // This case handles situations where error.response.data exists and has a 'status'
            // field, but that status isn't one of the known handled cases.
            notificationService.addNotification({
              type: "error",
              title: "API Error",
              message: `Received an unknown API status: ${apiResponse.status}. Please try again.`,
              duration: 5000,
            });
            return Promise.reject(apiResponse);
          }
        }
      }
    }

    // Fallback for CSRF token failures (which might not have error.response.data in our API format)
    // or other network errors where error.response.data is not in our standard API format.
    if (
      error.response?.status === 403 &&
      error.response?.data?.errorMessage === "Invalid CSRF token"
    ) {
      console.log("[CSRF] Token validation failed, retrying request");

      // Get the new token from the cookie
      const cookies = document.cookie.split(";");
      const csrfCookie = cookies.find((cookie) =>
        cookie.trim().startsWith("XSRF-TOKEN=")
      );
      const newToken = csrfCookie ? csrfCookie.split("=")[1] : null;

      if (newToken) {
        console.log("[CSRF] Retrying with new token:", newToken);
        // Update the request config with the new token
        const config = {
          ...error.config,
          headers: {
            ...error.config?.headers,
            "X-CSRF-TOKEN": newToken,
          },
        };
        // Retry the request
        try {
          const response = await axiosInstance(config);
          return response;
        } catch (retryError) {
          console.error("[CSRF] Retry failed:", retryError);
          // If retry fails, continue with normal error handling
        }
      }
    }

    // Generic fallback notification if none of the above specific handlers caught it.
    // This handles cases like network errors (error.response is undefined), or if error.response.data
    // isn't in the expected {status: ..., ...} format.
    const fallbackErrorMessage =
      error.response?.data?.errorMessage || // If there's a structured message from a non-standard API error
      (typeof error.response?.data === "string" ? error.response.data : null) || // If data is just a string message
      error.message || // Axios or network error message
      "An unexpected network or server error occurred.";

    notificationService.addNotification({
      type: "error",
      title: "Network/Server Error",
      message: fallbackErrorMessage,
      duration: 7000,
    });

    return Promise.reject(error); // Reject with the original Axios error if not handled by specific cases above
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

// Method to get resumable stories
export const getResumableStories = async (
  params: GetResumableStoriesRequest
): Promise<ResumableStoryMetadata[]> => {
  return apiClient.post<ResumableStoryMetadata[]>("/stories/resumable", params);
};
