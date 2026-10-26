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
const createStoryFromTemplate = jest.fn<() => Promise<void>>();
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

async function call(handler: Handler, req: Partial<Request>): Promise<Sent> {
  const sent: Sent[] = [];
  const res = {
    req: { originalUrl: "/stories" },
    status(statusCode: number) {
      return { json: (body: Record<string, unknown>) => sent.push({ statusCode, body }) };
    },
  } as unknown as Response;
  await handler({ query: {}, body: {}, headers: {}, params: {}, ...req } as Request, res, jest.fn());
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
});

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
});
