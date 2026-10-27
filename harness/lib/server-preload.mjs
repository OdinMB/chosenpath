// Loaded with --import into every product process the harness starts (the
// seed and the server), after tsx. In order: it plants the guard test's case,
// if there is one; locks the network down; loads the product's configuration;
// and checks, before the product's own entry runs (so before anything
// migrates, seeds or serves), that the environment, the configuration and
// every outward target are the harness's. Any problem exits the process
// non-zero, printing the variables and targets concerned, never their values.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  GUARD_LINE_PREFIX,
  SERVER_CONFIG_NAMES,
  configVariableProblems,
  environmentProblems,
  markerLine,
  outwardClientProblems,
  plantGuardTest,
  targetProblems,
} from "./guard.mjs";
import { installConnectGuard, installListenGuard } from "./net-guard.mjs";

// Written synchronously, so nothing is lost when the process exits right after
function emit(record) {
  fs.writeSync(1, markerLine(record));
}

function refuse(problems) {
  fs.writeSync(2, `${GUARD_LINE_PREFIX} refused\n${problems.map((problem) => `  - ${problem}\n`).join("")}`);
  emit({ refused: problems });
  process.exit(3);
}

function firstLine(error) {
  return String(error instanceof Error ? error.message : error).split("\n")[0];
}

const manifestPath = process.env.HARNESS_GUARD_MANIFEST;
if (!manifestPath) refuse(["no guard manifest: this preload runs only in a process harness/run.mjs starts"]);

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  refuse([`the guard manifest could not be read (${firstLine(error)})`]);
}

// The negative test: planted now, after the harness cleared the environment
if (manifest.guardTest) plantGuardTest(process.env, manifest.guardTest);

installConnectGuard({
  allowedPorts: manifest.allowedPorts,
  onRefused: (target) => emit({ refusedConnection: target }),
});
installListenGuard({ onListening: (listening) => emit({ listening }) });

const load = (relative) => import(pathToFileURL(path.join(manifest.serverDir, relative)).href);

let config;
let dbSettings;
let textModels;
let storage;
try {
  // config.ts runs the product's dotenv.config(), from a working folder that holds no .env
  config = await load("src/config.ts");
  dbSettings = await load("src/shared/dbSettings.ts");
  textModels = await load("src/shared/llm/textModelSettings.ts");
  storage = await load("src/shared/storageUtils.ts");
} catch (error) {
  refuse([`the product's configuration could not be loaded (${firstLine(error)})`]);
}

const env = process.env;
const textModelNames = Object.values(textModels.TEXT_MODEL_GROUPS).flatMap((group) => [
  `${group.prefix}_NAME`,
  `${group.prefix}_REASONING_EFFORT`,
  `${group.prefix}_TEMPERATURE`,
]);
const storagePaths = Object.fromEntries(
  Object.keys(config.STORAGE_PATHS.development).map((kind) => [kind, storage.getStoragePath(kind)])
);

const problems = [
  ...environmentProblems(env, manifest.expectedEnv),
  ...configVariableProblems(env, [...SERVER_CONFIG_NAMES, ...textModelNames], manifest.expectedEnv),
  ...targetProblems(
    {
      db: dbSettings.dbConnectionSettings(env),
      openaiBaseUrl: env.OPENAI_BASE_URL,
      corsOrigins: config.API_CONFIG.DEFAULT_CORS_ORIGIN,
      storagePaths,
    },
    manifest.created
  ),
  ...outwardClientProblems(env, manifest.created),
];
if (problems.length > 0) refuse(problems);

emit({ ok: manifest.role });
