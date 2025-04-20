import { v4 as uuidv4 } from "uuid";
import {
  ResponseStatus,
  BaseServerResponse,
  ErrorResponse,
  RateLimitedResponse,
  ClientRequest,
} from "@core/types/api";
import { Logger } from "@common/logger";
import { config } from "@/config";

/**
 * Type that represents a request payload with requestId
 */
export type WithRequestId<T> = T & { requestId: string };

/**
 * Helper function to add a requestId to any object
 */
export function withRequestId<T>(data: T): WithRequestId<T> {
  return {
    ...(data as object),
    requestId: uuidv4(),
  } as WithRequestId<T>;
}

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
interface RequestOptions<BodyType extends ClientRequest = ClientRequest> {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  token: string;
  body?: BodyType;
}

/**
 * Type guard to check if an object has a requestId property
 */
function hasRequestId(obj: unknown): obj is { requestId: string } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "requestId" in obj &&
    typeof (obj as { requestId: unknown }).requestId === "string"
  );
}

/**
 * Sends an API request with tracking via requestId
 * Returns the complete response including status, requestId, timestamp and data
 */
export const sendTrackedRequest = async <
  ResponseType extends BaseServerResponse,
  BodyType extends ClientRequest = ClientRequest
>(
  options: RequestOptions<BodyType>
): Promise<ResponseType> => {
  const { path, method = "POST", token, body } = options;

  if (!token) {
    const errorMsg = "Invalid token for API request";
    Logger.Admin.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!body) {
    Logger.Admin.warn("Request missing body");
    throw new Error("Request body is required");
  }

  // Use the body as is - requestId should be added by the caller
  const requestData = body;
  let requestId: string | undefined;

  if (hasRequestId(requestData)) {
    requestId = requestData.requestId;
  } else {
    Logger.Admin.warn("Request missing requestId");
  }

  const endpoint = `${config.apiUrl}${path}`;

  Logger.Admin.log(`Sending ${method} request:`, {
    endpoint,
    requestId,
  });

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestData),
    });

    const data = (await response.json()) as BaseServerResponse;
    Logger.Admin.log("Response received:", data);

    // Check for rate limiting
    if (data.status === ResponseStatus.RATE_LIMITED) {
      const rateLimitData = data as RateLimitedResponse;
      const rateLimitMsg = `Rate limited: Please try again in ${Math.ceil(
        rateLimitData.rateLimit.timeRemaining / 1000
      )} seconds`;
      Logger.Admin.error(rateLimitMsg, rateLimitData.rateLimit);
      throw new Error(rateLimitMsg);
    }

    // Check for error response
    if (
      data.status === ResponseStatus.ERROR ||
      data.status === ResponseStatus.INVALID
    ) {
      const errorData = data as ErrorResponse;
      const errorMsg =
        errorData.errorMessage || `Request failed with status: ${data.status}`;
      Logger.Admin.error(errorMsg, errorData);
      throw new Error(errorMsg);
    }

    // Check if the response is not a success
    if (data.status !== ResponseStatus.SUCCESS) {
      const errorMsg = `Request failed with status: ${data.status}`;
      Logger.Admin.error(errorMsg, data);
      throw new Error(errorMsg);
    }

    // No need to validate if data.data exists since we're returning the whole response

    // Check if the request IDs match
    if (requestId && data.requestId !== requestId) {
      Logger.Admin.warn(
        `Request ID mismatch: sent ${requestId}, received ${data.requestId}`
      );
    }

    return data as ResponseType;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    Logger.Admin.error(`Error in ${method} request:`, errorMsg);
    throw error;
  }
};
