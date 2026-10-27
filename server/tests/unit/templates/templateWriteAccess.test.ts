import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, jest } from "@jest/globals";
import cookieParser from "cookie-parser";
import express from "express";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import JSZip from "jszip";
import type { PublicUser } from "core/types/user.js";
import * as realStorage from "../../../src/shared/storageUtils.js";

/*
 * Creating a World, saving one named by the request body's id, and importing
 * one from a zip all write into a World's folder. A new World's id is a UUID
 * no World has yet. An existing World is written only by someone who may edit
 * it (its creator, or an account allowed to edit every World), under the
 * rules saving it with PUT /templates/:id has, and it stays its creator's.
 * Nothing from a zip lands outside the World's folder, and a refused request
 * writes nothing.
 */

// Every World's files live in a throwaway folder, never in data/templates,
// and an import unpacks its zip in another
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "world-writes-"));
const templatesDir = path.join(storageRoot, "data", "templates");
const unpackRoot = fs.mkdtempSync(path.join(os.tmpdir(), "world-unpacks-"));

jest.unstable_mockModule("../../../src/shared/storageUtils.js", () => ({
  ...realStorage,
  getStoragePath: (pathType: string) => path.join(storageRoot, "data", pathType),
}));

const verifyToken = jest.fn<(session: string) => Promise<PublicUser | null>>();
jest.unstable_mockModule("../../../src/users/userService.js", () => ({
  verifyToken,
}));

// The templates table, in memory
type WorldEntry = {
  id: string;
  creatorId?: string | null;
  creatorUsername?: string | null;
  [field: string]: unknown;
};
const entries = new Map<string, WorldEntry>();
jest.unstable_mockModule("../../../src/templates/TemplateDbService.js", () => ({
  templateDbService: {
    findTemplateEntryById: async (id: string) => entries.get(id),
    createTemplateEntry: async (entry: WorldEntry) => {
      entries.set(entry.id, { ...entry, creatorUsername: usernameOf(entry.creatorId) });
      return entries.get(entry.id);
    },
    updateTemplateEntry: async (id: string, updates: Record<string, unknown>) => {
      const current = entries.get(id);
      if (!current) return undefined;
      const updated = { ...current, ...updates };
      entries.set(id, { ...updated, creatorUsername: usernameOf(updated.creatorId) });
      return entries.get(id);
    },
  },
}));

// No model and no content filter: these routes call neither
jest.unstable_mockModule("../../../src/game/services/AIStoryGenerator.js", () => ({
  AIStoryGenerator: class AIStoryGenerator {},
}));
jest.unstable_mockModule("../../../src/game/services/ContentFilterService.js", () => ({
  ContentFilterService: class ContentFilterService {},
}));

const { default: templateRouter } = await import("../../../src/templates/templateRoutes.js");

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
const CREATOR = account("builder-1", "role_worldbuilder", WORLDBUILDER_PERMISSIONS);
const OTHER_BUILDER = account("builder-2", "role_worldbuilder", WORLDBUILDER_PERMISSIONS);
const PLAYER = account("player-1", "role_user", ["templates_create"]);
const ADMIN = account("admin-1", "role_admin", [
  "templates_see_all",
  "templates_edit_all",
  "templates_publish",
  "templates_carousel",
  "templates_create",
  "templates_images",
  "templates_videos",
]);
const ACCOUNTS = [CREATOR, OTHER_BUILDER, PLAYER, ADMIN];
const sessionOf = (caller: PublicUser): string => `session-of-${caller.id}`;
const usernameOf = (id: unknown): string | null =>
  ACCOUNTS.find((caller) => caller.id === id)?.username ?? null;

