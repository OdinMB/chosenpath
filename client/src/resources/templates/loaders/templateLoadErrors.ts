import { isRouteErrorResponse } from "react-router-dom";

/** What the template page's error screen says, and whether it offers Retry. */
export interface TemplateErrorDescription {
  title: string;
  message: string;
  /** Whether loading the page again could help: a missing template stays missing. */
  canRetry: boolean;
}

const INVALID_TEMPLATE_ERROR = "InvalidTemplateError";

/** Thrown by a template loader when the server sends a template that can't be played. */
export class InvalidTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = INVALID_TEMPLATE_ERROR;
  }
}

const NOT_AVAILABLE_TITLE = "This story template isn't available";
// A "private" template is only unlisted and its links work, so this screen
// means deleted (404) or still a draft or in review (401/403)
const NOT_AVAILABLE_MESSAGE =
  "It may have been removed, or its creator isn't sharing it right now.";

const NOT_AVAILABLE: TemplateErrorDescription = {
  title: NOT_AVAILABLE_TITLE,
  message: NOT_AVAILABLE_MESSAGE,
  canRetry: false,
};

// A draft template asks a visitor who isn't signed in to sign in; its owner may
// just be signed out
const NOT_AVAILABLE_SIGNED_OUT: TemplateErrorDescription = {
  title: NOT_AVAILABLE_TITLE,
  message: `${NOT_AVAILABLE_MESSAGE} If it's yours, sign in and open the link again.`,
  canRetry: false,
};

const INVALID: TemplateErrorDescription = {
  title: "This story template can't be played",
  message:
    "Something is wrong with how it's set up. Try another story from the library.",
  canRetry: false,
};

const CONNECTION_FAILED: TemplateErrorDescription = {
  title: "Connection failed",
  message:
    "We couldn't reach the server to load this story template. Check your internet connection and try again.",
  canRetry: true,
};

const UNKNOWN: TemplateErrorDescription = {
  title: "Something went wrong",
  message:
    "We couldn't load this story template. Please try again in a moment.",
  canRetry: true,
};

// What browsers and axios say when a request never got an answer
const NETWORK_ERROR_CODES = ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"];
const NETWORK_ERROR_MESSAGES = [
  "Network Error",
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The HTTP status behind an error, from a router response, the API client's
 * error body (which carries it as httpStatus), or an axios error.
 */
function httpStatusOf(error: unknown): number | undefined {
  if (isRouteErrorResponse(error)) return error.status;
  if (!isRecord(error)) return undefined;
  if (typeof error.httpStatus === "number") return error.httpStatus;
  if (isRecord(error.response) && typeof error.response.status === "number") {
    return error.response.status;
  }
  return undefined;
}

function isNetworkError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (typeof error.code === "string" && NETWORK_ERROR_CODES.includes(error.code)) {
    return true;
  }
  const { message } = error;
  return (
    typeof message === "string" &&
    NETWORK_ERROR_MESSAGES.some((text) => message.includes(text))
  );
}

/**
 * Turns whatever the template page's loader or render threw into plain words
 * for its error screen. Never shows the raw error text.
 */
export function describeTemplateError(error: unknown): TemplateErrorDescription {
  if (error instanceof Error && error.name === INVALID_TEMPLATE_ERROR) {
    return INVALID;
  }

  switch (httpStatusOf(error)) {
    case 400:
    case 403:
    case 404:
      return NOT_AVAILABLE;
    case 401:
      return NOT_AVAILABLE_SIGNED_OUT;
  }

  // The server's not-found body, in case it arrives without its status
  if (isRecord(error) && error.errorMessage === "Template not found") {
    return NOT_AVAILABLE;
  }

  if (isNetworkError(error)) return CONNECTION_FAILED;

  return UNKNOWN;
}
