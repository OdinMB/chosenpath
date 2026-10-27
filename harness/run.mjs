#!/usr/bin/env node
// The local harness: Chosen Path in a real browser on a hermetic local copy.
//
//   node harness/run.mjs --out <folder> [--steps <module>] [--viewport desktop|mobile]
//                        [--timeout <seconds>] [--pg-bin <folder>] [--guard-test=<case>]
//
// It starts a throwaway PostgreSQL, a fake OpenAI-compatible API, the seed,
// the server, a client build and a front door, all on 127.0.0.1, all writing
// under --out; checks the guard in every product process; prints
// `hermetic-guard: ok port <n>` (the front door's port); provisions a playable
// template; runs the browser journey; and stops and removes everything.
// harness/README.md has the parameters, the output and the guard.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { globalModuleRoots, loadPlaywright, runJourney } from "./lib/browser.mjs";
import { PLACEHOLDER_MARK, startFakeOpenAI } from "./lib/fake-openai.mjs";
import { startFrontDoor } from "./lib/front-door.mjs";
import {
  EXIT_CODES as EXIT,
  GUARD_LINE_PREFIX,
  USAGE,
  apiUrlLiterals,
  clientBuildEnvironment,
  clientBundleProblems,
  finalExitCode,
  homeVariables,
  outputFolderProblem,
  outputLayout,
  parseArgs,
  platformVariables,
  productEnvironment,
  proxyVariables,
} from "./lib/guard.mjs";
import { installConnectGuard, installListenGuard } from "./lib/net-guard.mjs";
import { findPgBin, startPostgres } from "./lib/postgres.mjs";
import { markerLog, startChild } from "./lib/processes.mjs";
import { provisionTemplate } from "./lib/provision.mjs";

const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(HARNESS_DIR);
const SERVER_DIR = path.join(REPO_ROOT, "server");
const CLIENT_DIR = path.join(REPO_ROOT, "client");
const TSX_LOADER = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "loader.mjs");
const PRELOAD = path.join(HARNESS_DIR, "lib", "server-preload.mjs");
const SMOKE_STEPS = path.join(HARNESS_DIR, "steps", "smoke.mjs");
const SEED_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------- parameters and output folder

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(EXIT.setup);
}
if (args.help) {
  console.log(USAGE);
  process.exit(EXIT.ok);
}

const outDir = path.resolve(args.out);
const outProblem = outputFolderProblem(outDir, REPO_ROOT, fs.existsSync(outDir) ? fs.readdirSync(outDir) : []);
if (outProblem) {
  console.error(`harness: ${outProblem} (--out ${outDir})`);
  process.exit(EXIT.setup);
}
fs.mkdirSync(outDir, { recursive: true });
// A symlinked path must not lead back into the repository either
const realProblem = outputFolderProblem(fs.realpathSync(outDir), fs.realpathSync(REPO_ROOT), []);
if (realProblem) {
  console.error(`harness: ${realProblem} (--out ${outDir} leads to ${fs.realpathSync(outDir)})`);
  process.exit(EXIT.setup);
}

const layout = outputLayout(outDir);
for (const dir of [layout.guard, layout.home, layout.config, layout.cache, layout.data, layout.state, layout.tmp, layout.logs, layout.shots, layout.pg, layout.serverWork, layout.clientEnv, layout.browserHome]) {
  fs.mkdirSync(dir, { recursive: true });
}
// This process's own temporary files (Playwright's profile and artifacts) stay under --out too
process.env.TMPDIR = layout.tmp;
process.env.TMP = layout.tmp;
process.env.TEMP = layout.tmp;

const harnessLog = fs.createWriteStream(path.join(layout.logs, "harness.log"), { flags: "a" });
const say = (line) => {
  console.log(`harness: ${line}`);
  harnessLog.write(`${new Date().toISOString()} ${line}\n`);
};
const sayError = (line) => {
  console.error(`harness: ${line}`);
  harnessLog.write(`${new Date().toISOString()} ERROR ${line}\n`);
};