const WORLD_ID = "6f1c2e8a-3b4d-4c5e-9f60-718293a4b5c6";
const NEW_ID = "0b6e4c1d-2f3a-4b5c-8d7e-9fa0b1c2d3e4";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The creator's World as it is stored before each test. */
function storedWorld(): Record<string, unknown> {
  return {
    id: WORLD_ID,
    title: "Lantern Coast",
    teaser: "The lamps go out one by one.",
    creatorId: CREATOR.id,
    creatorUsername: CREATOR.username,
    publicationStatus: "draft",
    showOnWelcomeScreen: false,
    order: 999,
    gameMode: "cooperative",
    tags: [],
    playerCountMin: 1,
    playerCountMax: 1,
    maxTurnsMin: 5,
    maxTurnsMax: 5,
    difficultyLevels: [],
    containsImages: true,
  };
}

const worldFile = (id: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(templatesDir, id, "template.json"), "utf8"));
const storedKey = (id: string, ...parts: string[]): string =>
  path.relative(storageRoot, path.join(templatesDir, id, ...parts));

/** Every file under the throwaway storage, by its path there, with its content. */
function storedFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(storageRoot, full)] = fs.readFileSync(full, "utf8");
    }
  };
  walk(storageRoot);
  return files;
}

/** The stored files and the templates table, to compare before and after a request. */
const everythingStored = () => ({ files: storedFiles(), entries: [...entries.entries()] });

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

const worldJson = (fields: Record<string, unknown>): string =>
  JSON.stringify({ ...storedWorld(), ...fields }, null, 2);

type Answer = {
  status: number;
  body: { data?: Record<string, unknown>; errorMessage?: string };
};

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(templateRouter);
let server: http.Server;
let port = 0;

/** Sends a request to the template routes as the app would, with the caller's session cookie. */
async function send(
  method: "POST" | "PUT",
  url: string,
  caller: PublicUser | undefined,
  payload: { json?: unknown; zip?: Buffer }
): Promise<Answer> {
  const headers: Record<string, string> = {};
  let data: Buffer | undefined;
  if (caller) headers.cookie = `authToken=${sessionOf(caller)}`;
  if (payload.json !== undefined) {
    data = Buffer.from(JSON.stringify(payload.json));
    headers["content-type"] = "application/json";
  }
  if (payload.zip) {
    const form = new FormData();
    form.append("zip", new Blob([payload.zip]), "world.zip");
    const encoded = new Response(form);
    data = Buffer.from(await encoded.arrayBuffer());
    headers["content-type"] = encoded.headers.get("content-type") ?? "";
  }
  if (data) headers["content-length"] = String(data.length);
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port, method, path: url, headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) : {} });
        });
      }
    );
    request.on("error", reject);
    if (data) request.write(data);
    request.end();
  });
}

const create = (caller: PublicUser | undefined, template: Record<string, unknown>) =>
  send("POST", "/templates", caller, { json: { template } });
const importZip = async (caller: PublicUser | undefined, files: Record<string, string>) =>
  send("POST", "/templates/import", caller, { zip: await zipOf(files) });

beforeAll(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(storageRoot, { recursive: true, force: true });
  fs.rmSync(unpackRoot, { recursive: true, force: true });
});

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
  jest.spyOn(os, "tmpdir").mockReturnValue(unpackRoot);
  for (const entry of fs.readdirSync(storageRoot)) {
    fs.rmSync(path.join(storageRoot, entry), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(templatesDir, WORLD_ID, "images"), { recursive: true });
  fs.writeFileSync(path.join(templatesDir, WORLD_ID, "template.json"), JSON.stringify(storedWorld(), null, 2));
  fs.writeFileSync(path.join(templatesDir, WORLD_ID, "images", "cover.jpeg"), "the creator's cover");
  entries.clear();
  entries.set(WORLD_ID, {
    id: WORLD_ID,
    creatorId: CREATOR.id,
    creatorUsername: CREATOR.username,
    publicationStatus: "draft",
    showOnWelcomeScreen: false,
    orderValue: 999,
    title: "Lantern Coast",
  });
  verifyToken.mockImplementation(
    async (session) => ACCOUNTS.find((caller) => sessionOf(caller) === session) ?? null
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  verifyToken.mockReset();
});

