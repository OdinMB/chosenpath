import { CSRF_FAILURE_MESSAGE, ResponseStatus } from "core/types/api";

/** The title and message of the pop-up the API client shows when a request fails. */
export interface ApiErrorDescription {
  title: string;
  message: string;
}

const SOMETHING_WENT_WRONG = "Something went wrong";
const TRY_AGAIN_SOON =
  "We couldn't finish that just now. Please try again in a moment.";

const CONNECTION_PROBLEM: ApiErrorDescription = {
  title: "Connection problem",
  message: "We couldn't reach the server. Check your connection and try again.",
};

const TIMED_OUT: ApiErrorDescription = {
  title: "Taking too long",
  message: "The server took too long to answer. Please try again in a moment.",
};

// NotificationDisplay adds how long to wait below this
const RATE_LIMITED: ApiErrorDescription = {
  title: "Limit reached",
  message: "You've done this as often as you can for now.",
};

const SESSION_NEEDS_RELOAD: ApiErrorDescription = {
  title: SOMETHING_WENT_WRONG,
  message: "Your session needs refreshing. Reload the page and try again.",
};

const CHECK_AND_RETRY = "Please check and try again";
const NOT_ACCEPTED = "Something about that wasn't quite right.";

// For when the server gave no message of its own
const MESSAGE_BY_STATUS: Record<number, string> = {
  401: "You need to be signed in to do this.",
  403: "You don't have permission to do this.",
  404: "We couldn't find what you were looking for.",
};

// What browsers and axios say when a request never got an answer
const NETWORK_ERROR_CODES = ["ERR_NETWORK", "ECONNABORTED"];
const NETWORK_ERROR_MESSAGES = [
  "Network Error",
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isTimeout(error: Record<string, unknown>): boolean {
  // axios reports a timeout as ECONNABORTED "timeout of …ms exceeded", or as
  // ETIMEDOUT when told to tell them apart
  return (
    error.code === "ETIMEDOUT" ||
    (error.code === "ECONNABORTED" && /timeout/i.test(textOf(error.message)))
  );
}

function isNetworkError(error: Record<string, unknown>): boolean {
  if (NETWORK_ERROR_CODES.includes(textOf(error.code))) return true;
  const message = textOf(error.message);
  return NETWORK_ERROR_MESSAGES.some((text) => message.includes(text));
}

/** What went wrong when the server never answered. */
function describeNoResponse(error: unknown): ApiErrorDescription {
  if (isRecord(error)) {
    if (isTimeout(error)) return TIMED_OUT;
    if (isNetworkError(error)) return CONNECTION_PROBLEM;
  }
  return { title: SOMETHING_WENT_WRONG, message: TRY_AGAIN_SOON };
}

/**
 * Turns a failed request (an axios error, or an object with the server's
 * `response`) into plain words for the error pop-up. Uses the server's own
 * message when it sent one; never shows the API path, the HTTP status or a
 * library's error text, which the API client logs to the console instead.
 */
export function describeApiError(error: unknown): ApiErrorDescription {
  const response =
    isRecord(error) && isRecord(error.response) ? error.response : undefined;
  if (!response) return describeNoResponse(error);

  const httpStatus =
    typeof response.status === "number" ? response.status : undefined;
  const body = isRecord(response.data) ? response.data : {};

  if (body.status === ResponseStatus.RATE_LIMITED || httpStatus === 429) {
    return RATE_LIMITED;
  }

  // Only a JSON error body's message is the server's own words: a plain text
  // body may be an HTML error page or name the API path
  const serverMessage = textOf(body.errorMessage).trim();
  // By now the API client has retried once with a refreshed token, if it had one
  if (serverMessage === CSRF_FAILURE_MESSAGE) return SESSION_NEEDS_RELOAD;

  if (body.status === ResponseStatus.INVALID || httpStatus === 400) {
    return { title: CHECK_AND_RETRY, message: serverMessage || NOT_ACCEPTED };
  }

  const statusMessage =
    httpStatus === undefined ? undefined : MESSAGE_BY_STATUS[httpStatus];
  return {
    title: SOMETHING_WENT_WRONG,
    message: serverMessage || statusMessage || TRY_AGAIN_SOON,
  };
}
