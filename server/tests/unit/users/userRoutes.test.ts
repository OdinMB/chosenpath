import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { RATE_LIMITS } from "core/config.js";

/*
 * Sign-ups and logins are limited per address. A sign-up counts once it is let
 * through, so parallel sign-ups meet the same cap, and is handed back when no
 * account was created. A login counts only when it fails, so a school's
 * teachers behind one address can all sign in, and guessing a password can't
 * go on.
 */

type AuthResult = { token: string; expiresAt: number; user: { id: string } };

const createUser = jest.fn<(email: string, username: string, password: string) => Promise<{ id: string }>>();
const authenticateUser =
  jest.fn<(email: string, password: string, rememberMe?: boolean) => Promise<AuthResult>>();

jest.unstable_mockModule("../../../src/shared/db.js", () => ({
  getDb: () => ({ query: jest.fn(async () => ({ rows: [] })) }),
}));
jest.unstable_mockModule("../../../src/users/userService.js", () => ({
  createUser,
  authenticateUser,
  logoutUser: jest.fn(),
  updatePassword: jest.fn(),
  refreshTokenPermissions: jest.fn(),
  verifyToken: jest.fn(),
}));
jest.unstable_mockModule("../../../src/stories/userStoryService.js", () => ({
  getStoryFeed: jest.fn(),
  getStoryPlayerByCode: jest.fn(),
}));
jest.unstable_mockModule("../../../src/stories/StoryDbService.js", () => ({
  storyDbService: { assignUserToPlayerSlot: jest.fn() },
}));

const { default: router } = await import("../../../src/users/userRoutes.js");
const { addressKey, checkRateLimit } = await import("../../../src/shared/rateLimiter.js");

type Sent = { statusCode: number; body: Record<string, unknown> };
type Handler = (req: Request, res: Response, next: () => void) => Promise<unknown> | unknown;

function handlerOf(path: string): Handler {
  const layer = router.stack.find((entry) => entry.route?.path === path);
  const stack = layer?.route?.stack;
  const handle = stack?.[stack.length - 1]?.handle as Handler | undefined;
  if (!handle) throw new Error(`the route ${path} is missing`);
  return handle;
}

async function call(handler: Handler, req: Partial<Request>): Promise<Sent> {
  const sent: Sent[] = [];
  const res = {
    req: { originalUrl: "/auth" },
    cookie: jest.fn(),
    status(statusCode: number) {
      return { json: (body: Record<string, unknown>) => sent.push({ statusCode, body }) };
    },
  } as unknown as Response;
  await handler({ query: {}, headers: {}, params: {}, ...req } as Request, res, jest.fn());
  return sent[0] ?? { statusCode: 0, body: {} };
}

let addressCounter = 0;
/** A request from an address no other test uses. */
function fromNewAddress(body: Record<string, unknown>): Partial<Request> & { address: string } {
  addressCounter += 1;
  const address = `192.0.2.${addressCounter}`;
  return { address, body, socket: { remoteAddress: address } as Request["socket"] };
}

const SIGN_UP = { email: "teacher@school.example", username: "teacher", password: "Classroom!42" };
const LOGIN = { email: "teacher@school.example", password: "Classroom!42" };

/** Resolves on a later turn of the event loop, as the database would. */
function later<T>(value: T): Promise<T> {
  return new Promise((resolve) => setImmediate(() => resolve(value)));
}

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  jest.restoreAllMocks();
  createUser.mockReset();
  authenticateUser.mockReset();
});

describe("POST /auth/register", () => {
  it("holds an address to its sign-ups when they arrive in parallel", async () => {
    createUser.mockImplementation(() => later({ id: "user-1" }));
    const request = fromNewAddress(SIGN_UP);
    const { maxRequests } = RATE_LIMITS.register;

    const sent = await Promise.all(
      Array.from({ length: maxRequests + 3 }, () => call(handlerOf("/auth/register"), request))
    );

    expect(createUser).toHaveBeenCalledTimes(maxRequests);
    expect(sent.filter((answer) => answer.statusCode === 429)).toHaveLength(3);
  });

  it("doesn't count a sign-up that created no account", async () => {
    createUser.mockRejectedValue(new Error("Email already in use"));
    const request = fromNewAddress(SIGN_UP);

    const sent = await call(handlerOf("/auth/register"), request);

    expect(sent.statusCode).toBe(400);
    expect(checkRateLimit(addressKey(request.address), "register").requestsRemaining).toBe(
      RATE_LIMITS.register.maxRequests
    );
  });

  it("doesn't count a sign-up refused for its password before anything is written", async () => {
    const request = fromNewAddress({ ...SIGN_UP, password: "short" });

    await call(handlerOf("/auth/register"), request);

    expect(createUser).not.toHaveBeenCalled();
    expect(checkRateLimit(addressKey(request.address), "register").requestsRemaining).toBe(
      RATE_LIMITS.register.maxRequests
    );
  });
});

describe("POST /auth/login", () => {
  const signedIn: AuthResult = { token: "jwt", expiresAt: Date.now() + 60_000, user: { id: "user-1" } };

  it("refuses an address once it has used its failed logins, without checking the password", async () => {
    authenticateUser.mockRejectedValue(new Error("Invalid email or password"));
    const request = fromNewAddress(LOGIN);
    const { maxRequests } = RATE_LIMITS.login;

    for (let i = 0; i < maxRequests; i++) {
      expect((await call(handlerOf("/auth/login"), request)).statusCode).toBe(401);
    }
    authenticateUser.mockClear();
    const sent = await call(handlerOf("/auth/login"), request);

    expect(sent.statusCode).toBe(429);
    expect(authenticateUser).not.toHaveBeenCalled();
  });

  it("holds the cap when failed logins arrive in parallel", async () => {
    authenticateUser.mockImplementation(async () => {
      await later(undefined);
      throw new Error("Invalid email or password");
    });
    const request = fromNewAddress(LOGIN);
    const { maxRequests } = RATE_LIMITS.login;

    const sent = await Promise.all(
      Array.from({ length: maxRequests * 2 }, () => call(handlerOf("/auth/login"), request))
    );

    expect(authenticateUser).toHaveBeenCalledTimes(maxRequests);
    expect(sent.filter((answer) => answer.statusCode === 429)).toHaveLength(maxRequests);
  });

  it("never counts a successful login, so a staff room behind one address can all sign in", async () => {
    authenticateUser.mockResolvedValue(signedIn);
    const request = fromNewAddress(LOGIN);

    for (let i = 0; i < RATE_LIMITS.login.maxRequests * 3; i++) {
      expect((await call(handlerOf("/auth/login"), request)).statusCode).toBe(200);
    }

    expect(checkRateLimit(addressKey(request.address), "login").requestsRemaining).toBe(
      RATE_LIMITS.login.maxRequests
    );
  });
});