const NOT_THE_CREATOR: [string, PublicUser][] = [
  ["another worldbuilder", OTHER_BUILDER],
  ["a player", PLAYER],
];

describe("POST /templates naming an existing World", () => {
  it.each(NOT_THE_CREATOR)("refuses %s with 403, leaving the World as it was", async (_who, caller) => {
    const before = everythingStored();

    const answer = await create(caller, {
      id: WORLD_ID,
      title: "Taken",
      creatorId: caller.id,
      publicationStatus: "private",
    });

    expect(answer.status).toBe(403);
    expect(everythingStored()).toEqual(before);
  });

  it("refuses a visitor who isn't signed in with 401", async () => {
    const before = everythingStored();

    const answer = await create(undefined, { id: WORLD_ID, title: "Taken" });

    expect(answer.status).toBe(401);
    expect(everythingStored()).toEqual(before);
  });

  it("answers 404 for a World whose folder exists without its entry, writing nothing", async () => {
    fs.mkdirSync(path.join(templatesDir, NEW_ID));
    fs.writeFileSync(path.join(templatesDir, NEW_ID, "template.json"), worldJson({ id: NEW_ID }));
    const before = everythingStored();

    const answer = await create(CREATOR, { id: NEW_ID, title: "Taken" });

    expect(answer.status).toBe(404);
    expect(everythingStored()).toEqual(before);
  });

  it("lets the creator save their World, which stays theirs whatever creator the body names", async () => {
    const answer = await create(CREATOR, {
      ...storedWorld(),
      title: "Lantern Coast, revised",
      creatorId: OTHER_BUILDER.id,
      creatorUsername: OTHER_BUILDER.username,
    });

    expect(answer.status).toBe(201);
    expect(worldFile(WORLD_ID)).toMatchObject({
      title: "Lantern Coast, revised",
      creatorId: CREATOR.id,
      creatorUsername: CREATOR.username,
    });
    expect(entries.get(WORLD_ID)).toMatchObject({ title: "Lantern Coast, revised", creatorId: CREATOR.id });
  });

  it("lets an admin save someone else's World, which keeps its creator", async () => {
    const answer = await create(ADMIN, { id: WORLD_ID, title: "Lantern Coast, edited" });

    expect(answer.status).toBe(201);
    expect(worldFile(WORLD_ID)).toMatchObject({ title: "Lantern Coast, edited", creatorId: CREATOR.id });
    expect(entries.get(WORLD_ID)).toMatchObject({ creatorId: CREATOR.id });
  });

  it.each([
    ["publishing it", { publicationStatus: "published" }],
    ["putting it on the welcome screen", { showOnWelcomeScreen: true }],
    ["moving it on the welcome screen", { order: 1 }],
  ])("refuses the creator %s without the permission for it, as saving it would", async (_what, fields) => {
    const before = everythingStored();

    const answer = await create(CREATOR, { id: WORLD_ID, ...fields });

    expect(answer.status).toBe(403);
    expect(everythingStored()).toEqual(before);
  });

  it("lets the creator send the welcome-screen settings the World already has", async () => {
    const answer = await create(CREATOR, {
      id: WORLD_ID,
      title: "Lantern Coast, again",
      showOnWelcomeScreen: false,
      order: 999,
      publicationStatus: "review",
    });

    expect(answer.status).toBe(201);
    expect(entries.get(WORLD_ID)).toMatchObject({ publicationStatus: "review" });
  });
});

