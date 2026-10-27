import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import type { PublicUser } from "core/types/user.js";
import { PublicationStatus, GameModes } from "core/types/index.js";
import type { PublicationStatusType } from "core/types/index.js";
import type { TemplateDB } from "../../../src/templates/TemplateDbService.js";

/*
 * GET /templates/:id, the World page's metadata. A Draft or Review World opens
 * for its owner and for admins (templates_see_all); everyone else, signed in or
 * not, gets the same refusal an anonymous visitor gets. A Published or Private
 * World answers everyone as before. A bad or expired sign-in counts as no
 * sign-in, never as a server error.
 */

const verifyToken = jest.fn<(token: string) => Promise<PublicUser | null>>();
const findTemplateEntryById = jest.fn<(id: string) => Promise<TemplateDB | null>>();

jest.unstable_mockModule("../../../src/shared/db.js", () => ({
  getDb: () => ({ query: jest.fn(async () => ({ rows: [] })) }),
}));
jest.unstable_mockModule("../../../src/users/userService.js", () => ({
  verifyToken,
}));
jest.unstable_mockModule("../../../src/templates/TemplateDbService.js", () => ({
  templateDbService: { findTemplateEntryById },
}));
jest.unstable_mockModule("../../../src/templates/TemplateService.js", () => ({
  TemplateService: class {},
  TemplateImportError: class extends Error {},
}));
jest.unstable_mockModule("../../../src/game/services/ContentFilterService.js", () => ({
  ContentFilterService: class {},
}));

const { default: router } = await import("../../../src/templates/templateRoutes.js");

type Sent = { statusCode: number; body: Record<string, unknown>; headers: Record<string, string> };
type Handler = (req: Request, res: Response, next: (error?: unknown) => void) => unknown;

/** Every handler of GET /templates/:id, its middleware first. */
function getTemplateStack(): Handler[] {
  const layer = router.stack.find(
    (entry) =>
      entry.route?.path === "/templates/:id" &&
      (entry.route as unknown as { methods: Record<string, boolean> }).methods.get
  );
  const handlers = layer?.route?.stack.map((entry) => entry.handle as Handler);
  if (!handlers?.length) throw new Error("the route GET /templates/:id is missing");
  return handlers;
}