const startedAt = Date.now();
const platform = process.platform;
const uid = typeof process.getuid === "function" ? process.getuid() : undefined;

// ---------------------------------------------------------------- the guard in this process too

const allowedPorts = new Set();
const violations = [];
installConnectGuard({
  allowedPorts: () => [...allowedPorts],
  // A violation: the run stops now and exits 3, whatever the refused caller makes of its error
  onRefused: (target) => {
    violations.push(`the harness itself tried to connect to ${target}`);
    void finish(EXIT.violation, `${GUARD_LINE_PREFIX} the harness itself tried to connect to ${target}, which it did not start`);
  },
});
installListenGuard({ onListening: () => undefined });

function gitStatusLines() {
  const result = spawnSync("git", ["--no-optional-locks", "-C", REPO_ROOT, "status", "--porcelain", "--ignored"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return undefined;
  return result.stdout.split("\n").filter(Boolean);
}
const gitBefore = gitStatusLines();

// ---------------------------------------------------------------- finishing, whatever happens

const cleanups = [];
const summary = { guardLine: null, ports: {}, template: null, screenshots: [], blockedRequests: 0, versions: { node: process.version } };
let finishing = false;

function portIsHeld(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function finish(code, message) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timeoutTimer);
  if (message) (code === EXIT.ok ? say : sayError)(message);
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      sayError(`cleanup: ${error.message}`);
    }
  }
  let finalCode = code;
  for (const [name, port] of Object.entries(summary.ports)) {
    if (port && (await portIsHeld(port))) violations.push(`the ${name} port ${port} is still held after the run`);
  }
  const gitAfter = gitStatusLines();
  if (gitBefore && gitAfter) {
    const added = gitAfter.filter((line) => !gitBefore.includes(line));
    if (added.length > 0) violations.push(`the run added to git status --porcelain --ignored: ${added.join(", ")}`);
  } else {
    violations.push("git status could not be read before and after the run");
  }
  for (const violation of violations) sayError(`${GUARD_LINE_PREFIX} violation: ${violation}`);
  finalCode = finalExitCode(finalCode, violations.length);
  fs.writeFileSync(
    path.join(outDir, "run.json"),
    JSON.stringify({ ...summary, exitCode: finalCode, violations, guardTest: args.guardTest ?? null, seconds: Math.round((Date.now() - startedAt) / 1000) }, null, 2)
  );
  say(`exit ${finalCode}; summary in ${path.join(outDir, "run.json")}`);
  await new Promise((resolve) => harnessLog.end(resolve));
  process.exit(finalCode);
}

// Everything above runs synchronously, so nothing can call finish() before this exists
const timeoutTimer = setTimeout(() => void finish(EXIT.timeout, `timed out after ${args.timeoutSeconds}s`), args.timeoutSeconds * 1000);
process.on("SIGINT", () => void finish(EXIT.interrupted, "interrupted"));
process.on("SIGTERM", () => void finish(EXIT.interrupted, "stopped"));

class RunError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------- the run