describe("POST /templates creating a World", () => {
  it("gives a World created as the editor creates it, with an empty id, a fresh UUID owned by the caller", async () => {
    const answer = await create(OTHER_BUILDER, {
      id: "",
      title: "",
      publicationStatus: "draft",
      showOnWelcomeScreen: false,
      order: 999,
    });

    expect(answer.status).toBe(201);
    const id = (answer.body.data?.template as Record<string, unknown>).id as string;
    expect(id).toMatch(UUID_V4);
    expect(id).not.toBe(WORLD_ID);
    expect(worldFile(id)).toMatchObject({ id, creatorId: OTHER_BUILDER.id });
    expect(entries.get(id)).toMatchObject({ creatorId: OTHER_BUILDER.id });
  });

  it("creates the World under a new UUID the body names, owned by the caller whatever creator it names", async () => {
    const answer = await create(OTHER_BUILDER, { id: NEW_ID, title: "Second Light", creatorId: ADMIN.id });

    expect(answer.status).toBe(201);
    expect(worldFile(NEW_ID)).toMatchObject({ id: NEW_ID, title: "Second Light", creatorId: OTHER_BUILDER.id });
    expect(entries.get(NEW_ID)).toMatchObject({ creatorId: OTHER_BUILDER.id });
  });

  it.each([
    ["a parent path", "../escape"],
    ["a path through a parent", "x/../../../escape"],
    ["a plain name", "my-world"],
    ["a number", 42],
    ["an object", {}],
  ])("refuses an id that is %s with 400, writing nothing", async (_what, id) => {
    const before = everythingStored();

    const answer = await create(ADMIN, { id, title: "Escape" });

    expect(answer.status).toBe(400);
    expect(everythingStored()).toEqual(before);
  });

  it.each([
    ["published", { publicationStatus: "published" }],
    ["on the welcome screen", { showOnWelcomeScreen: true }],
  ])("refuses a worldbuilder creating a World %s, writing nothing", async (_what, fields) => {
    const before = everythingStored();

    const answer = await create(OTHER_BUILDER, { title: "Fresh", ...fields });

    expect(answer.status).toBe(403);
    expect(everythingStored()).toEqual(before);
  });

  it("lets an admin create a published World on the welcome screen", async () => {
    const answer = await create(ADMIN, {
      title: "Showcase",
      publicationStatus: "published",
      showOnWelcomeScreen: true,
      order: 1,
    });

    expect(answer.status).toBe(201);
    const id = (answer.body.data?.template as Record<string, unknown>).id as string;
    expect(entries.get(id)).toMatchObject({
      creatorId: ADMIN.id,
      publicationStatus: "published",
      showOnWelcomeScreen: true,
      orderValue: 1,
    });
  });
});

describe("PUT /templates/:id", () => {
  it("keeps the World its creator's whatever creator the creator's save names", async () => {
    const answer = await send("PUT", `/templates/${WORLD_ID}`, CREATOR, {
      json: { template: { title: "Renamed", creatorId: OTHER_BUILDER.id } },
    });

    expect(answer.status).toBe(200);
    expect(worldFile(WORLD_ID)).toMatchObject({ title: "Renamed", creatorId: CREATOR.id });
    expect(entries.get(WORLD_ID)).toMatchObject({ creatorId: CREATOR.id });
  });

  it("refuses the creator putting their World on the welcome screen, and lets them send the settings it has", async () => {
    const before = everythingStored();

    const refused = await send("PUT", `/templates/${WORLD_ID}`, CREATOR, {
      json: { template: { showOnWelcomeScreen: true } },
    });

    expect(refused.status).toBe(403);
    expect(everythingStored()).toEqual(before);

    const allowed = await send("PUT", `/templates/${WORLD_ID}`, CREATOR, {
      json: { template: { title: "Renamed", showOnWelcomeScreen: false, order: 999 } },
    });

    expect(allowed.status).toBe(200);
    expect(worldFile(WORLD_ID)).toMatchObject({ title: "Renamed" });
  });

  it("refuses the creator publishing their World", async () => {
    const answer = await send("PUT", `/templates/${WORLD_ID}`, CREATOR, {
      json: { template: { publicationStatus: "published" } },
    });

    expect(answer.status).toBe(403);
    expect(worldFile(WORLD_ID)).toEqual(storedWorld());
  });

  it("lets an admin hand a World to another account", async () => {
    const answer = await send("PUT", `/templates/${WORLD_ID}`, ADMIN, {
      json: { template: { creatorId: OTHER_BUILDER.id } },
    });

    expect(answer.status).toBe(200);
    expect(entries.get(WORLD_ID)).toMatchObject({ creatorId: OTHER_BUILDER.id });
  });
});

