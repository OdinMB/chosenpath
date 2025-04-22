import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  ResponseStatus,
  ErrorResponse,
  SuccessResponse,
  RateLimitedResponse,
  RateLimitInfo,
} from "core/types/api.js";
import { Logger } from "common/logger.js";

/**
 * Get request path from Express response object
 */
function getRequestPath(res: Response): string {
  return res.req?.originalUrl || "unknown path";
}

/**
 * Create and send a success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  requestId?: string,
  statusCode = 200
): void {
  const id = requestId || uuidv4();
  const path = getRequestPath(res);
  const response: SuccessResponse<T> = {
    status: ResponseStatus.SUCCESS,
    requestId: id,
    timestamp: Date.now(),
    data,
  };

  // Log success response
  Logger.Route.log(`Success [${id}] (${statusCode}) - ${path}`);

  res.status(statusCode).json(response);
}

/**
 * Create and send an error response
 */
export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  requestId?: string,
  error?: unknown
): void {
  const id = requestId || uuidv4();
  const path = getRequestPath(res);

  // Log the error
  if (error) {
    Logger.Route.error(
      `Error [${id}] (${statusCode}) - ${message} - ${path}`,
      error
    );
  } else {
    Logger.Route.error(`Error [${id}] (${statusCode}) - ${message} - ${path}`);
  }

  const response: ErrorResponse = {
    status: statusCode === 400 ? ResponseStatus.INVALID : ResponseStatus.ERROR,
    requestId: id,
    timestamp: Date.now(),
    errorMessage: message,
    // Use the path as operationType to provide context
    operationType: path.split("?")[0], // remove query params
  };

  res.status(statusCode).json(response);
}

/**
 * Create and send a rate limited response
 */
export function sendRateLimited(
  res: Response,
  rateLimit: RateLimitInfo,
  requestId?: string
): void {
  const id = requestId || uuidv4();
  const path = getRequestPath(res);
  const response: RateLimitedResponse = {
    status: ResponseStatus.RATE_LIMITED,
    requestId: id,
    timestamp: Date.now(),
    rateLimit,
  };

  // Log rate limit response
  Logger.Route.log(
    `Rate limited [${id}] - Remaining: ${
      rateLimit.requestsRemaining
    }, Reset: ${Math.ceil(rateLimit.timeRemaining / 1000)}s - ${path}`
  );

  res.status(429).json(response);
}

/**
 * Create and send a not found error response
 */
export function sendNotFound(
  res: Response,
  message: string,
  requestId?: string
): void {
  sendError(res, message, 404, requestId);
}

/**
 * Create and send a bad request error response
 */
export function sendBadRequest(
  res: Response,
  message: string,
  requestId?: string
): void {
  sendError(res, message, 400, requestId);
}
