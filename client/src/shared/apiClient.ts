import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { API_CONFIG } from "core/config.js";
import {
  ResponseStatus,
  BaseServerResponse,
  ErrorResponse,
} from "core/types/api.js";
import { Logger } from "./logger.js";

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_CONFIG.DEFAULT_API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to include auth token in all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
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
      if (!("requestId" in config.data)) {
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

export { apiClient };
