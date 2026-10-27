import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import type { PublicUser } from "core/types/user.js";

/*
 * The template editor's image generation writes into a World's images, so it
 * answers only to someone who may edit that World: its creator, or an account
 * allowed to edit every World, and only with the image permission. A refused
 * request, or one whose ids would leave the World's folder, is answered before
 * the request is screened or an image is generated, so it costs nothing.
 */

const generateImageForTemplate = jest.fn<(...args: unknown[]) => Promise<string>>();
const generatePlayerImageForTemplate = jest.fn<(...args: unknown[]) => Promise<string>>();
const generateCoverImageForTemplate = jest.fn<(...args: unknown[]) => Promise<string>>();
jest.unstable_mockModule("../../../src/images/AIImageGenerator.js", () => ({
  aiImageGenerator: {
    generateImageForTemplate,
    generatePlayerImageForTemplate,
    generateCoverImageForTemplate,
  },
  ImageGenerationError: class ImageGenerationError extends Error {},
}));

const screenImageRequest = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.unstable_mockModule("../../../src/images/imageRequestScreening.js", () => ({
  screenImageRequest,
}));
jest.unstable_mockModule("../../../src/game/services/ContentFilterService.js", () => ({
  ContentFilterService: class ContentFilterService {},
}));

// The stored template (for the Kids moderation) is read only after the checks
const getTemplateById = jest.fn<(id: string) => Promise<null>>();
jest.unstable_mockModule("../../../src/templates/TemplateService.js", () => ({
  TemplateService: class TemplateService {
    getTemplateById = getTemplateById;
  },
}));

const verifyToken = jest.fn<(session: string) => Promise<PublicUser | null>>();
jest.unstable_mockModule("../../../src/users/userService.js", () => ({
  verifyToken,
}));

type WorldEntry = { publicationStatus: string; creatorId: string | null; title: string };
const findTemplateEntryById = jest.fn<(id: string) => Promise<WorldEntry | undefined>>();
jest.unstable_mockModule("../../../src/templates/TemplateDbService.js", () => ({
  templateDbService: { findTemplateEntryById },
}));

const { default: router } = await import("../../../src/images/imageGenerationRoutes.js");

function account(id: string, roleId: string, permissions: string[]): PublicUser {
  return {
    id,
    username: id,
    email: `${id}@example.org`,
    roleId,
    createdAt: 0,
    lastLoginAt: null,
    permissions,
  };
}

const WORLDBUILDER_PERMISSIONS = ["templates_create", "templates_images", "templates_videos"];
const CREATOR = account("creator-1", "role_worldbuilder", WORLDBUILDER_PERMISSIONS);
const OTHER_WORLDBUILDER = account("worldbuilder-2", "role_worldbuilder", WORLDBUILDER_PERMISSIONS);
const PLAYER = account("player-1", "role_user", ["templates_create"]);
const ADMIN = account("admin-1", "role_admin", [
  "templates_see_all",
  "templates_edit_all",
  "templates_publish",
  "templates_create",
  "templates_images",
]);
const ACCOUNTS = [CREATOR, OTHER_WORLDBUILDER, PLAYER, ADMIN];
const sessionOf = (caller: PublicUser): string => `session-of-${caller.id}`;

const WORLD_ID = "world-under-test";

type Route = {
  path: string;
  body: Record<string, unknown>;
  generator: typeof generateImageForTemplate;
};
const ROUTES: [string, Route][] = [
  [
    "element",
    {
      path: "/image-generation/template/element",
      body: { elementId: "harbour_master", appearance: "A tall figure in a salt-stained coat" },
      generator: generateImageForTemplate,
    },
  ],
  [
    "player",
    {
      path: "/image-generation/template/player",
      body: { playerSlot: "player1", identityIndex: 0, appearance: "A young keeper with a lantern" },
      generator: generatePlayerImageForTemplate,
    },
  ],
  [
    "cover",
    {
      path: "/image-generation/template/cover",
      body: { coverPrompt: "A lighthouse in a storm" },
      generator: generateCoverImageForTemplate,
    },
  ],
];

type Answer = { statusCode: number; body: Record<string, unknown> };

let addressCounter = 0;

