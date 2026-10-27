import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import http from "node:http";
import type net from "node:net";
import { startFrontDoor, type FrontDoor } from "../../../../harness/lib/front-door.mjs";
import { fixtureTemplates, provisionTemplates } from "../../../../harness/lib/provision.mjs";
import { CSRF_COOKIE, csrfFailure } from "../../../src/shared/csrf.js";

/*
 * How the harness makes its fixture templates (harness/lib/provision.mjs):
 * through the front door, as the browser calls the API, against a stub that
 * answers the four routes it uses the way the server does (the CSRF cookie
 * on a first request, the product's own double-submit check, the auth
 * cookie, the response envelope). Nothing of the product starts.
 */

type Call = { method?: string; path: string; body: unknown; csrf: string | null };

const calls: Call[] = [];
let editorPassword = "fixture-editor-password";
let upstream: http.Server;
let frontDoor: FrontDoor;

function cookies(header: string | undefined) {
  return Object.fromEntries(
    String(header ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => [part.slice(0, part.indexOf("=")), part.slice(part.indexOf("=") + 1)])
  );
}

function send(res: http.ServerResponse, status: number, body: Record<string, unknown>, setCookies: string[]) {
  if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const jar = cookies(req.headers.cookie);
      const text = Buffer.concat(chunks).toString("utf8");
      const body = text ? JSON.parse(text) : undefined;
      const csrfHeader = req.headers["x-csrf-token"];
      calls.push({ method: req.method, path: String(req.url), body, csrf: typeof csrfHeader === "string" ? csrfHeader : null });
      const setCookies = jar[CSRF_COOKIE] ? [] : [`${CSRF_COOKIE}=token-123; Path=/; SameSite=Lax`];
      const success = (status: number, data: unknown) => send(res, status, { status: "success", requestId: "r", timestamp: 1, data }, setCookies);
      const failure = (status: number, errorMessage: string) => send(res, status, { status: "error", errorMessage }, setCookies);

      if (csrfFailure(req.method ?? "GET", csrfHeader, jar[CSRF_COOKIE])) return failure(403, "CSRF token validation failed");
      if (req.method === "GET" && req.url === "/templates/published") return success(200, { templates: [] });
      if (req.method === "POST" && req.url === "/auth/login") {
        if (body?.email !== "editor@example.com" || body?.password !== editorPassword) return failure(401, "Invalid credentials");
        setCookies.push("authToken=signed-in; Path=/; HttpOnly; SameSite=Lax");
        return success(200, { user: { email: body.email } });
      }
      if (jar.authToken !== "signed-in") return failure(401, "Not signed in");
      if (req.method === "POST" && req.url === "/templates/generate") {
        if (body?.playerCount > 3) return failure(500, "Failed to generate template");
        const drafted = body?.playerCount === 3 ? { id: "tpl-2", title: "An island in winter" } : { id: "tpl-1", title: "A harbour town" };
        return success(201, { template: drafted });
      }
      const put = /^\/templates\/(tpl-[12])$/.exec(String(req.url));
      if (req.method === "PUT" && put) return success(200, { template: { id: put[1], ...body.template } });
      return failure(404, "Not found");
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
  const port = (upstream.address() as net.AddressInfo).port;
  frontDoor = await startFrontDoor({ upstreamPort: () => port, staticRoot: () => undefined });
});

afterAll(async () => {
  await frontDoor.close();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

const editor = { email: "editor@example.com", password: "fixture-editor-password" };
const solo = { premise: "A harbour town", playerCount: 1, maxTurns: 5, gameMode: "single-player" };
const group = { premise: "An island in winter", playerCount: 3, playerCountMin: 2, maxTurns: 5, gameMode: "cooperative" };
const fixture = { editor, templates: { template: solo } };

describe("provisioning the fixture templates", () => {
  it("signs in, drafts the template from the premise and publishes it, sending the CSRF token on every change", async () => {
    calls.length = 0;
    await expect(provisionTemplates(frontDoor.origin, fixture)).resolves.toEqual({
      template: { id: "tpl-1", title: "A harbour town", playerCountMin: 1, playerCountMax: 1, gameMode: "single-player", maxTurns: 5 },
    });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /templates/published",
      "POST /auth/login",
      "POST /templates/generate",
      "PUT /templates/tpl-1",
    ]);
    expect(calls.slice(1).every((call) => call.csrf === "token-123")).toBe(true);
    expect(calls[2].body).toEqual({ prompt: "A harbour town", playerCount: 1, maxTurns: 5, gameMode: "single-player", generateImages: false });
    expect(calls[3].body).toEqual({ template: { publicationStatus: "published" } });
  });

  it("signs in once for both Worlds, and publishes the group one, drafted for three seats, for two to three players", async () => {
    calls.length = 0;
    await expect(provisionTemplates(frontDoor.origin, { editor, templates: { template: solo, groupTemplate: group } })).resolves.toEqual({
      template: { id: "tpl-1", title: "A harbour town", playerCountMin: 1, playerCountMax: 1, gameMode: "single-player", maxTurns: 5 },
      groupTemplate: { id: "tpl-2", title: "An island in winter", playerCountMin: 2, playerCountMax: 3, gameMode: "cooperative", maxTurns: 5 },
    });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /templates/published",
      "POST /auth/login",
      "POST /templates/generate",
      "PUT /templates/tpl-1",
      "POST /templates/generate",
      "PUT /templates/tpl-2",
    ]);
    expect(calls[4].body).toEqual({ prompt: "An island in winter", playerCount: 3, maxTurns: 5, gameMode: "cooperative", generateImages: false });
    expect(calls[5].body).toEqual({ template: { publicationStatus: "published", playerCountMin: 2, playerCountMax: 3 } });
  });

  it("says which World failed, and why", async () => {
    await expect(
      provisionTemplates(frontDoor.origin, { editor, templates: { template: solo, groupTemplate: { ...group, playerCount: 4 } } })
    ).rejects.toThrow("drafting the fixture groupTemplate failed (HTTP 500: Failed to generate template)");
  });

  it("says which step failed, and why, when the editor can't sign in", async () => {
    editorPassword = "a different password";
    try {
      await expect(provisionTemplates(frontDoor.origin, fixture)).rejects.toThrow(/signing in as the fixture editor.*HTTP 401: Invalid credentials/);
    } finally {
      editorPassword = "fixture-editor-password";
    }
  });
});

describe("the Worlds a run makes", () => {
  const fixtureVars = { template: solo, groupTemplate: group };

  it("are fixture-vars.json's, under the names a journey reads them by", () => {
    expect(fixtureTemplates(fixtureVars)).toEqual({ template: solo, groupTemplate: group });
  });

  it("take the group World's game mode from --group-mode, and leave the single-player one alone", () => {
    expect(fixtureTemplates(fixtureVars, { groupMode: "competitive" })).toEqual({ template: solo, groupTemplate: { ...group, gameMode: "competitive" } });
  });

  it("are both as long as --story-length says, with or without --group-mode", () => {
    expect(fixtureTemplates(fixtureVars, { storyLength: 3 })).toEqual({ template: { ...solo, maxTurns: 3 }, groupTemplate: { ...group, maxTurns: 3 } });
    expect(fixtureTemplates(fixtureVars, { groupMode: "competitive", storyLength: 25 })).toEqual({
      template: { ...solo, maxTurns: 25 },
      groupTemplate: { ...group, gameMode: "competitive", maxTurns: 25 },
    });
  });
});
