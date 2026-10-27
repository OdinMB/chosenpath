// The harness's hermetic guard, as pure functions over plain values: the
// environment every product process starts with, the checks that process
// runs on itself once its configuration has loaded (server-preload.mjs), the
// guard tests that plant something after the environment was cleared, and the
// check of the built client. Problems name variables and targets, never the
// values they hold.

import path from "node:path";

export const GUARD_LINE_PREFIX = "hermetic-guard:";
export const MARKER_PREFIX = "[harness-guard] ";

/** The cases `--guard-test` takes. Each one must make the run exit non-zero. */
export const GUARD_TEST_CASES = ["env", "target", "target-loopback"];

/** What the target cases plant where the server reads its database target. */
export const GUARD_TEST_TARGETS = {
  target: "postgres://guard-test.invalid/x",
  "target-loopback": "postgres://127.0.0.1:9/x",
};

/** The variable the env case plants, as a dotenv file would add one. */
export const PLANTED_VARIABLE = "GUARD_TEST_FROM_DOTENV";

/** A loopback port nothing listens on (privileged, never bound by the harness): every proxied request fails. */
export const CLOSED_PROXY_URL = "http://127.0.0.1:1";

/** The prefix the built client sends its API calls to; the front door strips it. */
export const CLIENT_API_PREFIX = "/__api";

/** The development CORS origins the server must keep (core/config.ts): never production's. */
export const DEVELOPMENT_CORS_ORIGINS = ["localhost:5173"];

/**
 * Every variable the server's configuration code and its clients read, beyond
 * the text-model names (the preload adds those from TEXT_MODEL_GROUPS). Each
 * must be unset or hold its fixture value. The repository has no env.example,
 * so this list is read from the code: server/src (config.ts, dbSettings.ts,
 * userService.ts, clientAddress.ts, spendLedger.ts, newsletterService.ts,
 * devSeedGuard.ts) and the libraries it configures (openai, LangChain and
 * LangSmith, pg, dotenv).
 */
export const SERVER_CONFIG_NAMES = [
  "NODE_ENV",
  "DB_USER",
  "DB_HOST",
  "DB_DATABASE",
  "DB_PASSWORD",
  "DB_PORT",
  "DATABASE_URL",
  "JWT_SECRET",
  "TRUST_PROXY",
  "SPEND_CEILING_ANONYMOUS_USD_PER_DAY",
  "SPEND_CEILING_ACCOUNT_USD_PER_DAY",
  "IMAGE_GENERATION_MODEL",
  "IMAGE_GENERATION_TEMPLATE_MODEL",
  "MAILJET_API_KEY",
  "MAILJET_SECRET_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_ORG_ID",
  "OPENAI_ORGANIZATION",
  "OPENAI_PROJECT_ID",
  "OPENAI_WEBHOOK_SECRET",
  "OPENAI_LOG",
  "LANGCHAIN_TRACING",
  "LANGCHAIN_TRACING_V2",
  "LANGCHAIN_API_KEY",
  "LANGCHAIN_ENDPOINT",
  "LANGCHAIN_PROJECT",
  "LANGSMITH_TRACING",
  "LANGSMITH_TRACING_V2",
  "LANGSMITH_API_KEY",
  "LANGSMITH_ENDPOINT",
  "LANGSMITH_PROJECT",
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "PGPASSFILE",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSSLMODE",
  "DOTENV_KEY",
  "RENDER",
  "RENDER_SERVICE_ID",
  "RENDER_SERVICE_NAME",
  "RENDER_INSTANCE_ID",
  "RENDER_EXTERNAL_HOSTNAME",
  "RENDER_EXTERNAL_URL",
  "VITE_API_URL",
  "VITE_WS_SERVER_URL",
  "VITE_WS_PORT",
];

const MAIL_NAMES = ["MAILJET_API_KEY", "MAILJET_SECRET_KEY"];
const TRACING_PREFIXES = ["LANGCHAIN_", "LANGSMITH_"];

/** The variables the platform needs: PATH, and SYSTEMROOT and COMSPEC on Windows. */
export function platformVariables(parentEnv, platform) {
  const names = platform === "win32" ? ["PATH", "SYSTEMROOT", "COMSPEC"] : ["PATH"];
  const env = {};
  for (const name of names) {
    const value = parentEnv[name] ?? parentEnv[name.charAt(0) + name.slice(1).toLowerCase()];
    if (typeof value === "string") env[name] = value;
  }
  return env;
}