/** Runs the request through the route's whole stack, as Express would. */
async function getTemplate(id: string, authToken?: string): Promise<Sent> {
  const sent: Sent[] = [];
  const headers: Record<string, string> = {};
  const res = {
    req: { originalUrl: `/templates/${id}` },
    set(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    status(statusCode: number) {
      return { json: (body: Record<string, unknown>) => sent.push({ statusCode, body, headers }) };
    },
  } as unknown as Response;
  const req = {
    method: "GET",
    path: `/templates/${id}`,
    params: { id },
    query: { requestId: "req-1" },
    body: {},
    headers: {},
    cookies: authToken ? { authToken } : {},
  } as unknown as Request;

  // A middleware may call next() without returning it, so every handler
  // started is awaited, including those started while awaiting
  const stack = getTemplateStack();
  const running: Promise<unknown>[] = [];
  let index = 0;
  const next = (error?: unknown): void => {
    if (error) throw error;
    const handler = stack[index++];
    if (handler) running.push(Promise.resolve(handler(req, res, next)));
  };
  next();
  for (let i = 0; i < running.length; i++) await running[i];
  if (sent.length !== 1) throw new Error(`expected one answer, got ${sent.length}`);
  return sent[0]!;
}

/** What a refusal says, without the parts every answer stamps afresh. */
function refusal(sent: Sent): Record<string, unknown> {
  return { statusCode: sent.statusCode, ...sent.body, timestamp: "stamped afresh" };
}

function user(id: string, roleId: string, permissions: string[]): PublicUser {
  return { id, username: id, email: `${id}@example.test`, roleId, createdAt: 0, lastLoginAt: null, permissions };
}

const OWNER = user("user-owner", "role_user", ["templates_create"]);
const OTHER_USER = user("user-other", "role_user", ["templates_create"]);
const WORLDBUILDER = user("user-worldbuilder", "role_worldbuilder", [
  "templates_create",
  "templates_images",
  "templates_videos",
]);
const ADMIN = user("user-admin", "role_admin", [
  "templates_see_all",
  "templates_edit_all",
  "templates_publish",
  "templates_create",
]);

const TOKENS: Record<string, PublicUser> = {
  "token-owner": OWNER,
  "token-other": OTHER_USER,
  "token-worldbuilder": WORLDBUILDER,
  "token-admin": ADMIN,
};

function world(publicationStatus: PublicationStatusType): TemplateDB {
  return {
    id: "world-1",
    creatorId: OWNER.id,
    creatorUsername: OWNER.username,
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
  verifyToken.mockImplementation(async (token) => TOKENS[token] ?? null);
});

afterEach(() => {
  jest.restoreAllMocks();
  verifyToken.mockReset();
  findTemplateEntryById.mockReset();
});

const UNPUBLISHED = [PublicationStatus.Draft, PublicationStatus.Review];

describe.each(UNPUBLISHED)("a %s World", (status) => {
  beforeEach(() => {
    findTemplateEntryById.mockResolvedValue(world(status));
  });

  it("refuses an anonymous visitor as it always has", async () => {
    const sent = await getTemplate("world-1");

    expect(sent.statusCode).toBe(401);
    expect(sent.body.errorMessage).toBe("Authentication required");
    expect(sent.body.data).toBeUndefined();
  });

  it.each([
    ["another signed-in user", "token-other"],
    ["a worldbuilder who isn't its owner", "token-worldbuilder"],
  ])("refuses %s with exactly the anonymous refusal", async (_who, token) => {
    const anonymous = await getTemplate("world-1");

    const sent = await getTemplate("world-1", token);

    expect(refusal(sent)).toEqual(refusal(anonymous));
    expect(sent.body.data).toBeUndefined();
  });

  it("opens for its owner", async () => {
    const sent = await getTemplate("world-1", "token-owner");

    expect(sent.statusCode).toBe(200);
    expect(sent.body.data).toMatchObject({
      template: { id: "world-1", title: "A World", publicationStatus: status, playerCountMin: 1, playerCountMax: 1 },
    });
  });

  it("opens for an admin who isn't its owner", async () => {
    const sent = await getTemplate("world-1", "token-admin");

    expect(sent.statusCode).toBe(200);
    expect(sent.body.data).toMatchObject({ template: { id: "world-1", publicationStatus: status } });
  });

  it("keeps the answer out of shared caches, since it depends on who is signed in", async () => {
    const sent = await getTemplate("world-1", "token-owner");

    expect(sent.headers["cache-control"]).toBe("private, no-store");
  });

  it("treats a token no session holds (bad or expired) as anonymous, never a 500", async () => {
    const anonymous = await getTemplate("world-1");

    const sent = await getTemplate("world-1", "token-expired");

    expect(refusal(sent)).toEqual(refusal(anonymous));
  });

  it("treats a token whose check fails outright as anonymous, never a 500", async () => {
    const anonymous = await getTemplate("world-1");
    verifyToken.mockRejectedValue(new Error("jwt malformed"));

    const sent = await getTemplate("world-1", "not-a-jwt");

    expect(refusal(sent)).toEqual(refusal(anonymous));
  });
});

describe.each([PublicationStatus.Published, PublicationStatus.Private])("a %s World", (status) => {
  beforeEach(() => {
    findTemplateEntryById.mockResolvedValue(world(status));
  });

  it("answers anonymous visitors with its metadata, without its creator", async () => {
    const sent = await getTemplate("world-1");

    expect(sent.statusCode).toBe(200);
    expect(sent.body.data).toMatchObject({ template: { id: "world-1", publicationStatus: status } });
    const template = (sent.body.data as { template: Record<string, unknown> }).template;
    expect(template).not.toHaveProperty("creatorId");
    expect(template).not.toHaveProperty("creatorUsername");
    expect(sent.headers).toEqual({});
  });

  it.each([
    ["its owner", "token-owner"],
    ["another user", "token-other"],
    ["an admin", "token-admin"],
    ["a bad or expired token", "token-expired"],
  ])(
    "answers a request signed in as %s exactly as an anonymous one",
    async (_who, token) => {
      const anonymous = await getTemplate("world-1");

      const sent = await getTemplate("world-1", token);

      expect(refusal(sent)).toEqual(refusal(anonymous));
      expect(sent.headers).toEqual({});
    }
  );
});

describe("a World that doesn't exist", () => {
  it.each([
    ["an anonymous visitor", undefined],
    ["a signed-in user", "token-owner"],
    ["an admin", "token-admin"],
  ])("is not found for %s", async (_who, token) => {
    findTemplateEntryById.mockResolvedValue(null);

    const sent = await getTemplate("no-such-world", token);

    expect(sent.statusCode).toBe(404);
    expect(sent.body.errorMessage).toBe("Template not found");
  });
});
