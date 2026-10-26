import type { Request, Response, NextFunction } from "express";
import { CSRF_FAILURE_MESSAGE, ResponseStatus } from "core/types/api.js";
import { Logger } from "shared/logger.js";

/** The cookie holding the CSRF token, which the client copies into CSRF_HEADER */
export const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "x-csrf-token";

// Requests that change nothing are not checked
const UNCHECKED_METHODS = ["GET", "HEAD", "OPTIONS"];

export type CsrfFailure =
  | "header and cookie missing"
  | "header missing"
  | "cookie missing"
  | "header and cookie differ";

/** Why a request fails the double-submit check, or null when it passes. */
export function csrfFailure(
  method: string,
  headerToken: unknown,
  cookieToken: unknown
): CsrfFailure | null {
  if (UNCHECKED_METHODS.includes(method)) return null;
  const hasHeader = typeof headerToken === "string" && headerToken !== "";
  const hasCookie = typeof cookieToken === "string" && cookieToken !== "";
  if (!hasHeader && !hasCookie) return "header and cookie missing";
  if (!hasHeader) return "header missing";
  if (!hasCookie) return "cookie missing";
  return headerToken === cookieToken ? null : "header and cookie differ";
}

/**
 * What a rejected request gets back: the message the client recognises, and
 * nothing from the request itself (no headers, cookies or token values).
 */
export const CSRF_FAILURE_BODY = {
  status: ResponseStatus.ERROR,
  errorMessage: CSRF_FAILURE_MESSAGE,
} as const;

/**
 * Rejects a state-changing request whose X-CSRF-TOKEN header doesn't match
 * its XSRF-TOKEN cookie with a 403. The log says which check failed, never
 * a token or cookie value.
 */
export function verifyCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const failure = csrfFailure(
    req.method,
    req.headers[CSRF_HEADER],
    req.cookies?.[CSRF_COOKIE]
  );
  if (!failure) {
    next();
    return;
  }

  Logger.Route.warn(`CSRF check failed (${failure}): ${req.method} ${req.path}`);
  res.status(403).json(CSRF_FAILURE_BODY);
}