/** The output folder's layout; every path the run writes is one of these. */
export function outputLayout(outDir) {
  const at = (...parts) => path.join(outDir, ...parts);
  return {
    out: outDir,
    guard: at("guard"),
    home: at("home"),
    appData: at("home", "AppData", "Roaming"),
    localAppData: at("home", "AppData", "Local"),
    config: at("home", ".config"),
    cache: at("home", ".cache"),
    data: at("home", ".local", "share"),
    state: at("home", ".local", "state"),
    tmp: at("tmp"),
    logs: at("logs"),
    shots: at("shots"),
    pg: at("pg"),
    serverWork: at("server", "work"),
    serverData: at("server", "data"),
    clientEnv: at("client", "env"),
    clientDist: at("client", "dist"),
    clientCache: at("client", "vite-cache"),
    browserHome: at("browser"),
    noDotenv: at("guard", "no-dotenv-file-here", ".env"),
  };
}

/** A temporary home, config, cache and temp folder under the output folder. */
export function homeVariables(layout, home = layout.home) {
  return {
    HOME: home,
    USERPROFILE: home,
    APPDATA: layout.appData,
    LOCALAPPDATA: layout.localAppData,
    XDG_CONFIG_HOME: layout.config,
    XDG_CACHE_HOME: layout.cache,
    XDG_DATA_HOME: layout.data,
    XDG_STATE_HOME: layout.state,
    TMPDIR: layout.tmp,
    TMP: layout.tmp,
    TEMP: layout.tmp,
  };
}

/** Every proxy variable at a closed loopback port, loopback exempt; Node's own fetch told to obey them. */
export function proxyVariables(proxyUrl = CLOSED_PROXY_URL) {
  return {
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    ALL_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    all_proxy: proxyUrl,
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost",
    NODE_USE_ENV_PROXY: "1",
  };
}

/** The server's fixture values: fixture-vars.json's, and the targets the harness created. */
export function serverFixtures(fixtureVars, created) {
  return {
    ...fixtureVars.server,
    DB_HOST: created.db.host,
    DB_PORT: String(created.db.port),
    DB_DATABASE: created.db.database,
    OPENAI_BASE_URL: created.openaiBaseUrl,
  };
}

/**
 * The whole environment of a product process (the seed and the server): the
 * platform's PATH, a home under the output folder, the closed proxy, dotenv
 * pointed at a file that does not exist, tsx at the server's tsconfig, the
 * guard's manifest, and the fixtures. Nothing else from the parent.
 */
export function productEnvironment({ parentEnv, platform, layout, fixtureVars, created, manifestPath, tsconfigPath }) {
  return {
    ...platformVariables(parentEnv, platform),
    ...homeVariables(layout),
    ...proxyVariables(),
    DOTENV_CONFIG_PATH: layout.noDotenv,
    TSX_TSCONFIG_PATH: tsconfigPath,
    HARNESS_GUARD_MANIFEST: manifestPath,
    ...serverFixtures(fixtureVars, created),
  };
}

/** The client build's environment: PATH, a home under the output folder, the closed proxy, the client's URLs. */
export function clientBuildEnvironment({ parentEnv, platform, layout }) {
  return {
    ...platformVariables(parentEnv, platform),
    ...homeVariables(layout),
    ...proxyVariables(),
    NODE_ENV: "production",
    VITE_API_URL: CLIENT_API_PREFIX,
    VITE_WS_SERVER_URL: "/",
  };
}

