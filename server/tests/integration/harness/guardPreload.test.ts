import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  GUARD_TEST_CASES,
  PLANTED_VARIABLE,
  outputLayout,
  parseMarker,
  productEnvironment,
  type CreatedTargets,
} from "../../../../harness/lib/guard.mjs";

/*
 * The guard as the harness runs it: a real process with the harness's
 * environment, tsx, the guard preload (which loads the product's
 * configuration and checks it) and, in place of the product's entry, a stub
 * that only says it ran. Nothing of the product starts: no database, no
 * server. Each negative test must stop the process before the stub runs.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const serverDir = path.join(repoRoot, "server");
const tsxLoader = pathToFileURL(path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs")).href;
const preload = pathToFileURL(path.join(repoRoot, "harness", "lib", "server-preload.mjs")).href;
const fixtureVars = JSON.parse(fs.readFileSync(path.join(repoRoot, "harness", "fixture-vars.json"), "utf8"));

let outDir: string;
let layout: ReturnType<typeof outputLayout>;
let created: CreatedTargets;

beforeAll(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-guard-test-"));
  layout = outputLayout(outDir);
  for (const dir of [layout.guard, layout.home, layout.tmp, layout.serverWork]) fs.mkdirSync(dir, { recursive: true });
  created = {
    db: { host: "127.0.0.1", port: 54011, database: fixtureVars.server.DB_DATABASE },
    openaiBaseUrl: "http://127.0.0.1:54012/v1",
    outDir,
  };
});

afterAll(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

/**
 * The command that runs `entrySource` as the product's entry under the
 * guard, with the given negative test and, beyond the two created targets,
 * `extraPorts` allowed (as the harness allows the ports it started).
 */
function guardedCommand(entrySource: string, guardTest: string | null, extraPorts: number[] = []) {
  const id = Math.random().toString(36).slice(2);
  const entry = path.join(outDir, `entry-${id}.mjs`);
  fs.writeFileSync(entry, entrySource);
  const manifestPath = path.join(layout.guard, `server-${id}.json`);
  const env = productEnvironment({
    parentEnv: process.env,
    platform: process.platform,
    layout,
    fixtureVars,
    created,
    manifestPath,
    tsconfigPath: path.join(serverDir, "tsconfig.json"),
  });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ role: "server", serverDir, outDir, guardTest, allowedPorts: [54011, 54012, ...extraPorts], expectedEnv: env, created })
  );
  return { args: ["--import", tsxLoader, "--import", preload, entry], options: { cwd: layout.serverWork, env } };
}

function markersIn(stdout: string) {
  return stdout
    .split("\n")
    .map((line) => parseMarker(line))
    .filter((marker): marker is Record<string, unknown> => marker !== undefined);
}

/** Runs `entrySource` under the guard, blocking: for entries that need nothing from this process. */
function runGuarded(entrySource: string, guardTest: string | null) {
  const { args, options } = guardedCommand(entrySource, guardTest);
  const result = spawnSync(process.execPath, args, { ...options, encoding: "utf8", timeout: 90_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, markers: markersIn(result.stdout) };
}

/** Runs `entrySource` under the guard without blocking this process, so a server here can answer it. */
function runGuardedAsync(entrySource: string, extraPorts: number[]) {
  const { args, options } = guardedCommand(entrySource, null, extraPorts);
  return new Promise<{ status: number | null; stdout: string; stderr: string; markers: Record<string, unknown>[] }>((resolve, reject) => {
    const child = spawn(process.execPath, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, markers: markersIn(stdout) });
    });
  });
}

const STUB = 'process.stdout.write("stub entry ran\\n");\n';

