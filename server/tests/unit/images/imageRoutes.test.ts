import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";
import type { Request, Response } from "express";
import type { PublicUser } from "core/types/user.js";

/*
 * Renaming or deleting a World's element images changes that World, so only
 * someone who may edit it can do it: its creator, or an account allowed to
 * edit every World. Anyone may still see the images.
 */

// The World's files live in a throwaway directory, never in data/templates
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-routes-"));
const inStorage = (pathType: string, subPath: string): string =>
  path.join(storageRoot, pathType, subPath);

jest.unstable_mockModule("../../../src/shared/storageUtils.js", () => ({
  getStorageFilePath: inStorage,
  storageFileExists: (pathType: string, subPath: string) =>
    fs.existsSync(inStorage(pathType, subPath)),
  getStoryImagesDirectoryPath: (storyId: string) =>
    inStorage("stories", path.join(storyId, "images")),
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

const { imageRouter } = await import("../../../src/images/imageRoutes.js");

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

const CREATOR = account("creator-1", "role_user", ["templates_create"]);
const OTHER_USER = account("other-1", "role_user", ["templates_create"]);
const IMAGE_MAKER = account("image-maker-1", "role_worldbuilder", [
  "templates_create",
  "templates_images",
  "templates_videos",
]);
const ADMIN = account("admin-1", "role_admin", [
  "templates_see_all",
  "templates_edit_all",
  "templates_publish",
  "templates_create",
  "templates_images",
]);
const ACCOUNTS = [CREATOR, OTHER_USER, IMAGE_MAKER, ADMIN];
const sessionOf = (caller: PublicUser): string => `session-of-${caller.id}`;

const WORLD_ID = "world-under-test";
const imagesDir = inStorage("templates", path.join(WORLD_ID, "images"));
const imageFile = (elementId: string): string => path.join(imagesDir, `${elementId}.jpeg`);
const imageOf = (elementId: string): string | undefined =>
  fs.existsSync(imageFile(elementId)) ? fs.readFileSync(imageFile(elementId), "utf-8") : undefined;

type Answer = { statusCode: number; body: Record<string, unknown> };

/** Sends a request through the image router as the app would, with the caller's session cookie. */
function send(
  method: "GET" | "POST" | "DELETE",
  url: string,
  options: { session?: string; body?: Record<string, unknown> } = {}
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      originalUrl: `/images${url}`,
      headers: {},
      query: {},
      body: options.body ?? {},
      cookies: options.session ? { authToken: options.session } : {},
      accepts: () => false,
    } as unknown as Request;
    const res = {
      req,
      status: (statusCode: number) => ({
        json: (body: Record<string, unknown>) => resolve({ statusCode, body }),
      }),
      sendFile: (filePath: string) => resolve({ statusCode: 200, body: { filePath } }),
    } as unknown as Response;
    imageRouter(req, res, (error?: unknown) =>
      reject(error ?? new Error(`nothing answered ${method} ${url}`))
    );
  });
}

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(imageFile("old-element"), "old element's image");
  fs.writeFileSync(imageFile("other-element"), "other element's image");
  verifyToken.mockImplementation(
    async (session) => ACCOUNTS.find((caller) => sessionOf(caller) === session) ?? null
  );
  findTemplateEntryById.mockImplementation(async (id) =>
    id === WORLD_ID
      ? { publicationStatus: "published", creatorId: CREATOR.id, title: "A World" }
      : undefined
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  verifyToken.mockReset();
  findTemplateEntryById.mockReset();
  fs.rmSync(inStorage("templates", ""), { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(storageRoot, { recursive: true, force: true });
});

const REFUSED: [string, string | undefined, number][] = [
  ["nobody signed in", undefined, 401],
  ["an expired session", "expired-session", 401],
  ["a signed-in user who didn't make the World", sessionOf(OTHER_USER), 403],
  ["an image maker who didn't make the World", sessionOf(IMAGE_MAKER), 403],
];

const ALLOWED: [string, PublicUser][] = [
  ["the World's creator", CREATOR],
  ["an admin", ADMIN],
];

describe("POST /images/templates/:id/rename", () => {
  const rename = (session: string | undefined, worldId = WORLD_ID) =>
    send("POST", `/templates/${worldId}/rename`, {
      session,
      body: { oldElementId: "old-element", newElementId: "other-element" },
    });

  it.each(REFUSED)("refuses %s, leaving every image as it was", async (_who, session, status) => {
    const answer = await rename(session);

    expect(answer.statusCode).toBe(status);
    expect(imageOf("old-element")).toBe("old element's image");
    expect(imageOf("other-element")).toBe("other element's image");
  });

  it.each(ALLOWED)("lets %s move the image to the element's new id", async (_who, caller) => {
    const answer = await send("POST", `/templates/${WORLD_ID}/rename`, {
      session: sessionOf(caller),
      body: { oldElementId: "old-element", newElementId: "new-element" },
    });

    expect(answer.statusCode).toBe(200);
    expect(imageOf("old-element")).toBeUndefined();
    expect(imageOf("new-element")).toBe("old element's image");
    expect(imageOf("other-element")).toBe("other element's image");
  });

  it("answers 404 for a World that doesn't exist", async () => {
    const answer = await rename(sessionOf(ADMIN), "no-such-world");

    expect(answer.statusCode).toBe(404);
    expect(imageOf("old-element")).toBe("old element's image");
  });
});

describe("DELETE /images/templates/:id/element/:elementId", () => {
  const remove = (session: string | undefined, worldId = WORLD_ID) =>
    send("DELETE", `/templates/${worldId}/element/old-element`, { session });

  it.each(REFUSED)("refuses %s, keeping the image", async (_who, session, status) => {
    const answer = await remove(session);

    expect(answer.statusCode).toBe(status);
    expect(imageOf("old-element")).toBe("old element's image");
  });

  it.each(ALLOWED)("lets %s delete the element's stored image", async (_who, caller) => {
    const answer = await remove(sessionOf(caller));

    expect(answer.statusCode).toBe(200);
    expect((answer.body.data as Record<string, unknown>).message).toBe(
      "Image deleted successfully"
    );
    expect(imageOf("old-element")).toBeUndefined();
    expect(imageOf("other-element")).toBe("other element's image");
  });

  it("answers 404 for a World that doesn't exist", async () => {
    const answer = await remove(sessionOf(ADMIN), "no-such-world");

    expect(answer.statusCode).toBe(404);
    expect(imageOf("old-element")).toBe("old element's image");
  });
});

describe("GET /images/templates/:templateId/:path", () => {
  it("still serves a World's image to a visitor who isn't signed in", async () => {
    const answer = await send("GET", `/templates/${WORLD_ID}/old-element.jpeg`);

    expect(answer.statusCode).toBe(200);
    expect(answer.body.filePath).toBe(imageFile("old-element"));
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
