import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { RATE_LIMITS } from "core/config.js";
import { SPEND_CEILING_MESSAGE } from "core/types/api.js";
import type { SpendBucket } from "core/types/api.js";
import { GameModes, PublicationStatus } from "core/types/index.js";
import type { PublicationStatusType } from "core/types/index.js";
import type { TemplateDB } from "../../../src/templates/TemplateDbService.js";

/*
 * Story starts stop at today's spend ceiling before anything is created or
 * counted, a World start only from a World its starter may read, and the home
 * page's code check answers without naming the story.
 */

const isOverCeiling = jest.fn<(bucket: SpendBucket) => Promise<boolean>>();
const createStory = jest.fn<() => Promise<void>>();
const createStoryFromTemplate = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const getStoryPlayerByCode =
  jest.fn<(code: string) => Promise<{ storyId: string; playerSlot: string } | undefined>>();
const findTemplateEntryById = jest.fn<(id: string) => Promise<TemplateDB | undefined>>();

jest.unstable_mockModule("../../../src/shared/db.js", () => ({
  getDb: () => ({ query: jest.fn(async () => ({ rows: [] })) }),
}));
jest.unstable_mockModule("../../../src/templates/TemplateDbService.js", () => ({
  templateDbService: { findTemplateEntryById },
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
const { accountKey, addressKey, checkRateLimit } = await import("../../../src/shared/rateLimiter.js");

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

const WORLD_OWNER = "owner-1";
/** The published World the start tests start from, unless they say otherwise. */
const PUBLISHED_WORLD = "3b2f5a1c-7d4e-4f60-8a91-0c2d3e4f5a6b";
/** A World start's body: the published World, and what else the test sends. */
const worldStart = (body: Record<string, unknown> = {}) => ({ templateId: PUBLISHED_WORLD, ...body });

/** A World's database entry, as GET /templates/:id reads it. */
function worldEntry(id: string, publicationStatus: PublicationStatusType): TemplateDB {
  return {
    id,
    creatorId: WORLD_OWNER,
    creatorUsername: "owner",
    publicationStatus,
    carouselOrder: null,
    containsImages: false,
    title: "A World",
    teaser: "A teaser",
    gameMode: GameModes.SinglePlayer,
    tags: "Fiction",
    playerCountMin: 1,
    playerCountMax: 1,
    maxTurnsMin: 5,
    maxTurnsMax: 10,
    difficultyLevels: [],
    showOnWelcomeScreen: false,
    orderValue: 999,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
  isOverCeiling.mockResolvedValue(false);
  createStoryFromTemplate.mockResolvedValue(true);
  findTemplateEntryById.mockImplementation(async (id) =>
    id === PUBLISHED_WORLD ? worldEntry(id, PublicationStatus.Published) : undefined
  );
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
  findTemplateEntryById.mockReset();
});

describe("story starts over the spend ceiling", () => {
  it.each([
    ["/stories", createStory],
    ["/stories/template", createStoryFromTemplate],
  ])("%s answers 503 with the pause message, creating and counting nothing", async (path, create) => {
    isOverCeiling.mockResolvedValue(true);
    const request = fromNewAddress(worldStart({ generateImages: false, requestId: "r1" }));

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
      ...fromNewAddress(worldStart({ generateImages: false })),
      user: { id: "teacher-1" } as Request["user"],
    });

    expect(isOverCeiling).toHaveBeenCalledWith("account");
  });

  it("starts a story under the ceiling", async () => {
    await call(handlerOf("post", "/stories/template"), fromNewAddress(worldStart({ generateImages: false })));

    expect(createStoryFromTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("story start limits", () => {
  it("holds an address to its anonymous starts when World starts arrive in parallel", async () => {
    createStoryFromTemplate.mockImplementation(() => later(true));
    const request = fromNewAddress(worldStart({ generateImages: false }));
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
      ...fromNewAddress(worldStart({ generateImages: true })),
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
    const request = fromNewAddress(worldStart({ generateImages: false }));

    await call(handlerOf("post", "/stories/template"), request);

    expect(checkRateLimit(addressKey(request.address), "initialize_story").requestsRemaining).toBe(
      RATE_LIMITS.initialize_story.maxRequests
    );
  });

  it("refuses a start over its limit without reading today's spend", async () => {
    const request = fromNewAddress(worldStart({ generateImages: false }));
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
          body: worldStart({ generateImages: false }),
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
    await call(handlerOf("post", "/stories/template"), { ...request, body: worldStart({ generateImages: true }) });

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

/*
 * Several stories at once: whoever starts them, signed in, can set reflection
 * questions for the World's outcomes, sent with every start of the batch.
 */
describe("a World start's reflection questions", () => {
  const handler = () => handlerOf("post", "/stories/template");
  const lastArgument = () => createStoryFromTemplate.mock.calls[0]?.at(-1);

  /** A signed-in start from an account no other test uses. */
  function signedIn(body: Record<string, unknown>): Partial<Request> & { accountId: string } {
    const request = fromNewAddress(worldStart(body));
    const accountId = `starter-${addressCounter}`;
    return { ...request, accountId, user: { id: accountId } as Request["user"] };
  }

  it("passes the questions a signed-in start sends on, as they read, to the story it creates", async () => {
    await call(handler(), signedIn({ generateImages: false, reflectionQuestions: { shared_harbour: [" Who paid? "] } }));

    expect(lastArgument()).toEqual({ shared_harbour: ["Who paid?"] });
  });

  it("passes none on for a start that sends none, so the story takes the World's", async () => {
    await call(handler(), fromNewAddress(worldStart({ generateImages: false })));

    expect(lastArgument()).toBeUndefined();
  });

  it("refuses questions from a start that isn't signed in with 401, creating and counting nothing", async () => {
    const request = fromNewAddress(
      worldStart({ generateImages: false, reflectionQuestions: { shared_harbour: ["Who paid?"] } })
    );

    const sent = await call(handler(), request);

    expect(sent.statusCode).toBe(401);
    expect(sent.body.errorMessage).toBe("Authentication required");
    expect(createStoryFromTemplate).not.toHaveBeenCalled();
    expect(isOverCeiling).not.toHaveBeenCalled();
    expect(checkRateLimit(addressKey(request.address), "initialize_story").requestsRemaining).toBe(
      RATE_LIMITS.initialize_story.maxRequests
    );
  });

  it("refuses questions beyond the limits with 400, saying what they are, creating and counting nothing", async () => {
    const request = signedIn({ generateImages: false, reflectionQuestions: { shared_harbour: ["x".repeat(301)] } });

    const sent = await call(handler(), request);

    expect(sent.statusCode).toBe(400);
    expect(sent.body.errorMessage).toBe(
      "Reflection questions: at most 5 for each outcome, each one with text and at most 300 characters."
    );
    expect(createStoryFromTemplate).not.toHaveBeenCalled();
    expect(checkRateLimit(accountKey(request.accountId), "initialize_story_text").requestsRemaining).toBe(
      RATE_LIMITS.initialize_story_text.maxRequests
    );
  });
});

/*
 * A World start reads the World as GET /templates/:id does: a published or
 * private World for anyone, signed in or not; a draft or one in review for its
 * owner and for templates_see_all (admins). Everyone else gets the refusal GET
 * gives, before anything is created or counted.
 */
describe("who may start a story from a World", () => {
  const WORLD = "9c8d7e6f-5a4b-4c3d-9e2f-1a0b9c8d7e6f";
  const start = (request: Partial<Request>) => call(handlerOf("post", "/stories/template"), request);

  function worldIs(status: PublicationStatusType) {
    findTemplateEntryById.mockImplementation(async (id) => (id === WORLD ? worldEntry(id, status) : undefined));
  }

  type Starter = "a guest" | "its owner" | "another account" | "an admin";

  /** A start of WORLD from an address, and an account unless a guest's, that no other test uses; with the count it claims from. */
  function starter(who: Starter, body: Record<string, unknown> = {}) {
    const request = fromNewAddress({ templateId: WORLD, generateImages: false, ...body });
    if (who === "a guest") {
      return { ...request, counted: () => checkRateLimit(addressKey(request.address), "initialize_story").requestsRemaining };
    }
    const id = who === "its owner" ? WORLD_OWNER : `starter-${addressCounter}`;
    const permissions = who === "an admin" ? ["templates_see_all", "templates_edit_all", "templates_publish"] : ["templates_create"];
    return {
      ...request,
      user: { id } as Request["user"],
      userPermissions: permissions,
      counted: () => checkRateLimit(accountKey(id), "initialize_story_text").requestsRemaining,
    };
  }

  describe.each([PublicationStatus.Draft, PublicationStatus.Review])("a %s World", (status) => {
    beforeEach(() => worldIs(status));

    it.each<Starter>(["its owner", "an admin"])("starts a story for %s", async (who) => {
      await start(starter(who));

      expect(createStoryFromTemplate).toHaveBeenCalledTimes(1);
      expect(createStoryFromTemplate.mock.calls[0]?.[0]).toBe(WORLD);
    });

    it.each<Starter>(["a guest", "another account"])(
      "refuses %s with the refusal GET /templates/:id gives, creating and counting nothing",
      async (who) => {
        const request = starter(who);

        const sent = await start(request);

        expect(sent.statusCode).toBe(401);
        expect(sent.body.errorMessage).toBe("Authentication required");
        expect(sent.body.data).toBeUndefined();
        expect(createStoryFromTemplate).not.toHaveBeenCalled();
        expect(isOverCeiling).not.toHaveBeenCalled();
        expect(request.counted()).toBe(
          who === "a guest" ? RATE_LIMITS.initialize_story.maxRequests : RATE_LIMITS.initialize_story_text.maxRequests
        );
      }
    );
  });

  describe.each([PublicationStatus.Published, PublicationStatus.Private])("a %s World", (status) => {
    beforeEach(() => worldIs(status));

    it.each<Starter>(["a guest", "another account", "its owner"])("starts a story for %s, as before", async (who) => {
      const request = starter(who);

      await start(request);

      expect(createStoryFromTemplate).toHaveBeenCalledTimes(1);
      expect(createStoryFromTemplate.mock.calls[0]?.[0]).toBe(WORLD);
    });
  });

  it("refuses a World that doesn't exist with 404, creating and counting nothing", async () => {
    worldIs(PublicationStatus.Published);
    const request = starter("a guest", { templateId: "0f1e2d3c-4b5a-4968-b7a6-958473625140" });

    const sent = await start(request);

    expect(sent.statusCode).toBe(404);
    expect(sent.body.errorMessage).toBe("Template not found");
    expect(createStoryFromTemplate).not.toHaveBeenCalled();
    expect(request.counted()).toBe(RATE_LIMITS.initialize_story.maxRequests);
  });

  it.each([
    ["missing", undefined],
    ["a name", "harbour"],
    ["a path", "../stories/9c8d7e6f-5a4b-4c3d-9e2f-1a0b9c8d7e6f"],
    ["a number", 42],
  ])("refuses a World id that is %s with 400, before looking anything up or counting the start", async (_what, templateId) => {
    worldIs(PublicationStatus.Published);
    const request = starter("another account", { templateId });

    const sent = await start(request);

    expect(sent.statusCode).toBe(400);
    expect(sent.body.errorMessage).toBe("Template ID must be a UUID");
    expect(findTemplateEntryById).not.toHaveBeenCalled();
    expect(createStoryFromTemplate).not.toHaveBeenCalled();
    expect(request.counted()).toBe(RATE_LIMITS.initialize_story_text.maxRequests);
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
