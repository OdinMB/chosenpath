import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { RATE_LIMITS } from "core/config.js";
import { SPEND_CEILING_MESSAGE } from "core/types/api.js";
import type { SpendBucket } from "core/types/api.js";

/*
 * Story starts stop at today's spend ceiling before anything is created or
 * counted, and the home page's code check answers without naming the story.
 */

const isOverCeiling = jest.fn<(bucket: SpendBucket) => Promise<boolean>>();
const createStory = jest.fn<() => Promise<void>>();
const createStoryFromTemplate = jest.fn<() => Promise<boolean>>();
const getStoryPlayerByCode =
  jest.fn<(code: string) => Promise<{ storyId: string; playerSlot: string } | undefined>>();

jest.unstable_mockModule("../../../src/shared/db.js", () => ({
  getDb: () => ({ query: jest.fn(async () => ({ rows: [] })) }),
}));
jest.unstable_mockModule("../../../src/spend/spendLedger.js", () => ({
  isOverCeiling,
}));
jest.unstable_mockModule("../../../src/stories/StoryCreationService.js", () => ({
  storyCreationService: { createStory, createStoryFromTemplate },
}));
jest.unstable_mockModule("../../../src/stories/StoryDbService.js", () => ({
  storyDbService: { getStoryPlayerByCode },
}));

const { default: router } = await import("../../../src/stories/storyRoutes.js");
const { addressKey, checkRateLimit } = await import("../../../src/shared/rateLimiter.js");

type Sent = { statusCode: number; body: Record<string, unknown> };
type Handler = (req: Request, res: Response, next: () => void) => Promise<void> | void;

function handlerOf(method: "get" | "post", path: string): Handler {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && (entry.route as unknown as { methods: Record<string, boolean> }).methods[method]
  );
  const stack = layer?.route?.stack;
  const handle = stack?.[stack.length - 1]?.handle as Handler | undefined;
  if (!handle) throw new Error(`the route ${method} ${path} is missing`);
  return handle;
}

function responseInto(sent: Sent[]): Response {
  return {
    req: { originalUrl: "/stories" },
    status(statusCode: number) {
      return { json: (body: Record<string, unknown>) => sent.push({ statusCode, body }) };
    },
  } as unknown as Response;
}

const requestFrom = (req: Partial<Request>): Request =>
  ({ query: {}, body: {}, headers: {}, params: {}, cookies: {}, ...req }) as Request;

async function call(handler: Handler, req: Partial<Request>): Promise<Sent> {
  const sent: Sent[] = [];
  await handler(requestFrom(req), responseInto(sent), jest.fn());
  return sent[0] ?? { statusCode: 0, body: {} };
}

/** Runs the route's whole stack, its middleware first, as Express would. */
async function callRoute(method: "get" | "post", path: string, req: Partial<Request>): Promise<Sent> {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && (entry.route as unknown as { methods: Record<string, boolean> }).methods[method]
  );
  const handlers = (layer?.route?.stack ?? []).map((entry) => entry.handle as Handler);
  if (handlers.length === 0) throw new Error(`the route ${method} ${path} is missing`);
  const sent: Sent[] = [];
  const request = requestFrom(req);
  const res = responseInto(sent);
  for (const handler of handlers) {
    let passedOn = false;
    await handler(request, res, () => {
      passedOn = true;
    });
    if (!passedOn) break;
  }
  return sent[0] ?? { statusCode: 0, body: {} };
}

let addressCounter = 0;
/** A request from an address no other test uses. */
function fromNewAddress(body: Record<string, unknown> = {}): Partial<Request> & { address: string } {
  addressCounter += 1;
  const address = `198.51.100.${addressCounter}`;
  return { address, body, socket: { remoteAddress: address } as Request["socket"] };
}

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
  isOverCeiling.mockResolvedValue(false);
  createStoryFromTemplate.mockResolvedValue(true);
});

/** Resolves on a later turn of the event loop, as a database or file write would. */
function later<T>(value: T): Promise<T> {
  return new Promise((resolve) => setImmediate(() => resolve(value)));
}

afterEach(() => {
  jest.restoreAllMocks();
  isOverCeiling.mockReset();
  createStory.mockReset();
  createStoryFromTemplate.mockReset();
  getStoryPlayerByCode.mockReset();
});

