import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/*
 * The front door as harness/run.mjs runs it: in a process whose connect and
 * listen guards are installed (harness/lib/net-guard.mjs), in front of a stub
 * server standing in for the product's. Its API calls and socket.io's
 * WebSocket upgrade must get through to a port the harness started, and be
 * refused for any other. Nothing of the product starts.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const netGuard = pathToFileURL(path.join(repoRoot, "harness", "lib", "net-guard.mjs")).href;
const frontDoorModule = pathToFileURL(path.join(repoRoot, "harness", "lib", "front-door.mjs")).href;

type Seen = { method?: string; url?: string; origin?: string; body?: string };

let scratch: string;
let script: string;
let upstream: http.Server;
let upstreamPort: number;
const seen: Seen[] = [];
const upgraded: net.Socket[] = [];

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "harness-guarded-front-door-"));
  script = path.join(scratch, "guarded-front-door.mjs");
  fs.writeFileSync(
    script,
    [
      `import { installConnectGuard, installListenGuard } from ${JSON.stringify(netGuard)};`,
      `import { startFrontDoor } from ${JSON.stringify(frontDoorModule)};`,
      "const upstreamPort = Number(process.argv[2]);",
      'const allowed = process.argv[3] === "allowed" ? [upstreamPort] : [];',
      "installConnectGuard({ allowedPorts: () => allowed, onRefused: (target) => process.stdout.write(`refused ${target}\\n`) });",
      "installListenGuard({ onListening: () => undefined });",
      "const door = await startFrontDoor({ upstreamPort: () => upstreamPort, staticRoot: () => undefined });",
      "process.stdout.write(`port ${door.port}\\n`);",
      "process.stdin.resume();",
      'process.stdin.on("end", async () => {',
      "  await door.close();",
      "  process.exit(0);",
      "});",
      "",
    ].join("\n")
  );

  upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, origin: req.headers.origin, body: Buffer.concat(chunks).toString("utf8") });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ url: req.url }));
    });
  });
  upstream.on("upgrade", (req, socket) => {
    seen.push({ method: "UPGRADE", url: req.url, origin: req.headers.origin });
    upgraded.push(socket as net.Socket);
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    socket.on("data", (data) => socket.write(data));
    socket.on("end", () => socket.end());
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
  upstreamPort = (upstream.address() as net.AddressInfo).port;
});

afterAll(async () => {
  for (const socket of upgraded) socket.destroy();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  fs.rmSync(scratch, { recursive: true, force: true });
});

/** Starts the guarded front door in its own process; `allowed` says whether the stub's port is one the harness started. */
async function startGuardedDoor(allowed: boolean) {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [script, String(upstreamPort), allowed ? "allowed" : "not-allowed"], {
    cwd: scratch,
    env: { PATH: process.env.PATH ?? "" },
  });
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the front door did not start: ${stderr}`)), 30_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const match = stdout.match(/^port (\d+)$/m);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.once("exit", (code) => reject(new Error(`the front door exited (${code}): ${stderr}`)));
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  return {
    port,
    output: () => stdout,
    stop: async () => {
      child.stdin.end();
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      await closed;
      clearTimeout(timer);
    },
  };
}

function request(port: number, method: string, urlPath: string, body?: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path: urlPath, headers: { origin: "http://127.0.0.1:1234", "content-type": "application/json" }, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

/** Sends socket.io's WebSocket upgrade through the front door; resolves with what came back (and after a ping, its echo). */
function upgrade(port: number) {
  return new Promise<string>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    let received = "";
    let pinged = false;
    const done = () => {
      socket.destroy();
      resolve(received);
    };
    const timer = setTimeout(done, 5_000);
    socket.on("data", (data) => {
      received += data.toString("utf8");
      if (!pinged && received.includes("\r\n\r\n")) {
        pinged = true;
        socket.write("ping");
      } else if (received.endsWith("ping")) {
        clearTimeout(timer);
        done();
      }
    });
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(received);
    });
    socket.on("connect", () =>
      socket.write(
        "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nOrigin: http://127.0.0.1:1234\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
      )
    );
  });
}

describe("the front door, with the harness's guard in its process", () => {
  it("passes API calls and socket.io's WebSocket upgrade to a port the harness started", async () => {
    const door = await startGuardedDoor(true);
    try {
      const get = await request(door.port, "GET", "/__api/templates/published?requestId=1");
      expect(get.status).toBe(200);
      expect(JSON.parse(get.body)).toEqual({ url: "/templates/published?requestId=1" });

      const post = await request(door.port, "POST", "/__api/auth/login", JSON.stringify({ email: "someone@example.com" }));
      expect(post.status).toBe(200);
      expect(seen.at(-1)).toEqual({ method: "POST", url: "/auth/login", origin: undefined, body: '{"email":"someone@example.com"}' });

      const polling = await request(door.port, "GET", "/socket.io/?EIO=4&transport=polling");
      expect(polling.status).toBe(200);

      const answer = await upgrade(door.port);
      expect(answer).toContain("101 Switching Protocols");
      expect(answer.endsWith("ping")).toBe(true);
      expect(seen.at(-1)).toEqual({ method: "UPGRADE", url: "/socket.io/?EIO=4&transport=websocket", origin: undefined });

      expect(door.output()).not.toContain("refused");
    } finally {
      await door.stop();
    }
  }, 60_000);

  it("refuses both, and reports it, when the server's port is not one the harness started", async () => {
    const door = await startGuardedDoor(false);
    try {
      const before = seen.length;
      const get = await request(door.port, "GET", "/__api/templates/published");
      expect(get.status).toBe(502);
      const answer = await upgrade(door.port);
      expect(answer).not.toContain("101");
      expect(seen.length).toBe(before);
      expect(door.output()).toContain(`refused 127.0.0.1:${upstreamPort}`);
    } finally {
      await door.stop();
    }
  }, 60_000);
});
