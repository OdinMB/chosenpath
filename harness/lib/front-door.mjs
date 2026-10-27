// The one origin the browser talks to, on 127.0.0.1 and a port the system
// picks: the built client's files (index.html for any page route), /__api/*
// passed to the server with the prefix taken off, and /socket.io/* passed on
// as it is, WebSocket upgrades included. The browser's Origin header is
// dropped on the way in, so the server sees same-origin requests and its CORS
// list (the development default) never has to name the harness's port.

import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { CLIENT_API_PREFIX } from "./guard.mjs";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// Hop-by-hop headers, and the ones that would make the server see a cross-origin request
const DROPPED_REQUEST_HEADERS = ["origin", "connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade"];
// Hop-by-hop headers of the server's answer: the front door frames its own
const DROPPED_RESPONSE_HEADERS = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade"];

/** The server's response headers without the hop-by-hop ones. */
export function responseHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!DROPPED_RESPONSE_HEADERS.includes(name.toLowerCase()) && value !== undefined) out[name] = value;
  }
  return out;
}

/** Where a request goes: the server (with its path there) or a static file. */
export function routeRequest(urlPath) {
  const [pathname, query = ""] = String(urlPath).split(/\?(.*)/s);
  const search = query ? `?${query}` : "";
  if (pathname === CLIENT_API_PREFIX || pathname.startsWith(`${CLIENT_API_PREFIX}/`)) {
    return { to: "server", path: `${pathname.slice(CLIENT_API_PREFIX.length) || "/"}${search}` };
  }
  if (pathname === "/socket.io" || pathname.startsWith("/socket.io/")) return { to: "server", path: `${pathname}${search}` };
  return { to: "static", pathname };
}

/** The file under `root` a page path serves: the file itself, or index.html for a route without a file extension. */
export function staticFile(root, pathname, exists = (file) => fs.existsSync(file) && fs.statSync(file).isFile()) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const file = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
  if (file !== root && !file.startsWith(root + path.sep)) return undefined;
  if (exists(file)) return file;
  if (path.extname(decoded) === "") return path.join(root, "index.html");
  return undefined;
}

function forwardHeaders(headers, upstreamPort) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!DROPPED_REQUEST_HEADERS.includes(name.toLowerCase()) && value !== undefined) out[name] = value;
  }
  out.host = `127.0.0.1:${upstreamPort}`;
  return out;
}

/**
 * Starts the front door. `upstreamPort()` is the server's port once it is
 * listening, `staticRoot()` the built client once it is there; until then
 * those requests get 503. `log` gets one line per refused or failed request.
 */
export async function startFrontDoor({ upstreamPort, staticRoot, log = () => undefined }) {
  const sockets = new Set();
  // Its own agent, so closing the front door also closes its kept-alive
  // connections to the server, which would otherwise hold the server's
  // shutdown open
  const agent = new http.Agent({ keepAlive: true });
  const server = http.createServer((req, res) => {
    const route = routeRequest(req.url ?? "/");
    if (route.to === "server") {
      const port = upstreamPort();
      if (!port) {
        res.writeHead(503, { "content-type": "text/plain" }).end("The server is still starting");
        return;
      }
      const upstream = http.request(
        { agent, host: "127.0.0.1", port, method: req.method, path: route.path, headers: forwardHeaders(req.headers, port) },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.statusMessage, responseHeaders(response.headers));
          response.pipe(res);
        }
      );
      upstream.on("error", (error) => {
        log(`front door: ${req.method} ${route.path} failed upstream (${error.message})`);
        if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
        res.end("The server did not answer");
      });
      req.pipe(upstream);
      return;
    }
    const root = staticRoot();
    if (!root) {
      res.writeHead(503, { "content-type": "text/plain", "cache-control": "no-store" }).end("The client is still building");
      return;
    }
    const file = staticFile(root, route.pathname);
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });

  server.on("upgrade", (req, socket, head) => {
    const route = routeRequest(req.url ?? "/");
    const port = upstreamPort();
    if (route.to !== "server" || !port) {
      socket.destroy();
      return;
    }
    const upstream = net.connect({ host: "127.0.0.1", port }, () => {
      const headers = forwardHeaders(req.headers, port);
      headers.connection = "Upgrade";
      headers.upgrade = req.headers.upgrade ?? "websocket";
      const lines = [`${req.method} ${route.path} HTTP/1.1`, ...Object.entries(headers).flatMap(([name, value]) =>
        (Array.isArray(value) ? value : [value]).map((v) => `${name}: ${v}`)
      )];
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const close = () => {
      upstream.destroy();
      socket.destroy();
    };
    upstream.on("error", close);
    socket.on("error", close);
    upstream.on("close", close);
    socket.on("close", close);
    sockets.add(upstream);
    upstream.on("close", () => sockets.delete(upstream));
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        agent.destroy();
        server.close(() => resolve());
      }),
  };
}
