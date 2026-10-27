// A throwaway PostgreSQL cluster under the output folder: initdb'd fresh,
// listening on 127.0.0.1 only on a port the harness picked, its unix socket
// (where the path is short enough) under the output folder too, and stopped
// and deleted on exit. As root on Linux, initdb and postgres refuse to run, so
// they run in a user namespace that maps root to an ordinary user.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

/** Unix socket paths are limited to 107 bytes (sun_path). */
const MAX_SOCKET_PATH = 107;
const NAMESPACE_UID = "1000";

function exe(name, platform) {
  return platform === "win32" ? `${name}.exe` : name;
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/**
 * The folder holding initdb and postgres: --pg-bin, else the first on PATH,
 * else the newest /usr/lib/postgresql/<version>/bin. Undefined when none has them.
 */
export function findPgBin({ pgBin, env, platform, exists = fs.existsSync, readdir = fs.readdirSync }) {
  const has = (dir) => exists(path.join(dir, exe("initdb", platform))) && exists(path.join(dir, exe("postgres", platform)));
  if (pgBin) return has(pgBin) ? path.resolve(pgBin) : undefined;
  const pathDirs = String(env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  const onPath = pathDirs.find(has);
  if (onPath) return onPath;
  if (platform === "win32") return undefined;
  let versions = [];
  try {
    versions = readdir("/usr/lib/postgresql").filter((name) => /^\d+(\.\d+)*$/.test(name));
  } catch {
    versions = [];
  }
  versions.sort(compareVersions).reverse();
  return versions.map((version) => path.join("/usr/lib/postgresql", version, "bin")).find(has);
}

/** The socket folder: the shortest under the output folder that fits, or "" (TCP only) when none does. */
export function socketDirectory(layout, port, platform) {
  if (platform === "win32") return "";
  for (const dir of [path.join(layout.pg, "socket"), path.join(layout.out, "s")]) {
    if (Buffer.byteLength(path.join(dir, `.s.PGSQL.${port}`)) <= MAX_SOCKET_PATH) return dir;
  }
  return "";
}

/**
 * The ordinary user root becomes in the namespace: one /etc/passwd names, since
 * initdb looks its user up (postgres, else nobody, else the first non-root entry).
 */
export function namespaceUser(passwdText) {
  const entries = String(passwdText)
    .split("\n")
    .map((line) => line.split(":"))
    .filter((fields) => fields.length >= 4 && /^\d+$/.test(fields[2]) && fields[2] !== "0")
    .map(([name, , uid, gid]) => ({ name, uid, gid }));
  return entries.find((e) => e.name === "postgres") ?? entries.find((e) => e.name === "nobody") ?? entries[0] ?? { name: "", uid: NAMESPACE_UID, gid: NAMESPACE_UID };
}

/** How to run a server-side PostgreSQL tool here: directly, or in a user namespace when running as root. */
export function pgInvocation(bin, tool, args, { platform, uid, mapTo }) {
  const program = path.join(bin, exe(tool, platform));
  if (platform === "linux" && uid === 0) {
    const user = mapTo ?? { uid: NAMESPACE_UID, gid: NAMESPACE_UID };
    return { command: "unshare", args: ["--user", `--map-user=${user.uid}`, `--map-group=${user.gid}`, program, ...args] };
  }
  return { command: program, args };
}

/** A port nothing listens on right now, picked by the system on 127.0.0.1. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the cluster and creates the database. `env` is the cleared
 * environment for PostgreSQL's processes; `log` gets one line per step;
 * `onPort` gets the port before anything connects to it, so the harness's
 * connect guard can let its own readiness checks through.
 * Returns { port, socketDir, stop }, stop deleting the cluster.
 */
export async function startPostgres({ bin, layout, database, user, password, env, platform, uid, log, logFile, onPort = () => undefined }) {
  const dataDir = path.join(layout.pg, "data");
  fs.mkdirSync(layout.pg, { recursive: true });
  const port = await freePort();
  onPort(port);
  const socketDir = socketDirectory(layout, port, platform);
  if (socketDir) fs.mkdirSync(socketDir, { recursive: true });
  else log("the output folder's path is too long for a unix socket; PostgreSQL listens on TCP only");

  const output = fs.openSync(logFile, "a");
  let mapTo;
  if (platform === "linux" && uid === 0) {
    mapTo = namespaceUser(fs.readFileSync("/etc/passwd", "utf8"));
    log(`running as root: initdb and postgres run in a user namespace as ${mapTo.name || `uid ${mapTo.uid}`}`);
  }
  const runTool = (tool, args, extraEnv = {}) => {
    const invocation = pgInvocation(bin, tool, args, { platform, uid, mapTo });
    const result = spawnSync(invocation.command, invocation.args, {
      env: { ...env, ...extraEnv },
      cwd: layout.pg,
      stdio: ["ignore", output, output],
      timeout: 120_000,
    });
    if (result.error) throw new Error(`${tool} could not start: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`${tool} failed (exit ${result.status}); see ${logFile}`);
  };

  // The superuser is the fixture user, with the fixture password, checked over TCP (scram)
  const passwordFile = path.join(layout.pg, "initdb-password");
  fs.writeFileSync(passwordFile, password, { mode: 0o600 });
  try {
    log("initdb");
    runTool("initdb", [
      "-D",
      dataDir,
      "-U",
      user,
      `--pwfile=${passwordFile}`,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--no-locale",
      "--no-sync",
    ]);
  } finally {
    fs.rmSync(passwordFile, { force: true });
  }

  const invocation = pgInvocation(
    bin,
    "postgres",
    [
      "-D",
      dataDir,
      "-p",
      String(port),
      "-c",
      "listen_addresses=127.0.0.1",
      "-c",
      `unix_socket_directories=${socketDir}`,
      "-c",
      "dynamic_shared_memory_type=mmap",
      "-c",
      "fsync=off",
      "-c",
      "synchronous_commit=off",
      "-c",
      "full_page_writes=off",
      "-c",
      "logging_collector=off",
      "-c",
      "ssl=off",
      "-c",
      "max_connections=60",
    ],
    { platform, uid, mapTo }
  );
  log(`postgres on 127.0.0.1:${port}`);
  const child = spawn(invocation.command, invocation.args, { env, cwd: layout.pg, stdio: ["ignore", output, output] });
  let exited = false;
  const exit = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
    child.once("error", () => {
      exited = true;
      resolve({ code: -1, signal: null });
    });
  });

  const stop = async () => {
    if (!exited) {
      // SIGINT is PostgreSQL's fast shutdown; pg_ctl does the same on Windows
      if (platform === "win32") {
        spawnSync(path.join(bin, exe("pg_ctl", platform)), ["stop", "-D", dataDir, "-m", "fast"], { env, stdio: "ignore" });
      } else {
        child.kill("SIGINT");
      }
      const done = await Promise.race([exit, delay(20_000).then(() => undefined)]);
      if (!done) child.kill("SIGKILL");
      await Promise.race([exit, delay(5_000)]);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (socketDir) fs.rmSync(socketDir, { recursive: true, force: true });
    fs.closeSync(output);
  };

  try {
    const deadline = Date.now() + 60_000;
    while (!(await canConnect(port))) {
      if (exited) throw new Error(`postgres stopped while starting; see ${logFile}`);
      if (Date.now() > deadline) throw new Error(`postgres did not accept connections within a minute; see ${logFile}`);
      await delay(250);
    }
    // Accepting TCP is not quite ready for queries; createdb retries until it is
    let created = false;
    for (let attempt = 0; attempt < 40 && !created; attempt++) {
      try {
        runTool("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", user, database], { PGPASSWORD: password });
        created = true;
      } catch (error) {
        if (attempt === 39) throw error;
        await delay(250);
      }
    }
    log(`database ${database} created`);
  } catch (error) {
    await stop();
    throw error;
  }

  return { port, socketDir, dataDir, stop };
}
