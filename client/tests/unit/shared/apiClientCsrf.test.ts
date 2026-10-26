import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { CSRF_FAILURE_MESSAGE, ResponseStatus } from "core/types/api";
import { apiClient } from "../../../src/shared/apiClient";
import type { Notification } from "../../../src/shared/notifications/notifications";
import { notificationService } from "../../../src/shared/notifications/notificationService";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

const STALE_TOKEN = "stale-token-1111";
const FRESH_TOKEN = "fresh-token-2222";
const NEWER_TOKEN = "newer-token-3333";

// The API client reads the CSRF cookie before each request; Jest has no DOM
const browser = globalThis as { document?: { cookie: string } };

function setCookie(token: string | undefined): void {
  browser.document = {
    cookie: token ? `theme=dark; XSRF-TOKEN=${token}` : "theme=dark",
  };
}

/** The server's 403 when the header and cookie tokens don't match (server/src/shared/csrf.ts). */
function csrfRejection(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError("Request failed with status code 403", "ERR_BAD_REQUEST", config, null, {
    status: 403,
    statusText: "Forbidden",
    headers: {},
    config,
    data: { status: ResponseStatus.ERROR, errorMessage: CSRF_FAILURE_MESSAGE },
  });
}

function success(config: InternalAxiosRequestConfig): AxiosResponse {
  return {
    status: 200,
    statusText: "OK",
    headers: {},
    config,
    data: { status: ResponseStatus.SUCCESS, requestId: "r1", timestamp: 0, data: { saved: true } },
  };
}

type Answer = (config: InternalAxiosRequestConfig) => AxiosResponse;

/** An adapter that answers each request in turn and keeps the CSRF header each one carried. */
function server(...answers: Answer[]) {
  const sentTokens: unknown[] = [];
  const adapter = jest.fn(async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    sentTokens.push(config.headers["X-CSRF-TOKEN"]);
    const answer = answers[sentTokens.length - 1];
    if (!answer) throw new Error("no answer left for this request");
    return answer(config);
  });
  return { adapter, sentTokens };
}

/** The 403, after which the browser holds the token the server set with it. */
function rejectAndSetCookie(token: string | undefined): Answer {
  return (config) => {
    setCookie(token);
    throw csrfRejection(config);
  };
}

const SESSION_NEEDS_RELOAD = {
  type: "error",
  title: "Something went wrong",
  message: "Your session needs refreshing. Reload the page and try again.",
  duration: 5000,
};

describe("the API client after a rejected CSRF token", () => {
  let shown: Omit<Notification, "id">[];
  let consoleCalls: unknown[][];

  beforeEach(() => {
    shown = [];
    notificationService.setCallback((notification) => shown.push(notification));
    consoleCalls = [];
    for (const method of ["log", "info", "debug", "warn", "error"] as const) {
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        consoleCalls.push(args);
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete browser.document;
  });

  it("retries once with the refreshed token and returns the retry's answer", async () => {
    setCookie(STALE_TOKEN);
    const { adapter, sentTokens } = server(rejectAndSetCookie(FRESH_TOKEN), success);

    await expect(apiClient.post("/stories/status", { storyId: "s1" }, { adapter })).resolves.toEqual({
      saved: true,
    });
    expect(sentTokens).toEqual([STALE_TOKEN, FRESH_TOKEN]);
    expect(shown).toEqual([]);
  });

  it("retries a request that went out without a token once the server has set one", async () => {
    setCookie(undefined);
    const { adapter, sentTokens } = server(rejectAndSetCookie(FRESH_TOKEN), success);

    await expect(apiClient.post("/stories", { prompt: "p" }, { adapter })).resolves.toEqual({
      saved: true,
    });
    expect(sentTokens).toEqual([undefined, FRESH_TOKEN]);
  });

  it("stops after one retry and asks for a reload when the retry is rejected too", async () => {
    setCookie(STALE_TOKEN);
    const { adapter, sentTokens } = server(
      rejectAndSetCookie(FRESH_TOKEN),
      rejectAndSetCookie(NEWER_TOKEN)
    );

    await expect(apiClient.post("/stories", { prompt: "p" }, { adapter })).rejects.toMatchObject({
      errorMessage: CSRF_FAILURE_MESSAGE,
      httpStatus: 403,
    });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(sentTokens).toEqual([STALE_TOKEN, FRESH_TOKEN]);
    expect(shown).toEqual([SESSION_NEEDS_RELOAD]);
  });

  it("doesn't resend when the cookie holds no newer token", async () => {
    setCookie(STALE_TOKEN);
    const { adapter } = server(rejectAndSetCookie(STALE_TOKEN));

    await expect(apiClient.post("/stories", { prompt: "p" }, { adapter })).rejects.toMatchObject({
      httpStatus: 403,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(shown).toEqual([SESSION_NEEDS_RELOAD]);
  });

  it("doesn't resend after a 403 that isn't about the CSRF token", async () => {
    setCookie(STALE_TOKEN);
    const { adapter } = server((config) => {
      setCookie(FRESH_TOKEN);
      throw new AxiosError("Request failed with status code 403", "ERR_BAD_REQUEST", config, null, {
        status: 403,
        statusText: "Forbidden",
        headers: {},
        config,
        data: { status: ResponseStatus.ERROR, errorMessage: "Insufficient permissions" },
      });
    });

    await expect(apiClient.post("/stories", { prompt: "p" }, { adapter })).rejects.toMatchObject({
      httpStatus: 403,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("never writes a token to the browser console", async () => {
    setCookie(STALE_TOKEN);
    const { adapter } = server(rejectAndSetCookie(FRESH_TOKEN), success);

    await apiClient.post("/stories/status", { storyId: "s1" }, { adapter });

    expect(consoleCalls.length).toBeGreaterThan(0);
    const logged = JSON.stringify(consoleCalls);
    expect(logged).not.toContain(STALE_TOKEN);
    expect(logged).not.toContain(FRESH_TOKEN);
  });
});