describe("story starts over the spend ceiling", () => {
  it.each([
    ["/stories", createStory],
    ["/stories/template", createStoryFromTemplate],
  ])("%s answers 503 with the pause message, creating and counting nothing", async (path, create) => {
    isOverCeiling.mockResolvedValue(true);
    const request = fromNewAddress({ generateImages: false, requestId: "r1" });

    const sent = await call(handlerOf("post", path), request);

    expect(sent.statusCode).toBe(503);
    expect(sent.body.errorMessage).toBe(SPEND_CEILING_MESSAGE);
    expect(create).not.toHaveBeenCalled();
    expect(isOverCeiling).toHaveBeenCalledWith("anonymous");
    expect(checkRateLimit(addressKey(request.address), "initialize_story").requestsRemaining).toBe(
      RATE_LIMITS.initialize_story.maxRequests
    );
  });

  it("checks a signed-in start against the account bucket", async () => {
    isOverCeiling.mockResolvedValue(true);

    await call(handlerOf("post", "/stories/template"), {
      ...fromNewAddress({ generateImages: false }),
      user: { id: "teacher-1" } as Request["user"],
    });

    expect(isOverCeiling).toHaveBeenCalledWith("account");
  });

  it("starts a story under the ceiling", async () => {
    await call(handlerOf("post", "/stories/template"), fromNewAddress({ generateImages: false }));

    expect(createStoryFromTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("story start limits", () => {
  it("holds an address to its anonymous starts when World starts arrive in parallel", async () => {
    createStoryFromTemplate.mockImplementation(() => later(true));
    const request = fromNewAddress({ generateImages: false });
    const handler = handlerOf("post", "/stories/template");

    const sent = await Promise.all(Array.from({ length: 6 }, () => call(handler, request)));

    expect(createStoryFromTemplate).toHaveBeenCalledTimes(RATE_LIMITS.initialize_story.maxRequests);
    expect(sent.filter((answer) => answer.statusCode === 429)).toHaveLength(
      6 - RATE_LIMITS.initialize_story.maxRequests
    );
  });

  it("holds an account to its image starts when they arrive in parallel", async () => {
    createStoryFromTemplate.mockImplementation(() => later(true));
    const request = {
      ...fromNewAddress({ generateImages: true }),
      user: { id: `teacher-${addressCounter}` } as Request["user"],
    };
    const handler = handlerOf("post", "/stories/template");

    await Promise.all(Array.from({ length: 5 }, () => call(handler, request)));

    expect(createStoryFromTemplate).toHaveBeenCalledTimes(
      RATE_LIMITS.initialize_story_images.maxRequests
    );
  });

  it("doesn't count a World start the creation refused (no such World, a bad player count)", async () => {
    createStoryFromTemplate.mockResolvedValue(false);
    const request = fromNewAddress({ generateImages: false });

    await call(handlerOf("post", "/stories/template"), request);

    expect(checkRateLimit(addressKey(request.address), "initialize_story").requestsRemaining).toBe(
      RATE_LIMITS.initialize_story.maxRequests
    );
  });

  it("refuses a start over its limit without reading today's spend", async () => {
    const request = fromNewAddress({ generateImages: false });
    const handler = handlerOf("post", "/stories/template");
    for (let i = 0; i < RATE_LIMITS.initialize_story.maxRequests; i++) {
      await call(handler, request);
    }
    isOverCeiling.mockClear();

    const sent = await call(handler, request);

    expect(sent.statusCode).toBe(429);
    expect(isOverCeiling).not.toHaveBeenCalled();
  });
});

describe("GET /stories/starts-left", () => {
  const { maxRequests, windowMs } = RATE_LIMITS.initialize_story_text;

  /** A signed-in request from an account no other test uses. */
  function signedIn(body: Record<string, unknown> = {}): Partial<Request> {
    const request = fromNewAddress(body);
    return { ...request, user: { id: `account-${addressCounter}` } as Request["user"] };
  }

  async function startTextStories(request: Partial<Request>, count: number): Promise<Sent[]> {
    const sent: Sent[] = [];
    for (let i = 0; i < count; i++) {
      sent.push(
        await call(handlerOf("post", "/stories/template"), {
          ...request,
          body: { generateImages: false },
        })
      );
    }
    return sent;
  }

  const startsLeft = (request: Partial<Request>) =>
    call(handlerOf("get", "/stories/starts-left"), request);

  it("answers the account's whole allowance, with nothing to renew, before its first start", async () => {
    const sent = await startsLeft(signedIn());

    expect(sent.statusCode).toBe(200);
    expect(sent.body.data).toEqual({
      remaining: maxRequests,
      limit: maxRequests,
      windowMs,
      resetsInMs: null,
    });
  });

  it("answers the starts left after some, and how long until the allowance renews", async () => {
    const request = signedIn();
    await startTextStories(request, 3);

    const sent = await startsLeft(request);

    const data = sent.body.data as { remaining: number; resetsInMs: number };
    expect(data.remaining).toBe(maxRequests - 3);
    expect(data.resetsInMs).toBeGreaterThan(windowMs - 60 * 1000);
    expect(data.resetsInMs).toBeLessThanOrEqual(windowMs);
  });

  it("consumes no start, however often it is read", async () => {
    const request = signedIn();
    await startTextStories(request, 3);

    for (let i = 0; i < maxRequests * 2; i++) {
      const sent = await startsLeft(request);
      expect((sent.body.data as { remaining: number }).remaining).toBe(maxRequests - 3);
    }
    const starts = await startTextStories(request, maxRequests);

    expect(starts.filter((answer) => answer.statusCode !== 429)).toHaveLength(maxRequests - 3);
    expect((await startsLeft(request)).body.data).toMatchObject({ remaining: 0 });
  });

  it("reads only the caller's own account, and says nothing else about it", async () => {
    const busy = signedIn();
    await startTextStories(busy, 5);
    const other = signedIn();

    const sent = await startsLeft(other);

    expect((sent.body.data as { remaining: number }).remaining).toBe(maxRequests);
    expect(Object.keys(sent.body.data as object).sort()).toEqual([
      "limit",
      "remaining",
      "resetsInMs",
      "windowMs",
    ]);
    expect(JSON.stringify(sent.body)).not.toContain((other.user as { id: string }).id);
  });

  it("counts the account's text starts, not its starts with images", async () => {
    const request = signedIn();
    await call(handlerOf("post", "/stories/template"), { ...request, body: { generateImages: true } });

    const sent = await startsLeft(request);

    expect((sent.body.data as { remaining: number }).remaining).toBe(maxRequests);
  });

  it("refuses a caller who isn't signed in, before reading any count", async () => {
    const throughMiddleware = await callRoute("get", "/stories/starts-left", fromNewAddress());
    const handlerAlone = await startsLeft(fromNewAddress());

    expect(throughMiddleware.statusCode).toBe(401);
    expect(throughMiddleware.body.data).toBeUndefined();
    expect(handlerAlone.statusCode).toBe(401);
    expect(handlerAlone.body.data).toBeUndefined();
  });
});

describe("GET /stories/:code/exists", () => {
  it("answers 200 either way, with whether the code names a story and never which", async () => {
    getStoryPlayerByCode.mockResolvedValueOnce({ storyId: "story-secret", playerSlot: "player1" });
    const found = await call(handlerOf("get", "/stories/:code/exists"), {
      ...fromNewAddress(),
      params: { code: "ABC123" },
    });

    getStoryPlayerByCode.mockResolvedValueOnce(undefined);
    const missing = await call(handlerOf("get", "/stories/:code/exists"), {
      ...fromNewAddress(),
      params: { code: "ZZZ999" },
    });

    expect(found.statusCode).toBe(200);
    expect(found.body.data).toEqual({ exists: true });
    expect(JSON.stringify(found.body)).not.toContain("story-secret");
    expect(missing.statusCode).toBe(200);
    expect(missing.body.data).toEqual({ exists: false });
  });

  it("counts misses against the address, so codes can't be guessed through it", async () => {
    getStoryPlayerByCode.mockResolvedValue(undefined);
    const request = { ...fromNewAddress(), params: { code: "ZZZ999" } };
    const handler = handlerOf("get", "/stories/:code/exists");

    for (let i = 0; i < RATE_LIMITS.verify_code.maxRequests; i++) {
      await call(handler, request);
    }
    const sent = await call(handler, request);

    expect(sent.statusCode).toBe(429);
  });

  it("holds the cap when the guesses arrive in parallel", async () => {
    getStoryPlayerByCode.mockImplementation(() => later(undefined));
    const request = { ...fromNewAddress(), params: { code: "ZZZ999" } };
    const handler = handlerOf("get", "/stories/:code/exists");
    const { maxRequests } = RATE_LIMITS.verify_code;

    const sent = await Promise.all(
      Array.from({ length: maxRequests * 3 }, () => call(handler, request))
    );

    expect(sent.filter((answer) => answer.statusCode === 200)).toHaveLength(maxRequests);
    expect(getStoryPlayerByCode).toHaveBeenCalledTimes(maxRequests);
  });
});