/** Posts through the router as the app would, from an address no other request uses. */
function post(path: string, body: Record<string, unknown>, caller?: PublicUser): Promise<Answer> {
  addressCounter += 1;
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url: path,
      originalUrl: path,
      headers: {},
      query: {},
      body: { requestId: "r1", ...body },
      cookies: caller ? { authToken: sessionOf(caller) } : {},
      socket: { remoteAddress: `203.0.113.${addressCounter}` },
    } as unknown as Request;
    const res = {
      req,
      status: (statusCode: number) => ({
        json: (answer: Record<string, unknown>) => resolve({ statusCode, body: answer }),
      }),
    } as unknown as Response;
    router(req, res, (error?: unknown) => reject(error ?? new Error(`nothing answered ${path}`)));
  });
}

function expectNothingSpent(): void {
  expect(screenImageRequest).not.toHaveBeenCalled();
  for (const [, route] of ROUTES) expect(route.generator).not.toHaveBeenCalled();
  expect(getTemplateById).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
  verifyToken.mockImplementation(
    async (session) => ACCOUNTS.find((caller) => sessionOf(caller) === session) ?? null
  );
  findTemplateEntryById.mockImplementation(async (id) =>
    id === WORLD_ID
      ? { publicationStatus: "draft", creatorId: CREATOR.id, title: "A World" }
      : undefined
  );
  screenImageRequest.mockResolvedValue(undefined);
  getTemplateById.mockResolvedValue(null);
  for (const [name, route] of ROUTES) {
    route.generator.mockResolvedValue(`/images/templates/${WORLD_ID}/${name}.jpeg`);
  }
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const mock of [verifyToken, findTemplateEntryById, screenImageRequest, getTemplateById]) {
    mock.mockReset();
  }
  for (const [, route] of ROUTES) route.generator.mockReset();
});

describe.each(ROUTES)("POST /image-generation/template/%s", (_name, route) => {
  const generate = (caller?: PublicUser, body: Record<string, unknown> = {}) =>
    post(route.path, { templateId: WORLD_ID, ...route.body, ...body }, caller);

  it.each([
    ["the World's creator", CREATOR],
    ["an admin", ADMIN],
  ])("lets %s generate the image into the World", async (_who, caller) => {
    const answer = await generate(caller);

    expect(answer.statusCode).toBe(200);
    expect(screenImageRequest).toHaveBeenCalledTimes(1);
    expect(route.generator).toHaveBeenCalledTimes(1);
    expect(route.generator.mock.calls[0]).toContain(WORLD_ID);
  });

  it.each([
    ["nobody signed in", undefined, 401],
    ["an account without the image permission", PLAYER, 403],
    ["an image maker who didn't make the World", OTHER_WORLDBUILDER, 403],
  ])("refuses %s before anything is spent", async (_who, caller, status) => {
    const answer = await generate(caller);

    expect(answer.statusCode).toBe(status);
    expectNothingSpent();
  });

  it("answers 404 for a World that doesn't exist, before anything is spent", async () => {
    const answer = await generate(ADMIN, { templateId: "no-such-world" });

    expect(answer.statusCode).toBe(404);
    expectNothingSpent();
  });

  it.each(["../stories/someone-else", "/etc", "world\\images"])(
    "refuses a World id that leaves the storage folder (%s) before anything is looked up or spent",
    async (templateId) => {
      const answer = await generate(ADMIN, { templateId });

      expect(answer.statusCode).toBe(400);
      expect(findTemplateEntryById).not.toHaveBeenCalled();
      expectNothingSpent();
    }
  );
});

describe("ids within the World that would leave its folder", () => {
  it.each([
    ["an element id", "/image-generation/template/element", { elementId: "../../cover", appearance: "A figure" }],
    ["a player slot", "/image-generation/template/player", { playerSlot: "../player1", identityIndex: 0, appearance: "A figure" }],
    [
      "an element's reference id",
      "/image-generation/template/element",
      { elementId: "harbour_master", appearance: "A figure", referenceImageIds: ["../../../secret"] },
    ],
    [
      "a cover's reference id",
      "/image-generation/template/cover",
      { coverPrompt: "A lighthouse", referenceImageIds: ["harbour_master", "..\\..\\secret"] },
    ],
  ])("refuses %s with 400 before anything is spent", async (_which, path, body) => {
    const answer = await post(path, { templateId: WORLD_ID, ...body }, CREATOR);

    expect(answer.statusCode).toBe(400);
    expectNothingSpent();
  });
});
