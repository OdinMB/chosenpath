import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { ResponseStatus } from "core/types/api";
import { apiClient } from "../../../src/shared/apiClient";
import { describeApiError } from "../../../src/shared/notifications/apiErrorMessages";
import type { Notification } from "../../../src/shared/notifications/notifications";
import { notificationService } from "../../../src/shared/notifications/notificationService";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
jest.mock("../../../src/shared/logger", () => ({
  Logger: { API: { info: jest.fn(), debug: jest.fn(), error: jest.fn() } },
}));

const CONNECTION_PROBLEM = {
  title: "Connection problem",
  message: "We couldn't reach the server. Check your connection and try again.",
};
const SOMETHING_WENT_WRONG = "Something went wrong";
const TRY_AGAIN_SOON =
  "We couldn't finish that just now. Please try again in a moment.";
const RATE_LIMITED = {
  title: "Limit reached",
  message: "You've done this as often as you can for now.",
};

/** An axios error carrying the server's answer. */
function answered(httpStatus: number, data: unknown) {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${httpStatus}`,
    response: { status: httpStatus, data },
  };
}

/** The server's error body (sendError), which names the API path. */
function errorBody(errorMessage: string, status = ResponseStatus.ERROR) {
  return {
    status,
    requestId: "r1",
    timestamp: 0,
    errorMessage,
    operationType: "/templates/missing-id",
  };
}

describe("describeApiError", () => {
  describe("a server that never answered", () => {
    it.each([
      ["axios's network error", { isAxiosError: true, code: "ERR_NETWORK", message: "Network Error" }],
      ["an aborted request", { isAxiosError: true, code: "ECONNABORTED", message: "Request aborted" }],
      ["fetch's network error", new TypeError("Failed to fetch")],
    ])("says the connection failed for %s", (_, error) => {
      expect(describeApiError(error)).toEqual(CONNECTION_PROBLEM);
    });

    it.each([
      ["axios's timeout", { code: "ECONNABORTED", message: "timeout of 180000ms exceeded" }],
      ["a clarified timeout", { code: "ETIMEDOUT", message: "timeout exceeded" }],
    ])("says the server took too long for %s", (_, error) => {
      expect(describeApiError(error)).toEqual({
        title: "Taking too long",
        message: "The server took too long to answer. Please try again in a moment.",
      });
    });
  });

  describe("a server that answered with an error", () => {
    it("shows the server's own message for a 4xx, without the API path or status", () => {
      const description = describeApiError(answered(404, errorBody("Template not found")));

      expect(description).toEqual({ title: SOMETHING_WENT_WRONG, message: "Template not found" });
      expect(JSON.stringify(description)).not.toMatch(/\/templates|404|status code/);
    });

    it("shows the server's own message for a 5xx", () => {
      expect(describeApiError(answered(500, errorBody("Failed to load templates")))).toEqual({
        title: SOMETHING_WENT_WRONG,
        message: "Failed to load templates",
      });
    });

    it.each([
      ["no body", undefined],
      ["an HTML error page", "<html><body>502 Bad Gateway</body></html>"],
      ["Express's unknown-route text", "Cannot GET /api/templates/x"],
      ["an empty message", errorBody("  ")],
    ])("gives a generic sentence for a 5xx with %s", (_, data) => {
      expect(describeApiError(answered(502, data))).toEqual({
        title: SOMETHING_WENT_WRONG,
        message: TRY_AGAIN_SOON,
      });
    });

    it.each([
      [401, { error: "Authentication required" }, "You need to be signed in to do this."],
      [403, { error: "Insufficient permissions" }, "You don't have permission to do this."],
      [404, "Not Found", "We couldn't find what you were looking for."],
    ])("says what a %i means when the server gave no message", (httpStatus, data, message) => {
      expect(describeApiError(answered(httpStatus, data))).toEqual({
        title: SOMETHING_WENT_WRONG,
        message,
      });
    });

    it("asks for a reload instead of naming the CSRF check", () => {
      expect(describeApiError(answered(403, { status: "error", errorMessage: "Invalid CSRF token" }))).toEqual({
        title: SOMETHING_WENT_WRONG,
        message: "Your session needs refreshing. Reload the page and try again.",
      });
    });
  });

  describe("a request the server didn't accept", () => {
    it("asks to check, with the server's reason", () => {
      expect(
        describeApiError(answered(400, errorBody("Invalid email format", ResponseStatus.INVALID)))
      ).toEqual({ title: "Please check and try again", message: "Invalid email format" });
    });

    it("asks to check, with a plain reason, when the server gave none", () => {
      expect(describeApiError(answered(400, {}))).toEqual({
        title: "Please check and try again",
        message: "Something about that wasn't quite right.",
      });
    });
  });

  describe("a rate limit", () => {
    it("says the limit is reached for the server's rate-limited answer", () => {
      const body = {
        status: ResponseStatus.RATE_LIMITED,
        requestId: "r1",
        timestamp: 0,
        rateLimit: { isLimited: true, timeRemaining: 60000, requestsRemaining: 0 },
      };
      expect(describeApiError(answered(429, body))).toEqual(RATE_LIMITED);
    });

    it("says the same for a bare 429", () => {
      expect(describeApiError(answered(429, "Too Many Requests"))).toEqual(RATE_LIMITED);
    });
  });

  describe("anything else", () => {
    it.each([
      ["a cancelled request", { code: "ERR_CANCELED", message: "canceled" }],
      ["a thrown error", new Error("Cannot read properties of undefined (reading 'x')")],
      ["a thrown string", "boom"],
      ["nothing at all", undefined],
      ["an unknown API status", answered(500, { status: "mystery" })],
      ["an error status in a 200", { response: { status: 200, data: { status: "error" } } }],
    ])("gives a generic sentence for %s", (_, error) => {
      expect(describeApiError(error)).toEqual({
        title: SOMETHING_WENT_WRONG,
        message: TRY_AGAIN_SOON,
      });
    });
  });
});

describe("error pop-ups the API client raises", () => {
  let shown: Omit<Notification, "id">[];

  // The API client reads the CSRF cookie before each request; Jest has no DOM
  beforeAll(() => {
    (globalThis as { document?: unknown }).document = { cookie: "" };
  });
  afterAll(() => {
    delete (globalThis as { document?: unknown }).document;
  });
  beforeEach(() => {
    shown = [];
    notificationService.setCallback((notification) => shown.push(notification));
  });

  function failWith(error: (config: InternalAxiosRequestConfig) => AxiosError) {
    return (config: InternalAxiosRequestConfig) => Promise.reject(error(config));
  }

  it("shows the server's message for a missing template, and still rejects with its status", async () => {
    const adapter = failWith(
      (config) =>
        new AxiosError("Request failed with status code 404", "ERR_BAD_REQUEST", config, null, {
          status: 404,
          statusText: "Not Found",
          headers: {},
          config,
          data: errorBody("Template not found"),
        })
    );

    await expect(apiClient.get("/templates/missing-id", { adapter })).rejects.toMatchObject({
      errorMessage: "Template not found",
      httpStatus: 404,
    });
    expect(shown).toEqual([
      { type: "error", title: SOMETHING_WENT_WRONG, message: "Template not found", duration: 5000 },
    ]);
  });

  it("says the connection failed when the server can't be reached", async () => {
    const adapter = failWith(
      (config) => new AxiosError("Network Error", "ERR_NETWORK", config, {})
    );

    await expect(apiClient.get("/templates", { adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(shown).toEqual([{ type: "error", ...CONNECTION_PROBLEM, duration: 7000 }]);
  });

  it("keeps the rate-limit warning and its wait time", async () => {
    const adapter = failWith(
      (config) =>
        new AxiosError("Request failed with status code 429", "ERR_BAD_REQUEST", config, null, {
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          config,
          data: {
            status: ResponseStatus.RATE_LIMITED,
            requestId: "r1",
            timestamp: 0,
            rateLimit: { isLimited: true, timeRemaining: 120000, requestsRemaining: 0 },
          },
        })
    );

    await expect(apiClient.post("/stories", {}, { adapter })).rejects.toMatchObject({
      status: ResponseStatus.RATE_LIMITED,
    });
    expect(shown).toEqual([
      { type: "warning", ...RATE_LIMITED, timeRemaining: 120000, autoClose: false },
    ]);
  });
});