describe("the guard preload, in a real process", () => {
  it("passes the harness's own environment and lets the entry run", () => {
    const run = runGuarded(STUB, null);
    expect(run.stderr).not.toContain("hermetic-guard: refused");
    expect(run.status).toBe(0);
    expect(run.markers).toContainEqual({ ok: "server" });
    expect(run.stdout).toContain("stub entry ran");
  }, 120_000);

  it.each(GUARD_TEST_CASES)("--guard-test=%s: exits non-zero before the entry runs", (testCase) => {
    const run = runGuarded(STUB, testCase);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("hermetic-guard: refused");
    expect(run.stdout).not.toContain("stub entry ran");
    expect(run.markers.some((marker) => Array.isArray(marker.refused))).toBe(true);
    expect(run.stderr).toContain(testCase === "env" ? PLANTED_VARIABLE : "database target");
  }, 120_000);

  it("refuses a connection to a port the harness didn't start, before any lookup, and reports it", () => {
    const entry = `
      import net from "node:net";
      for (const [host, port] of [["127.0.0.1", 9], ["guard-test.invalid", 5432]]) {
        const socket = net.connect({ host, port });
        socket.on("error", (error) => process.stdout.write(\`refused \${host} \${error.code}\\n\`));
      }
    `;
    const run = runGuarded(entry, null);
    expect(run.status).toBe(0);
    expect(run.markers).toEqual(
      expect.arrayContaining([{ refusedConnection: "127.0.0.1:9" }, { refusedConnection: "guard-test.invalid:5432" }])
    );
    expect(run.stdout).toContain("refused 127.0.0.1 ECONNREFUSED");
    expect(run.stdout).toContain("refused guard-test.invalid ECONNREFUSED");
  }, 120_000);

  it("lets http.request and fetch reach a port the harness started, direct past the closed proxy, and still refuses a unix socket", async () => {
    // A server the harness "started": here, in this process, on 127.0.0.1
    const seen: string[] = [];
    const upstream = http.createServer((req, res) => {
      seen.push(String(req.url));
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    const port = (upstream.address() as net.AddressInfo).port;
    try {
      const entry = `
        import http from "node:http";
        import net from "node:net";
        const port = ${port};
        const viaHttp = await new Promise((resolve) => {
          const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/via-http?x=1", headers: { "content-type": "application/json" } }, (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
          });
          req.on("error", (error) => resolve(error.code ?? error.message));
          req.end("{}");
        });
        process.stdout.write(\`http \${viaHttp}\\n\`);
        const viaGet = await new Promise((resolve) => {
          http.get(\`http://127.0.0.1:\${port}/via-get\`, (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode));
          }).on("error", (error) => resolve(error.code ?? error.message));
        });
        process.stdout.write(\`get \${viaGet}\\n\`);
        const viaFetch = await fetch(\`http://127.0.0.1:\${port}/via-fetch\`).then(
          (res) => res.status,
          (error) => String(error.cause?.code ?? error.message)
        );
        process.stdout.write(\`fetch \${viaFetch}\\n\`);
        const viaPipe = await new Promise((resolve) => {
          const socket = net.connect({ path: "/some/socket" });
          socket.on("connect", () => resolve("connected"));
          socket.on("error", (error) => resolve(error.code));
        });
        process.stdout.write(\`pipe \${viaPipe}\\n\`);
        process.exit(0);
      `;
      const run = await runGuardedAsync(entry, [port]);
      expect(run.stderr).not.toContain("hermetic-guard: refused");
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("http 200");
      expect(run.stdout).toContain("get 200");
      expect(run.stdout).toContain("fetch 200");
      expect(seen).toEqual(expect.arrayContaining(["/via-http?x=1", "/via-get", "/via-fetch"]));
      // Only the unix socket was refused: nothing went to the closed proxy or elsewhere
      expect(run.stdout).toContain("pipe ECONNREFUSED");
      expect(run.markers.filter((marker) => marker.refusedConnection)).toEqual([{ refusedConnection: "socket /some/socket" }]);
    } finally {
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  }, 120_000);

  it("moves a listen on the product's port onto 127.0.0.1 and a port the system picks", () => {
    const entry = `
      import http from "node:http";
      const server = http.createServer();
      server.listen(3000, () => {
        process.stdout.write(\`address \${server.address().address}\\n\`);
        server.close();
      });
    `;
    const run = runGuarded(entry, null);
    expect(run.status).toBe(0);
    const listening = run.markers.find((marker) => marker.listening) as { listening: { requested: number; port: number } } | undefined;
    expect(listening?.listening.requested).toBe(3000);
    expect(listening?.listening.port).not.toBe(3000);
    expect(run.stdout).toContain("address 127.0.0.1");
  }, 120_000);
});