async function main() {
  const fixtureVars = JSON.parse(fs.readFileSync(path.join(HARNESS_DIR, "fixture-vars.json"), "utf8"));
  if (!fs.existsSync(TSX_LOADER)) throw new RunError(EXIT.setup, "tsx is missing from node_modules: install the repository's dependencies first (npm ci)");
  const pgBin = findPgBin({ pgBin: args.pgBin, env: process.env, platform });
  if (!pgBin) {
    throw new RunError(EXIT.setup, "PostgreSQL's initdb and postgres were not found on PATH or in /usr/lib/postgresql/*/bin; pass --pg-bin <folder>");
  }
  const pgVersion = spawnSync(path.join(pgBin, platform === "win32" ? "postgres.exe" : "postgres"), ["--version"], { encoding: "utf8" });
  summary.versions.postgres = (pgVersion.stdout ?? "").trim() || "unknown";
  let playwright;
  let steps;
  if (!args.guardTest) {
    // Before anything starts: a missing browser is a clear error, not a half-started run
    playwright = await loadPlaywright(globalModuleRoots({ execPath: process.execPath, platform, env: process.env }));
    summary.versions.playwright = `${playwright.name} ${playwright.version} (${playwright.dir})`;
    const stepsPath = args.steps ? path.resolve(args.steps) : SMOKE_STEPS;
    if (!fs.existsSync(stepsPath)) throw new RunError(EXIT.setup, `--steps ${stepsPath} does not exist`);
    steps = (await import(pathToFileURL(stepsPath).href)).default;
    if (typeof steps !== "function") throw new RunError(EXIT.setup, `${stepsPath} has no default export function`);
    summary.steps = stepsPath;
  }
  say(`output folder ${outDir}`);

  // The fake model API
  const fakeLog = fs.createWriteStream(path.join(layout.logs, "fake-openai.jsonl"), { flags: "a" });
  const fake = await startFakeOpenAI({ record: (entry) => fakeLog.write(`${JSON.stringify(entry)}\n`), sharpFrom: path.join(SERVER_DIR, "package.json") });
  allowedPorts.add(fake.port);
  summary.ports.fakeOpenAI = fake.port;
  cleanups.push(async () => {
    await fake.close();
    await new Promise((resolve) => fakeLog.end(resolve));
  });
  say(`fake OpenAI API on 127.0.0.1:${fake.port}`);

  // The database
  const pgEnv = { ...platformVariables(process.env, platform), ...homeVariables(layout), ...proxyVariables(), LC_ALL: "C", LANG: "C" };
  const pg = await startPostgres({
    bin: pgBin,
    layout,
    database: fixtureVars.server.DB_DATABASE,
    user: fixtureVars.server.DB_USER,
    password: fixtureVars.server.DB_PASSWORD,
    env: pgEnv,
    platform,
    uid,
    log: (line) => say(`postgres: ${line}`),
    logFile: path.join(layout.logs, "postgres.log"),
    // Before its readiness checks connect to it
    onPort: (port) => allowedPorts.add(port),
  });
  summary.ports.postgres = pg.port;
  cleanups.push(() => pg.stop());

  const created = {
    db: { host: "127.0.0.1", port: pg.port, database: fixtureVars.server.DB_DATABASE },
    openaiBaseUrl: fake.baseUrl,
    outDir,
  };

  // The client build, alongside the seed and the server
  let build;
  if (!args.guardTest) {
    const env = clientBuildEnvironment({ parentEnv: process.env, platform, layout });
    const paramsPath = path.join(layout.guard, "client-build.json");
    fs.writeFileSync(
      paramsPath,
      JSON.stringify({ repoRoot: REPO_ROOT, clientDir: CLIENT_DIR, outDir: layout.clientDist, cacheDir: layout.clientCache, envDir: layout.clientEnv, expectedEnv: env }, null, 2)
    );
    const markers = markerLog();
    say("building the client");
    const child = startChild({
      name: "client build",
      command: process.execPath,
      args: [path.join(HARNESS_DIR, "lib", "client-build.mjs"), paramsPath],
      cwd: CLIENT_DIR,
      env,
      logFile: path.join(layout.logs, "client-build.log"),
      onMarker: (marker) => {
        markers.push(marker);
        if (marker.refusedConnection) violations.push(`the client build tried to connect to ${marker.refusedConnection}`);
      },
    });
    cleanups.push(() => child.stop());
    build = child.exit.then((result) => {
      const failed = markers.records.find((m) => m.buildFailed);
      if (result.code !== 0 || failed) {
        throw new RunError(EXIT.setup, `the client build failed${failed ? `: ${failed.buildFailed}` : ` (exit ${result.code})`}; see logs/client-build.log`);
      }
      return markers.records.find((m) => m.built);
    });
    // Reported when awaited; never an unhandled rejection meanwhile
    build.catch(() => undefined);
  }

  // A product process: tsx, then the guard, then the product's own entry
  const productProcess = (role, entry) => {
    const manifestPath = path.join(layout.guard, `${role}.json`);
    const env = productEnvironment({
      parentEnv: process.env,
      platform,
      layout,
      fixtureVars,
      created,
      manifestPath,
      tsconfigPath: path.join(SERVER_DIR, "tsconfig.json"),
    });
    const manifest = { role, serverDir: SERVER_DIR, outDir, guardTest: args.guardTest ?? null, allowedPorts: [pg.port, fake.port], expectedEnv: env, created };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const markers = markerLog();
    const child = startChild({
      name: role,
      command: process.execPath,
      args: ["--import", pathToFileURL(TSX_LOADER).href, "--import", pathToFileURL(PRELOAD).href, entry],
      cwd: layout.serverWork,
      env,
      logFile: path.join(layout.logs, `${role}.log`),
      onMarker: (marker) => {
        markers.push(marker);
        if (marker.refusedConnection) {
          violations.push(`the ${role} tried to connect to ${marker.refusedConnection}`);
          void finish(EXIT.violation, `${GUARD_LINE_PREFIX} the ${role} tried to connect to ${marker.refusedConnection}, which the harness did not start`);
        }
      },
    });
    cleanups.push(() => child.stop());
    return { child, markers };
  };

  /** The guard's verdict in a product process: resolves on ok, throws on a refusal. */
  const guardVerdict = async (role, { child, markers }) => {
    let verdict;
    try {
      verdict = await markers.waitFor((m) => m.ok === role || Array.isArray(m.refused), { exit: child.exit, timeoutMs: 120_000, what: `the ${role}'s guard` });
    } catch (error) {
      // Not a refusal: the guard said nothing, so the process failed some other way
      throw new RunError(EXIT.setup, `the ${role} stopped before its guard reported (${error.message}); see logs/${role}.log`);
    }
    if (verdict.refused) {
      const lines = verdict.refused.map((problem) => `  - ${problem}`).join("\n");
      if (args.guardTest) {
        console.error(`${GUARD_LINE_PREFIX} refused (guard test "${args.guardTest}", in the ${role})\n${lines}`);
        throw new RunError(EXIT.refused, `guard test "${args.guardTest}" refused, as it must`);
      }
      console.error(`${GUARD_LINE_PREFIX} refused (the ${role})\n${lines}`);
      throw new RunError(EXIT.refused, `the guard refused the ${role}`);
    }
    if (args.guardTest) {
      await child.stop(2_000);
      throw new RunError(EXIT.guardTestNotRefused, `guard test "${args.guardTest}" was NOT refused: the guard is broken; treat this way as broken`);
    }
  };

  // The seed: the product's own synthetic dev data (npm run seed:dev's script), guarded like the server
  say("seeding the database with the dev seed");
  const seed = productProcess("seed", path.join(SERVER_DIR, "src", "scripts", "seedDevDatabase.ts"));
  await guardVerdict("seed", seed);
  // A seed that never exits (a handle left open) fails here, not at the run's timeout
  let seedTimer;
  const seedExit = await Promise.race([seed.child.exit, new Promise((resolve) => (seedTimer = setTimeout(resolve, SEED_TIMEOUT_MS)))]);
  clearTimeout(seedTimer);
  if (!seedExit) throw new RunError(EXIT.setup, `the seed did not finish within ${SEED_TIMEOUT_MS / 1000}s; see logs/seed.log`);
  if (seedExit.code !== 0) throw new RunError(EXIT.setup, `the seed failed (exit ${seedExit.code}); see logs/seed.log`);

  // The server
  say("starting the server");
  const server = productProcess("server", path.join(SERVER_DIR, "src", "index.ts"));
  await guardVerdict("server", server);
  const listening = await server.markers
    .waitFor((m) => m.listening?.port, { exit: server.child.exit, timeoutMs: 120_000, what: "the server listening" })
    .catch((error) => {
      throw new RunError(EXIT.setup, `${error.message}; see logs/server.log`);
    });
  const serverPort = listening.listening.port;
  allowedPorts.add(serverPort);
  summary.ports.server = serverPort;
  say(`server on 127.0.0.1:${serverPort}`);

  // The front door, and the client it serves once the build passed its check
  const client = { root: undefined };
  const frontDoorLog = fs.createWriteStream(path.join(layout.logs, "front-door.log"), { flags: "a" });
  const frontDoor = await startFrontDoor({ upstreamPort: () => serverPort, staticRoot: () => client.root, log: (line) => frontDoorLog.write(`${line}\n`) });
  allowedPorts.add(frontDoor.port);
  summary.ports.frontDoor = frontDoor.port;
  cleanups.push(async () => {
    await frontDoor.close();
    await new Promise((resolve) => frontDoorLog.end(resolve));
  });

  await build;
  const literals = apiUrlLiterals(fs.readFileSync(path.join(REPO_ROOT, "core", "config.ts"), "utf8"));
  const bundleProblems = clientBundleProblems(bundleFiles(layout.clientDist), literals);
  if (bundleProblems.length > 0) {
    console.error(`${GUARD_LINE_PREFIX} refused (the client bundle)\n${bundleProblems.map((p) => `  - ${p}`).join("\n")}`);
    throw new RunError(EXIT.refused, "the guard refused the client bundle");
  }
  client.root = path.resolve(layout.clientDist);

  summary.guardLine = `${GUARD_LINE_PREFIX} ok port ${frontDoor.port}`;
  console.log(summary.guardLine);
  say(`the local copy is at ${frontDoor.origin}`);

  // A playable template, made through the product's API with the fake model
  say("drafting and publishing the fixture template");
  const template = await provisionTemplate(frontDoor.origin, { editor: fixtureVars.editor, template: fixtureVars.template });
  summary.template = template;
  say(`fixture template ${template.id} (${template.title})`);

  // The journey
  const journeyLog = fs.createWriteStream(path.join(layout.logs, "journey.log"), { flags: "a" });
  const blockedLog = fs.createWriteStream(path.join(layout.logs, "blocked-requests.log"), { flags: "a" });
  const consoleLog = fs.createWriteStream(path.join(layout.logs, "browser-console.log"), { flags: "a" });
  cleanups.push(() => Promise.all([journeyLog, blockedLog, consoleLog].map((stream) => new Promise((resolve) => stream.end(resolve)))));
  const browserEnv = {
    ...platformVariables(process.env, platform),
    ...homeVariables(layout, layout.browserHome),
    ...proxyVariables(),
  };
  try {
    summary.screenshots = await runJourney({
      playwright: playwright.module,
      origin: frontDoor.origin,
      port: frontDoor.port,
      viewport: args.viewport,
      steps,
      shotsDir: layout.shots,
      log: (line) => {
        say(`journey: ${line}`);
        journeyLog.write(`${new Date().toISOString()} ${line}\n`);
      },
      fixture: {
        template,
        login: fixtureVars.player,
        placeholderMark: PLACEHOLDER_MARK,
        playwrightVersion: playwright.version,
        outDir,
      },
      env: browserEnv,
      onBlocked: (url) => {
        summary.blockedRequests += 1;
        blockedLog.write(`${url}\n`);
      },
      onConsole: (line) => consoleLog.write(`${line}\n`),
    });
  } catch (error) {
    throw new RunError(EXIT.journey, `the journey failed: ${error.message.split("\n")[0]}; see logs/journey.log and shots/`);
  }
  if (summary.blockedRequests > 0) say(`${summary.blockedRequests} browser request(s) to other hosts were blocked; see logs/blocked-requests.log`);
  say(`${summary.screenshots.length} screenshot(s) in ${layout.shots}`);
}

/** The built client's text files, for the bundle check. */
function bundleFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(m?js|html|css)$/.test(entry.name)) files.push({ name: path.relative(dir, full), text: fs.readFileSync(full, "utf8") });
    }
  };
  walk(dir);
  return files;
}

main().then(
  () => finish(EXIT.ok, "done"),
  (error) => finish(error instanceof RunError ? error.code : EXIT.setup, error instanceof RunError ? error.message : `failed: ${error.stack ?? error}`)
);