/** A zip of a World's files, with template.json at its root or in a folder named by the World's id (as an export lays it out). */
const LAYOUTS: [string, (files: Record<string, string>, id: string) => Record<string, string>][] = [
  ["at the zip's root", (files) => files],
  [
    "in a folder named by its id",
    (files, id) => Object.fromEntries(Object.entries(files).map(([name, content]) => [`${id}/${name}`, content])),
  ],
];

describe("POST /templates/import over an existing World", () => {
  const takeover = {
    "template.json": worldJson({ title: "Taken" }),
    "images/cover.jpeg": "someone else's cover",
    "images/planted.jpeg": "someone else's image",
  };

  describe.each(LAYOUTS)("with the World's files %s", (_layout, layout) => {
    it.each(NOT_THE_CREATOR)("refuses %s with 403, writing nothing", async (_who, caller) => {
      const before = everythingStored();

      const answer = await importZip(caller, layout(takeover, WORLD_ID));

      expect(answer.status).toBe(403);
      expect(everythingStored()).toEqual(before);
    });

    it("lets the creator import over their World", async () => {
      const answer = await importZip(
        CREATOR,
        layout(
          {
            "template.json": worldJson({ title: "Lantern Coast, from the zip" }),
            "images/cover.jpeg": "the creator's new cover",
            "images/harbour.jpeg": "the creator's harbour",
          },
          WORLD_ID
        )
      );

      expect(answer.status).toBe(200);
      expect(answer.body.data).toMatchObject({ isNewTemplate: false });
      expect(worldFile(WORLD_ID)).toMatchObject({ title: "Lantern Coast, from the zip", creatorId: CREATOR.id });
      const files = storedFiles();
      expect(files[storedKey(WORLD_ID, "images", "cover.jpeg")]).toBe("the creator's new cover");
      expect(files[storedKey(WORLD_ID, "images", "harbour.jpeg")]).toBe("the creator's harbour");
      expect(entries.get(WORLD_ID)).toMatchObject({ title: "Lantern Coast, from the zip", creatorId: CREATOR.id });
    });
  });

  it("refuses a visitor who isn't signed in with 401, writing nothing", async () => {
    const before = everythingStored();

    const answer = await importZip(undefined, takeover);

    expect(answer.status).toBe(401);
    expect(everythingStored()).toEqual(before);
  });

  it("refuses the creator importing their World published without the permission for it", async () => {
    const before = everythingStored();

    const answer = await importZip(CREATOR, { "template.json": worldJson({ publicationStatus: "published" }) });

    expect(answer.status).toBe(403);
    expect(everythingStored()).toEqual(before);
  });

  it("lets the creator add files to their World with a zip that holds no template.json", async () => {
    const answer = await importZip(CREATOR, { [`${WORLD_ID}/images/lamp.jpeg`]: "the creator's lamp" });

    expect(answer.status).toBe(200);
    expect(worldFile(WORLD_ID)).toEqual(storedWorld());
    expect(storedFiles()[storedKey(WORLD_ID, "images", "lamp.jpeg")]).toBe("the creator's lamp");
  });

  it("lets an admin import over someone else's World, which keeps its creator", async () => {
    const answer = await importZip(ADMIN, {
      "template.json": worldJson({ title: "Lantern Coast, published", publicationStatus: "published", creatorId: ADMIN.id }),
    });

    expect(answer.status).toBe(200);
    expect(worldFile(WORLD_ID)).toMatchObject({ title: "Lantern Coast, published", creatorId: CREATOR.id });
    expect(entries.get(WORLD_ID)).toMatchObject({ publicationStatus: "published", creatorId: CREATOR.id });
  });
});

