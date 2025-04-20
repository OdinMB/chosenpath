import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { v4 as uuidv4 } from "uuid";
import {
  ClientRequest,
  ErrorResponse,
  ResponseStatus,
  BaseServerResponse,
  RateLimitedResponse,
} from "@core/types";
import { Logger } from "./logger";
import { API_CONFIG } from "@core/config";

/**
 * Type that represents a request payload with requestId
 */
export type WithRequestId<T> = T & { requestId: string };

/**
 * Helper function to add a requestId to any object
 */
export const withRequestId = <T>(obj: T): WithRequestId<T> => {
  return {
    ...obj,
    requestId: uuidv4(),
  };
};

/**
 * Extends all objects with a withRequestId method
 */
declare global {
  interface Object {
    withRequestId<T>(this: T): WithRequestId<T>;
  }
}

// Add withRequestId method to all objects
if (!Object.prototype.withRequestId) {
  Object.prototype.withRequestId = function <T>(this: T): WithRequestId<T> {
    return withRequestId(this);
  };
}

/**
 * Request options for the sendTrackedRequest function
 */
export interface RequestOptions<
  BodyType extends ClientRequest = ClientRequest
> {
  path: string;
  method: string;
  token: string;
  body?: BodyType;
}

/**
 * Type guard to check if an object has a requestId property
 */
export const hasRequestId = (obj: unknown): obj is { requestId: string } => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "requestId" in obj &&
    typeof (obj as { requestId: string }).requestId === "string"
  );
};

/**
 * Sends an API request with tracking via requestId
 * Returns the complete response including status, requestId, timestamp and data
 */
export async function sendTrackedRequest<
  ResponseType extends BaseServerResponse,
  BodyType extends ClientRequest = ClientRequest
>(options: RequestOptions<BodyType>): Promise<ResponseType> {
  const { path, method, token, body } = options;

  if (!token) {
    const errorMsg = "Invalid token for API request";
    Logger.API.error(errorMsg);
    throw new Error(errorMsg);
  }

  // For GET requests, we can't include a body
  const isGetRequest = method === "GET";

  // Add requestId to URL for GET requests
  let endpoint = `${API_CONFIG.DEFAULT_API_URL}${path}`;
  let requestId: string | undefined;

  // Create headers for request
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  // For non-GET requests, set content type and prepare body
  let requestBody: unknown;
  if (!isGetRequest) {
    headers["Content-Type"] = "application/json";

    if (!body) {
      Logger.API.warn("Request missing body for non-GET request");
    } else {
      // Check and generate requestId as needed
      requestId = hasRequestId(body) ? body.requestId : uuidv4();

      // If request didn't have requestId, add it
      if (!hasRequestId(body)) {
        requestBody = {
          ...body,
          requestId,
        };
      } else {
        requestBody = body;
      }
    }
  } else {
    // For GET requests, generate a requestId and add it to the URL
    requestId = uuidv4();
    const separator = endpoint.includes("?") ? "&" : "?";
    endpoint = `${endpoint}${separator}requestId=${requestId}`;
  }

  Logger.API.debug(`Sending ${method} request:`, {
    endpoint,
    requestId,
  });

  try {
    const requestConfig: AxiosRequestConfig = {
      method,
      url: endpoint,
      headers,
      data: requestBody,
    };

    const response = await axios(requestConfig);
    const data = response.data as ResponseType;

    Logger.API.debug("Response received:", data);

    // Validate the response structure
    if (!data || typeof data !== "object") {
      Logger.API.error("Invalid response format:", data);
      throw new Error("Invalid response format");
    }

    // Check for errors in the response
    if (
      data.status === ResponseStatus.ERROR ||
      data.status === ResponseStatus.INVALID
    ) {
      const errorResp = data as unknown as ErrorResponse;
      Logger.API.error(`Error in response: ${errorResp.errorMessage}`);
      throw errorResp;
    }

    // Check for rate limiting
    if (data.status === ResponseStatus.RATE_LIMITED) {
      const rateLimitResp = data as unknown as RateLimitedResponse;
      Logger.API.warn(
        `Rate limited: ${rateLimitResp.rateLimit.timeRemaining}ms remaining`
      );
      throw rateLimitResp;
    }

    // Check if the request IDs match for non-GET requests
    if (requestId && data.requestId !== requestId) {
      Logger.API.warn(
        `Request ID mismatch: sent ${requestId}, received ${data.requestId}`
      );
    }

    return data;
  } catch (error) {
    const axiosError = error as AxiosError;

    // If this is already a properly formed API error, just rethrow it
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status !== undefined
    ) {
      throw error;
    }

    // Otherwise create an appropriate error response
    const errorResponse: ErrorResponse = {
      status: ResponseStatus.ERROR,
      requestId: requestId || "unknown",
      timestamp: Date.now(),
      errorMessage: axiosError.message || "Network error",
      operationType: method,
    };

    Logger.API.error(`Error in ${method} request:`, axiosError);
    throw errorResponse;
  }
}
