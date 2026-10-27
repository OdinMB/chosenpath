import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { responseHeaders, routeRequest, startFrontDoor, staticFile, type FrontDoor } from "../../../../harness/lib/front-door.mjs";

/*
 * The harness's front door (harness/lib/front-door.mjs): the one origin the
 * browser talks to. Here in front of a stub server that echoes what reached
 * it, and a folder standing in for the built client.
 */

type Seen = { method?: string; url?: string; origin?: string; host?: string };

let upstream: http.Server;
let upstreamPort: number;
let frontDoor: FrontDoor;
let staticDir: string;
let staticReady = false;
const seen: Seen[] = [];
const upgraded: { destroy: () => void }[] = [];

beforeAll(async () => {
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "front-door-test-"));
  fs.mkdirSync(path.join(staticDir, "assets"));
  fs.writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>index</title>");
  fs.writeFileSync(path.join(staticDir, "assets", "app.js"), "console.log('app')");

  upstream = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, origin: req.headers.origin, host: req.headers.host });
    if (req.url === "/chunked") {
      // Streamed without a length, as socket.io's polling and Express's large answers are
      res.writeHead(200, { "content-type": "text/plain", connection: "keep-alive", "keep-alive": "timeout=5" });
      res.write("first ");
      setTimeout(() => res.end("second"), 20);
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "set-cookie": "XSRF-TOKEN=abc; Path=/" });
    res.end(JSON.stringify({ url: req.url }));
  });
  upstream.on("upgrade", (req, socket) => {
    seen.push({ method: "UPGRADE", url: req.url, origin: req.headers.origin, host: req.headers.host });
    upgraded.push(socket);
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    socket.on("data", (data) => socket.write(data));
    socket.on("end", () => socket.end());
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
  upstreamPort = (upstream.address() as net.AddressInfo).port;
  frontDoor = await startFrontDoor({ upstreamPort: () => upstreamPort, staticRoot: () => (staticReady ? staticDir : undefined) });
});

afterAll(async () => {
  await frontDoor.close();
  for (const socket of upgraded) socket.destroy();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  fs.rmSync(staticDir, { recursive: true, force: true });
});

function get(urlPath: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; type: string; body: string; cookie: string[] }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: frontDoor.port, path: urlPath, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          type: String(res.headers["content-type"] ?? ""),
          body: Buffer.concat(chunks).toString("utf8"),
          cookie: res.headers["set-cookie"] ?? [],
        })
      );
    });
    req.on("error", reject);
    req.end();
  });
}

describe("the front door's routes", () => {
  it("sends /__api to the server without the prefix, /socket.io as it is, everything else to the files", () => {
    expect(routeRequest("/__api/templates/published?x=1")).toEqual({ to: "server", path: "/templates/published?x=1" });
    expect(routeRequest("/__api")).toEqual({ to: "server", path: "/" });
    expect(routeRequest("/socket.io/?EIO=4&transport=polling")).toEqual({ to: "server", path: "/socket.io/?EIO=4&transport=polling" });
    expect(routeRequest("/__apix/templates")).toEqual({ to: "static", pathname: "/__apix/templates" });
    expect(routeRequest("/library?tag=a")).toEqual({ to: "static", pathname: "/library" });
  });

  it("serves files from inside the client only, and index.html for page routes", () => {
    const root = path.resolve("/srv/client");
    const exists = (file: string) => file === path.join(root, "assets", "app.js");
    expect(staticFile(root, "/assets/app.js", exists)).toBe(path.join(root, "assets", "app.js"));
    expect(staticFile(root, "/templates/abc/configure", exists)).toBe(path.join(root, "index.html"));
    expect(staticFile(root, "/../../etc/passwd", exists)).toBe(path.join(root, "index.html"));
    expect(staticFile(root, "/%2e%2e/%2e%2e/etc/shadow.txt", exists)).toBeUndefined();
    expect(staticFile(root, "/missing.png", exists)).toBeUndefined();
  });
});

describe("the front door, in front of a server", () => {
  it("answers 503 for the client until its build is in place", async () => {
    staticReady = false;
    expect((await get("/library")).status).toBe(503);
  });

  it("passes API calls on without the browser's Origin, and the server's cookies back", async () => {
    const response = await get("/__api/templates/published?requestId=1", { origin: "http://127.0.0.1:1234", cookie: "a=b" });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ url: "/templates/published?requestId=1" });
    expect(response.cookie).toEqual(["XSRF-TOKEN=abc; Path=/"]);
    expect(seen.at(-1)).toEqual({ method: "GET", url: "/templates/published?requestId=1", origin: undefined, host: `127.0.0.1:${upstreamPort}` });
  });

  it("passes a streamed answer on whole, framing it itself", async () => {
    const response = await get("/__api/chunked");
    expect(response.status).toBe(200);
    expect(response.body).toBe("first second");
    expect(responseHeaders({ connection: "keep-alive", "keep-alive": "timeout=5", "Transfer-Encoding": "chunked", "set-cookie": ["a=b"], "content-type": "text/plain" })).toEqual({
      "set-cookie": ["a=b"],
      "content-type": "text/plain",
    });
  });

  it("serves the built client, with index.html for any page route", async () => {
    staticReady = true;
    const page = await get("/game/ABCD-1234");
    expect(page.status).toBe(200);
    expect(page.type).toContain("text/html");
    expect(page.body).toContain("<title>index</title>");
    const script = await get("/assets/app.js");
    expect(script.type).toContain("text/javascript");
    expect(script.body).toBe("console.log('app')");
    expect((await get("/assets/missing.js")).status).toBe(404);
  });

  it("passes socket.io's WebSocket upgrade on without the Origin, and relays both ways", async () => {
    const socket = net.connect({ host: "127.0.0.1", port: frontDoor.port });
    const received: string[] = [];
    socket.on("data", (data) => received.push(data.toString("utf8")));
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.write(
      "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nOrigin: http://127.0.0.1:1234\r\n\r\n"
    );
    await waitFor(() => received.join("").includes("101 Switching Protocols"));
    socket.write("ping");
    await waitFor(() => received.join("").endsWith("ping"));
    socket.destroy();
    expect(seen.at(-1)).toEqual({ method: "UPGRADE", url: "/socket.io/?EIO=4&transport=websocket", origin: undefined, host: `127.0.0.1:${upstreamPort}` });
  });

  it("closes an upgrade for anything but socket.io", async () => {
    const socket = net.connect({ host: "127.0.0.1", port: frontDoor.port });
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    socket.write("GET /other HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    await closed;
    expect(seen.at(-1)?.url).not.toBe("/other");
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
