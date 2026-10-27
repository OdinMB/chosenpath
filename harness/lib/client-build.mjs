// The client build, run by the harness as its own process from client/ with a
// cleared environment: `node harness/lib/client-build.mjs <params.json>`.
// It builds with the product's own vite.config.ts (transpiled in memory, so
// nothing lands in node_modules/.vite-temp), with these changes only: the
// output, cache and env folders are under the output folder (the env folder
// is empty, so no .env file is read), core/config.ts's hard-coded API URLs
// become the front door's /__api, and its site origins, from which join
// links and their QR codes are built, become the front door's host. If
// either can't be found, the build stops: a client that used them would
// leave the harness.

import fs from "node:fs";
import path from "node:path";
import { apiUrlLiterals, environmentProblems, markerLine, siteOriginLiterals, CLIENT_API_PREFIX } from "./guard.mjs";
import { installConnectGuard, installListenGuard } from "./net-guard.mjs";
import { harnessBuildConfig, localApiPlugin, productViteConfig, siteOriginPlugin } from "./vite-config.mjs";

const emit = (record) => fs.writeSync(1, markerLine(record));

function fail(message) {
  fs.writeSync(2, `client build: ${message}\n`);
  emit({ buildFailed: message });
  process.exit(4);
}

const params = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const envProblems = environmentProblems(process.env, params.expectedEnv);
if (envProblems.length > 0) fail(`the environment is not the harness's: ${envProblems.join("; ")}`);

installConnectGuard({ allowedPorts: [], onRefused: (target) => emit({ refusedConnection: target }) });
installListenGuard({ onListening: () => undefined });

const coreConfigPath = path.join(params.repoRoot, "core", "config.ts");
const coreConfig = fs.readFileSync(coreConfigPath, "utf8");
const literals = apiUrlLiterals(coreConfig);
if (literals.length === 0) fail("core/config.ts's DEFAULT_API_URL no longer has the form the harness rewrites");
const originLiterals = siteOriginLiterals(coreConfig);
if (originLiterals.length === 0) fail("core/config.ts's DEFAULT_CORS_ORIGIN no longer has the form the harness rewrites");
if (!params.siteHost) fail("the build was given no front door host for its join links");

const esbuild = await import("esbuild");
const vite = await import("vite");

const apiPlugin = localApiPlugin({ coreConfigPath, literals });
const originPlugin = siteOriginPlugin({ coreConfigPath, literals: originLiterals, host: params.siteHost });
try {
  const config = await productViteConfig({
    esbuild,
    configPath: path.join(params.clientDir, "vite.config.ts"),
    clientDir: params.clientDir,
  });
  await vite.build(harnessBuildConfig(config, params, [apiPlugin, originPlugin]));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
if (apiPlugin.rewrites() === 0) fail("core/config.ts was never built, so its API URLs were not rewritten");
if (originPlugin.rewrites() === 0) fail("core/config.ts was never built, so its site origins were not rewritten");
emit({ built: params.outDir, rewrites: apiPlugin.rewrites(), originRewrites: originPlugin.rewrites(), apiPrefix: CLIENT_API_PREFIX, siteHost: params.siteHost });
