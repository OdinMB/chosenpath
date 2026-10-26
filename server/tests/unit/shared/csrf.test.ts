import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import {
  CSRF_FAILURE_BODY,
  csrfFailure,
  verifyCsrfToken,
} from "../../../src/shared/csrf.js";

const HEADER_TOKEN = "header-token-aaaa";
const COOKIE_TOKEN = "cookie-token-bbbb";
const AUTH_COOKIE = "auth-jwt-cccc";

function request(
  method: string,
  headerToken: string | undefined,
  cookieToken: string | undefined
): Request {
  return {
    method,
    path: "/stories",
    headers: {
      host: "api.example.test",
      "user-agent": "jest-agent",
      cookie: `authToken=${AUTH_COOKIE}; XSRF-TOKEN=${cookieToken ?? ""}`,
      ...(headerToken === undefined ? {} : { "x-csrf-token": headerToken }),
    },
    cookies: {
      authToken: AUTH_COOKIE,
      ...(cookieToken === undefined ? {} : { "XSRF-TOKEN": cookieToken }),
    },
  } as unknown as Request;
}

function check(req: Request) {
  const sent: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(statusCode: number) {
      sent.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  } as unknown as Response;
  const next = jest.fn<() => void>();
  verifyCsrfToken(req, res, next);
  return { sent, next };
}

let logged: unknown[][];

beforeEach(() => {
  logged = [];
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("csrfFailure", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("lets %s through unchecked", (method) => {
    expect(csrfFailure(method, undefined, undefined)).toBeNull();
  });

  it("passes a request whose header matches its cookie", () => {
    expect(csrfFailure("POST", COOKIE_TOKEN, COOKIE_TOKEN)).toBeNull();
  });

  it.each([
    ["header and cookie missing", undefined, undefined],
    ["header missing", undefined, COOKIE_TOKEN],
    ["header missing", "", COOKIE_TOKEN],
    ["cookie missing", HEADER_TOKEN, undefined],
    ["header and cookie differ", HEADER_TOKEN, COOKIE_TOKEN],
  ])("says %s for header %p and cookie %p", (failure, header, cookie) => {
    expect(csrfFailure("POST", header, cookie)).toBe(failure);
  });
});

describe("verifyCsrfToken", () => {
  it("passes a matching request on", () => {
    const { sent, next } = check(request("POST", COOKIE_TOKEN, COOKIE_TOKEN));

    expect(next).toHaveBeenCalledTimes(1);
    expect(sent).toEqual({});
  });

  it("answers a mismatch with a 403 that echoes nothing from the request", () => {
    const { sent, next } = check(request("PUT", HEADER_TOKEN, COOKIE_TOKEN));

    expect(next).not.toHaveBeenCalled();
    expect(sent.statusCode).toBe(403);
    expect(sent.body).toEqual({ status: "error", errorMessage: "Invalid CSRF token" });
    expect(sent.body).toBe(CSRF_FAILURE_BODY);
    const body = JSON.stringify(sent.body);
    for (const value of [HEADER_TOKEN, COOKIE_TOKEN, AUTH_COOKIE, "jest-agent", "api.example.test"]) {
      expect(body).not.toContain(value);
    }
  });

  it("answers a missing header with the same 403", () => {
    const { sent, next } = check(request("POST", undefined, COOKIE_TOKEN));

    expect(next).not.toHaveBeenCalled();
    expect(sent).toEqual({ statusCode: 403, body: CSRF_FAILURE_BODY });
  });

  it("logs which check failed, never a token or cookie value", () => {
    check(request("DELETE", HEADER_TOKEN, COOKIE_TOKEN));

    const log = JSON.stringify(logged);
    expect(log).toContain("header and cookie differ");
    expect(log).toContain("DELETE /stories");
    for (const value of [HEADER_TOKEN, COOKIE_TOKEN, AUTH_COOKIE]) {
      expect(log).not.toContain(value);
    }
  });
});