describe("POST /templates/import of a new World", () => {
  it.each(LAYOUTS)(
    "imports it with its files %s under the zip's UUID, owned by the importer whatever creator it names",
    async (_layout, layout) => {
      const answer = await importZip(
        OTHER_BUILDER,
        layout(
          {
            "template.json": worldJson({ id: NEW_ID, title: "Second Light", creatorId: ADMIN.id, creatorUsername: ADMIN.username }),
            "images/cover.jpeg": "the second cover",
          },
          NEW_ID
        )
      );

      expect(answer.status).toBe(200);
      expect(answer.body.data).toMatchObject({ isNewTemplate: true });
      expect(worldFile(NEW_ID)).toMatchObject({
        id: NEW_ID,
        title: "Second Light",
        creatorId: OTHER_BUILDER.id,
        creatorUsername: OTHER_BUILDER.username,
      });
      expect(storedFiles()[storedKey(NEW_ID, "images", "cover.jpeg")]).toBe("the second cover");
      expect(entries.get(NEW_ID)).toMatchObject({ creatorId: OTHER_BUILDER.id });
    }
  );

  it.each([
    ["a parent path", "../../escape"],
    ["a plain name", "images"],
    ["a number", 7],
  ])("refuses a World id that is %s with 400, writing nothing", async (_what, id) => {
    const before = everythingStored();

    const answer = await importZip(ADMIN, {
      "template.json": worldJson({ id, title: "Escape" }),
      "images/cover.jpeg": "escaped",
    });

    expect(answer.status).toBe(400);
    expect(everythingStored()).toEqual(before);
  });

  it("refuses a zip that holds only files, for a World that doesn't exist, with 400", async () => {
    const before = everythingStored();

    const answer = await importZip(ADMIN, { [`${NEW_ID}/images/cover.jpeg`]: "a cover for nothing" });

    expect(answer.status).toBe(400);
    expect(everythingStored()).toEqual(before);
  });

  it.each([
    ["published", { publicationStatus: "published" }],
    ["on the welcome screen", { showOnWelcomeScreen: true }],
  ])("refuses a worldbuilder importing it %s, writing nothing", async (_what, fields) => {
    const before = everythingStored();

    const answer = await importZip(OTHER_BUILDER, { "template.json": worldJson({ id: NEW_ID, ...fields }) });

    expect(answer.status).toBe(403);
    expect(everythingStored()).toEqual(before);
  });

  it("removes the unpacked zip whether the import is refused or goes through", async () => {
    const outcomes = [
      await importZip(OTHER_BUILDER, { "template.json": worldJson({ title: "Taken" }) }),
      await importZip(ADMIN, { "template.json": worldJson({ id: "../../escape" }) }),
      await importZip(OTHER_BUILDER, { "template.json": worldJson({ id: NEW_ID }) }),
    ];

    expect(outcomes.map((answer) => answer.status)).toEqual([403, 400, 200]);
    expect(fs.readdirSync(unpackRoot)).toEqual([]);
  });

  it("keeps every file of the zip inside the World's folder", async () => {
    const before = storedFiles();

    const answer = await importZip(CREATOR, {
      "template.json": worldJson({ id: NEW_ID, title: "Third Light" }),
      "../../outside.txt": "out of the World",
      "images/../../../../outside-too.txt": "further out",
    });

    expect(answer.status).toBe(200);
    const added = Object.keys(storedFiles()).filter((name) => !(name in before));
    expect(added).toContain(storedKey(NEW_ID, "template.json"));
    for (const name of added) {
      expect(name.startsWith(storedKey(NEW_ID) + path.sep)).toBe(true);
    }
  });
});