/** The guard test's plant, made in the product process after the harness cleared its environment. */
export function plantGuardTest(env, testCase) {
  if (testCase === "env") {
    env[PLANTED_VARIABLE] = "planted after the environment was cleared";
    return;
  }
  const target = GUARD_TEST_TARGETS[testCase];
  if (!target) throw new Error(`Unknown guard test "${testCase}"; the cases are ${GUARD_TEST_CASES.join(", ")}`);
  // Where the server reads its database target (shared/dbSettings.ts)
  const url = new URL(target);
  env.DB_HOST = url.hostname;
  env.DB_PORT = url.port || "5432";
  env.DB_DATABASE = url.pathname.replace(/^\//, "");
}

function sameName(a, b, platform) {
  return platform === "win32" ? a.toUpperCase() === b.toUpperCase() : a === b;
}

/**
 * The process environment holds exactly what the harness set: a name it did
 * not set came from somewhere else (a dotenv file, the shell), and a value it
 * set that has changed was overwritten.
 */
export function environmentProblems(env, expected, platform = process.platform) {
  const problems = [];
  const expectedNames = Object.keys(expected);
  for (const name of Object.keys(env)) {
    if (!expectedNames.some((allowed) => sameName(allowed, name, platform))) {
      problems.push(`${name} is set but is on no allowlist: a dotenv file or the shell put it there`);
    }
  }
  for (const [name, value] of Object.entries(expected)) {
    if (env[name] !== value) problems.push(`${name} no longer holds the value the harness set`);
  }
  return problems;
}

/** Every configuration variable is unset or holds its fixture value. */
export function configVariableProblems(env, names, expected) {
  const problems = [];
  for (const name of new Set(names)) {
    const value = env[name];
    if (value === undefined) continue;
    if (!(name in expected)) problems.push(`${name} is set, but the harness leaves it unset`);
    else if (value !== expected[name]) problems.push(`${name} holds something other than its fixture value`);
  }
  return problems;
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Every outward target the product resolved is one the harness created: its
 * database (host, port and name, defaults included), the model API base URL,
 * its storage folders; and its CORS origins are the development default.
 */
export function targetProblems(resolved, created) {
  const problems = [];
  const db = resolved.db ?? {};
  if (db.host !== created.db.host || Number(db.port) !== Number(created.db.port)) {
    problems.push("the database target the server resolved (DB_HOST, DB_PORT and their defaults) is not the database the harness started");
  }
  if (db.database !== created.db.database) {
    problems.push("the database name the server resolved (DB_DATABASE) is not the harness's database");
  }
  if (resolved.openaiBaseUrl !== created.openaiBaseUrl) {
    problems.push("the model API base URL (OPENAI_BASE_URL) is not the harness's fake API");
  }
  const origins = Array.isArray(resolved.corsOrigins) ? resolved.corsOrigins : [];
  if (origins.length !== DEVELOPMENT_CORS_ORIGINS.length || origins.some((origin, i) => origin !== DEVELOPMENT_CORS_ORIGINS[i])) {
    problems.push("the server's CORS origins are not the development default");
  }
  for (const [kind, folder] of Object.entries(resolved.storagePaths ?? {})) {
    if (typeof folder !== "string" || !isInside(path.resolve(folder), created.outDir)) {
      problems.push(`the server's ${kind} storage is outside the output folder`);
    }
  }
  if (Object.keys(resolved.storagePaths ?? {}).length === 0) problems.push("the server's storage folders could not be read");
  return problems;
}

/** The outward clients are the fake (model) or off (mail, tracing): the product has no payment or analytics client. */
export function outwardClientProblems(env, created) {
  const problems = [];
  if (MAIL_NAMES.some((name) => env[name] !== undefined)) problems.push("the Mailjet client is configured; it must be off");
  if (Object.keys(env).some((name) => TRACING_PREFIXES.some((prefix) => name.startsWith(prefix)))) {
    problems.push("LangChain or LangSmith tracing is configured; it must be off");
  }
  if (env.OPENAI_BASE_URL !== created.openaiBaseUrl) problems.push("the OpenAI client does not point at the harness's fake API");
  return problems;
}

/**
 * Whether a connect target is a unix socket or named pipe: only when its path
 * is truthy, as Node itself decides (net.Socket#connect). Node's HTTP agent
 * passes `path: null` for every TCP connection.
 */
export function isPipeTarget(target) {
  return Boolean(target?.path);
}

/**
 * Whether a socket may connect: only TCP to 127.0.0.1 (or localhost) on a
 * port the harness started. Unix sockets and named pipes are refused too.
 */
export function connectionAllowed(target, allowedPorts) {
  if (!target || isPipeTarget(target)) return false;
  const host = target.host === undefined ? "localhost" : String(target.host).toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") return false;
  const port = Number(target.port);
  return Number.isInteger(port) && allowedPorts.includes(port);
}

/** A browser request may go only to the front door's port on 127.0.0.1, or stay in the page (data:, blob:). */
export function browserRequestAllowed(url, frontDoorPort) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (["data:", "blob:", "about:"].includes(parsed.protocol)) return true;
  if (!["http:", "ws:"].includes(parsed.protocol)) return false;
  return parsed.hostname === "127.0.0.1" && parsed.port === String(frontDoorPort);
}

/**
 * The WebSocket URLs the browser routes to the harness's block: every one but
 * the front door's (ws://127.0.0.1:<port>/...). A pattern rather than a
 * function, so the browser lets the front door's WebSockets (socket.io's)
 * through natively instead of relaying each frame through the harness.
 */
export function blockedWebSocketPattern(frontDoorPort) {
  return new RegExp(`^(?!ws://127\\.0\\.0\\.1:${Number(frontDoorPort)}/)`);
}

/**
 * The API URLs core/config.ts's getApiConfig hard-codes (DEFAULT_API_URL's
 * development and production values), which the client build replaces with
 * CLIENT_API_PREFIX. Fails closed: an unexpected form returns none.
 */
export function apiUrlLiterals(coreConfigSource) {
  const match = String(coreConfigSource).match(/DEFAULT_API_URL:\s*isDevelopment\s*\?\s*("[^"]+")\s*:\s*("[^"]+")/);
  if (!match) return [];
  return [match[1], match[2]];
}

/** Every occurrence of each literal replaced with `replacement`; `replaced` counts them. */
function replaceLiterals(source, literals, replacement) {
  let code = String(source);
  let replaced = 0;
  for (const literal of literals) {
    const parts = code.split(literal);
    replaced += parts.length - 1;
    code = parts.join(replacement);
  }
  return { code, replaced };
}

/** core/config.ts with its API URL literals replaced; `replaced` counts them (0 means the build must stop). */
export function rewriteApiUrls(source, literals, prefix = CLIENT_API_PREFIX) {
  return replaceLiterals(source, literals, JSON.stringify(prefix));
}

/** The built client calls no API but the front door's: no hard-coded API URL survives, and the prefix is there. */
export function clientBundleProblems(files, literals, prefix = CLIENT_API_PREFIX) {
  const problems = [];
  if (literals.length === 0) problems.push("core/config.ts's API URLs could not be read, so the bundle cannot be checked");
  const forbidden = literals.map((literal) => JSON.parse(literal).replace(/^https?:\/\//, ""));
  for (const file of files) {
    for (const target of forbidden) {
      if (file.text.includes(target)) problems.push(`${file.name} still calls a hard-coded API URL`);
    }
  }
  if (!files.some((file) => /\.m?js$/.test(file.name) && file.text.includes(JSON.stringify(prefix)))) {
    problems.push(`no script in the bundle calls the front door's ${prefix}`);
  }
  return problems;
}

/** The hosts in a list literal as core/config.ts writes DEFAULT_CORS_ORIGIN's (["localhost:5173"]), or undefined for any other form. */
function hostList(literal) {
  try {
    const hosts = JSON.parse(literal);
    return Array.isArray(hosts) && hosts.length > 0 && hosts.every((host) => typeof host === "string" && host !== "") ? hosts : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The site's own origins that core/config.ts's getApiConfig hard-codes
 * (DEFAULT_CORS_ORIGIN's development and production lists). The client
 * builds every join link from the first of them (generateJoinLink: seat
 * cards, their QR codes, the copied invite link), so in the harness's
 * browser, which runs as development, those links would name the
 * development server's port. The client build replaces both lists with the
 * front door's host. Fails closed: an unexpected form returns none.
 */
export function siteOriginLiterals(coreConfigSource) {
  const match = String(coreConfigSource).match(/DEFAULT_CORS_ORIGIN:\s*isDevelopment\s*\?\s*(\[[^\]]*\])\s*:\s*(\[[^\]]*\])/);
  if (!match || !hostList(match[1]) || !hostList(match[2])) return [];
  return [match[1], match[2]];
}

/** core/config.ts with its site origin lists replaced by one holding the front door's host; `replaced` counts them (0 means the build must stop). */
export function rewriteSiteOrigins(source, literals, host) {
  return replaceLiterals(source, literals, JSON.stringify([host]));
}

/**
 * The built client links to no site but the front door: the development
 * host (a port where another server may listen) appears nowhere, the
 * production list is gone from every script, and the front door's host,
 * on 127.0.0.1, is there. The production host itself is in the site's copy,
 * so only its list is looked for.
 */
export function siteOriginBundleProblems(files, literals, host) {
  const lists = literals.map(hostList);
  if (literals.length !== 2 || lists.some((list) => !list)) {
    return ["core/config.ts's site origins could not be read, so the bundle's join links cannot be checked"];
  }
  if (!/^127\.0\.0\.1:\d+$/.test(String(host))) return ["the join links' host is not the front door's on 127.0.0.1"];
  const [developmentHosts, productionHosts] = lists;
  const problems = [];
  for (const file of files) {
    if (developmentHosts.some((developmentHost) => file.text.includes(developmentHost))) problems.push(`${file.name} still links to the development site's origin`);
    if (/\.m?js$/.test(file.name) && file.text.includes(JSON.stringify(productionHosts))) problems.push(`${file.name} still links to the production site's origin`);
  }
  if (!files.some((file) => /\.m?js$/.test(file.name) && file.text.includes(JSON.stringify(host)))) {
    problems.push(`no script in the bundle links to the front door's ${host}`);
  }
  return problems;
}

/** The run's exit codes (harness/README.md, "Exit codes"). */
export const EXIT_CODES = {
  ok: 0,
  setup: 1,
  refused: 2,
  violation: 3,
  journey: 4,
  guardTestNotRefused: 70,
  timeout: 124,
  interrupted: 130,
};

/**
 * The code the run exits with: any guard violation (a refused connection, a
 * port still held, a path added to git status) makes it `violation`, whatever
 * else went wrong, except a guard test that was not refused, which says the
 * guard itself is broken.
 */
export function finalExitCode(code, violationCount) {
  if (violationCount > 0 && code !== EXIT_CODES.guardTestNotRefused) return EXIT_CODES.violation;
  return code;
}

/** One marker line, parsed by the harness from a child's stdout. */
export function markerLine(record) {
  return `${MARKER_PREFIX}${JSON.stringify(record)}\n`;
}

/** The record in a marker line, or undefined for any other line. */
export function parseMarker(line) {
  if (!String(line).startsWith(MARKER_PREFIX)) return undefined;
  try {
    return JSON.parse(String(line).slice(MARKER_PREFIX.length));
  } catch {
    return undefined;
  }
}

export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

/** The game modes `--group-mode` takes for the group fixture World: core's GameModes for more than one player. */
export const GROUP_GAME_MODES = ["cooperative", "cooperative-competitive", "competitive"];

export const USAGE = `Usage: node harness/run.mjs --out <folder> [options]

  --out <folder>          New or empty folder outside the repository; everything the run writes goes here
  --steps <module>        Browser steps: a module exporting default async ({ page, baseUrl, login, shot, log, finding, newPage, fixture, viewport }) => {}
                          (default: the built-in smoke journey, harness/steps/smoke.mjs; harness/steps/group.mjs plays a group story)
  --group-mode <mode>     The group World's game mode: ${GROUP_GAME_MODES.join(", ")} (default: fixture-vars.json's, cooperative)
  --viewport <name>       desktop (1440x900, default) or mobile (390x844, touch)
  --timeout <seconds>     Stop everything and fail after this long (default 600)
  --pg-bin <folder>       Folder holding initdb and postgres (default: PATH, then /usr/lib/postgresql/*/bin)
  --guard-test=<case>     Negative test, must exit non-zero: ${GUARD_TEST_CASES.join(", ")}
  --help                  This text`;

/** The run's parameters; throws a usage error for anything it does not take. */
export function parseArgs(argv) {
  const args = { out: undefined, steps: undefined, groupMode: undefined, viewport: "desktop", timeoutSeconds: 600, pgBin: undefined, guardTest: undefined, help: false };
  const takesValue = {
    "--out": "out",
    "--steps": "steps",
    "--group-mode": "groupMode",
    "--viewport": "viewport",
    "--timeout": "timeoutSeconds",
    "--pg-bin": "pgBin",
    "--guard-test": "guardTest",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const key = takesValue[flag];
    if (!key) throw new Error(`Unknown parameter ${flag}\n\n${USAGE}`);
    const value = inline ?? argv[++i];
    if (value === undefined || value === "") throw new Error(`${flag} needs a value\n\n${USAGE}`);
    args[key] = value;
  }
  if (args.help) return args;
  if (!args.out) throw new Error(`--out is required\n\n${USAGE}`);
  if (!(args.viewport in VIEWPORTS)) throw new Error(`--viewport takes ${Object.keys(VIEWPORTS).join(" or ")}`);
  if (args.groupMode !== undefined && !GROUP_GAME_MODES.includes(args.groupMode)) throw new Error(`--group-mode takes ${GROUP_GAME_MODES.join(", ")}`);
  const seconds = Number(args.timeoutSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--timeout takes a number of seconds above 0");
  args.timeoutSeconds = seconds;
  if (args.guardTest !== undefined && !GUARD_TEST_CASES.includes(args.guardTest)) {
    throw new Error(`--guard-test takes ${GUARD_TEST_CASES.join(", ")}`);
  }
  return args;
}

/** Why the output folder can't be used, or undefined: it must sit outside the repository, so the run adds nothing there. */
export function outputFolderProblem(outDir, repoRoot, entries) {
  if (!path.isAbsolute(outDir)) return "the output folder must be an absolute path";
  if (isInside(outDir, repoRoot) || isInside(repoRoot, outDir)) return "the output folder must be outside the repository, so the run adds no path to it";
  if (entries.length > 0) return "the output folder must be new or empty";
  return undefined;
}

export { isInside };
