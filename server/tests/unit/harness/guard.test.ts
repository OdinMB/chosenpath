import { describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLIENT_API_PREFIX,
  CLOSED_PROXY_URL,
  EXIT_CODES,
  GROUP_GAME_MODES,
  GUARD_TEST_CASES,
  PLANTED_VARIABLE,
  apiUrlLiterals,
  blockedWebSocketPattern,
  browserRequestAllowed,
  clientBundleProblems,
  configVariableProblems,
  connectionAllowed,
  environmentProblems,
  finalExitCode,
  isInside,
  isPipeTarget,
  outputFolderProblem,
  outputLayout,
  outwardClientProblems,
  parseArgs,
  plantGuardTest,
  productEnvironment,
  rewriteApiUrls,
  rewriteSiteOrigins,
  SERVER_CONFIG_NAMES,
  siteOriginBundleProblems,
  siteOriginLiterals,
  targetProblems,
  type CreatedTargets,
  type Env,
} from "../../../../harness/lib/guard.mjs";
import { MAX_PLAYERS, MAX_TURNS, MIN_TURNS } from "core/config.js";
import { GameModes } from "core/types/index.js";
import { connectTarget, describeTarget } from "../../../../harness/lib/net-guard.mjs";
import { dbConnectionSettings } from "../../../src/shared/dbSettings.js";
import { checkDevSeedTarget } from "../../../src/scripts/devSeedGuard.js";
import { DEV_SEED_PASSWORD, buildDevSeedPlan } from "../../../src/scripts/devSeedData.js";

/*
 * The harness's guard (harness/lib/guard.mjs), checked without starting the
 * product: the environment a product process gets, each assertion the
 * process runs on itself, and that each negative test's plant is refused.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const outDir = path.join(path.parse(repoRoot).root, "harness-out", "run-1");
const layout = outputLayout(outDir);
const fixtureVars = JSON.parse(fs.readFileSync(path.join(repoRoot, "harness", "fixture-vars.json"), "utf8"));
const created: CreatedTargets = {
  db: { host: "127.0.0.1", port: 54011, database: fixtureVars.server.DB_DATABASE },
  openaiBaseUrl: "http://127.0.0.1:54012/v1",
  outDir,
};

// What a developer's shell might hold; none of it may reach the product
const parentEnv: Env = {
  PATH: "/usr/bin:/bin",
  HOME: "/home/someone",
  OPENAI_API_KEY: "a-real-looking-key-from-the-shell",
  DB_HOST: "db.example.net",
  DATABASE_URL: "postgres://db.example.net/prod",
  NODE_OPTIONS: "--require /somewhere/hook.js",
  HTTPS_PROXY: "http://proxy.example.net:3128",
};

function freshEnvironment() {
  return productEnvironment({
    parentEnv,
    platform: "linux",
    layout,
    fixtureVars,
    created,
    manifestPath: path.join(layout.guard, "server.json"),
    tsconfigPath: path.join(repoRoot, "server", "tsconfig.json"),
  });
}

/** Every check the preload runs, against the product's own reading of its database target. */
function allProblems(env: Env, expected: Record<string, string>) {
  return [
    ...environmentProblems(env, expected, "linux"),
    ...configVariableProblems(env, SERVER_CONFIG_NAMES, expected),
    ...targetProblems(
      {
        db: dbConnectionSettings(env as NodeJS.ProcessEnv),
        openaiBaseUrl: env.OPENAI_BASE_URL,
        corsOrigins: ["localhost:5173"],
        storagePaths: { stories: path.join(layout.serverData, "stories"), templates: path.join(layout.serverData, "templates") },
      },
      created
    ),
    ...outwardClientProblems(env, created),
  ];
}

describe("the environment a product process starts with", () => {
  it("holds the platform's PATH, a home under the output folder, the closed proxy and the fixtures, and nothing else from the shell", () => {
    const env = freshEnvironment();

    expect(env.PATH).toBe(parentEnv.PATH);
    expect(env.OPENAI_API_KEY).toBe(fixtureVars.server.OPENAI_API_KEY);
    expect(env.DB_HOST).toBe("127.0.0.1");
    expect(env.DB_PORT).toBe("54011");
    expect(env.OPENAI_BASE_URL).toBe(created.openaiBaseUrl);
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    for (const name of ["HOME", "USERPROFILE", "APPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TMPDIR", "TEMP", "TMP", "DOTENV_CONFIG_PATH"]) {
      expect(isInside(env[name] ?? "", outDir)).toBe(true);
    }
    for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY"]) expect(env[name]).toBe(CLOSED_PROXY_URL);
    expect(env.NO_PROXY).toBe("127.0.0.1,localhost");
    expect(env.NODE_USE_ENV_PROXY).toBe("1");
  });

  it("keeps Windows' SYSTEMROOT and COMSPEC there, and nothing more", () => {
    const env = productEnvironment({
      parentEnv: { ...parentEnv, SYSTEMROOT: "C:\\Windows", COMSPEC: "C:\\Windows\\cmd.exe", USERNAME: "someone" },
      platform: "win32",
      layout,
      fixtureVars,
      created,
      manifestPath: "m.json",
      tsconfigPath: "t.json",
    });
    expect(env.SYSTEMROOT).toBe("C:\\Windows");
    expect(env.COMSPEC).toBe("C:\\Windows\\cmd.exe");
    expect(env.USERNAME).toBeUndefined();
  });

  it("passes every check as the harness starts it", () => {
    const env = freshEnvironment();
    expect(allProblems({ ...env }, env)).toEqual([]);
  });
});

describe("the negative tests, planted after the environment is cleared", () => {
  it("lists exactly the cases the harness documents", () => {
    expect(GUARD_TEST_CASES).toEqual(["env", "target", "target-loopback"]);
  });

  it("env: a variable on no allowlist, as a dotenv file would add one, is refused", () => {
    const expected = freshEnvironment();
    const env: Env = { ...expected };
    plantGuardTest(env, "env");

    const problems = environmentProblems(env, expected, "linux");
    expect(problems).toEqual([expect.stringContaining(PLANTED_VARIABLE)]);
    // The other checks pass: the environment check alone refuses it
    expect(allProblems(env, expected)).toEqual(problems);
  });

  it.each(["target", "target-loopback"])(
    "%s: the database target the server resolves from the plant is refused by the target check itself",
    (testCase) => {
      const expected = freshEnvironment();
      const env: Env = { ...expected };
      plantGuardTest(env, testCase);

      const resolved = dbConnectionSettings(env as NodeJS.ProcessEnv);
      expect(resolved.host).toBe(testCase === "target" ? "guard-test.invalid" : "127.0.0.1");
      expect(resolved.port).toBe(testCase === "target" ? 5432 : 9);
      const targets = targetProblems({ db: resolved, openaiBaseUrl: env.OPENAI_BASE_URL, corsOrigins: ["localhost:5173"], storagePaths: { stories: layout.serverData } }, created);
      expect(targets).toEqual(expect.arrayContaining([expect.stringContaining("database target")]));
      expect(allProblems(env, expected).length).toBeGreaterThan(targets.length);
    }
  );

  it("refuses an unset target whose default points at loopback (the docker-compose database)", () => {
    const expected = freshEnvironment();
    const env: Env = { ...expected };
    delete env.DB_HOST;
    delete env.DB_PORT;
    const resolved = dbConnectionSettings(env as NodeJS.ProcessEnv);
    expect(resolved).toMatchObject({ host: "localhost", port: 5432 });
    expect(targetProblems({ db: resolved, openaiBaseUrl: env.OPENAI_BASE_URL, corsOrigins: ["localhost:5173"], storagePaths: { stories: layout.serverData } }, created)).toEqual([
      expect.stringContaining("database target"),
    ]);
  });

  it("names variables and targets, never the values they hold", () => {
    const expected = freshEnvironment();
    const env: Env = { ...expected, OPENAI_BASE_URL: "https://value-that-must-not-print.example", MAILJET_API_KEY: "value-that-must-not-print" };
    plantGuardTest(env, "target");
    const text = allProblems(env, expected).join("\n");
    expect(text).toContain("OPENAI_BASE_URL");
    expect(text).toContain("MAILJET_API_KEY");
    expect(text).not.toContain("value-that-must-not-print");
    expect(text).not.toContain("guard-test.invalid");
  });
});

describe("the other assertions", () => {
  const expected = freshEnvironment();

  it("refuses a configuration variable the harness leaves unset, or one changed from its fixture", () => {
    expect(configVariableProblems({ ...expected, LANGSMITH_TRACING: "true" }, SERVER_CONFIG_NAMES, expected)).toEqual([
      expect.stringContaining("LANGSMITH_TRACING is set"),
    ]);
    expect(configVariableProblems({ ...expected, JWT_SECRET: "other" }, SERVER_CONFIG_NAMES, expected)).toEqual([
      expect.stringContaining("JWT_SECRET holds something other"),
    ]);
  });

  it("refuses mail and tracing clients that are configured, and a model client not on the fake", () => {
    expect(outwardClientProblems({ ...expected, MAILJET_SECRET_KEY: "x" }, created)).toEqual([expect.stringContaining("Mailjet")]);
    expect(outwardClientProblems({ ...expected, LANGCHAIN_API_KEY: "x" }, created)).toEqual([expect.stringContaining("tracing")]);
    expect(outwardClientProblems({ ...expected, OPENAI_BASE_URL: "https://api.openai.com/v1" }, created)).toEqual([
      expect.stringContaining("fake API"),
    ]);
  });

  it("refuses production CORS origins and storage outside the output folder", () => {
    const db = { host: "127.0.0.1", port: 54011, database: created.db.database };
    expect(targetProblems({ db, openaiBaseUrl: created.openaiBaseUrl, corsOrigins: ["chosenpath.ai"], storagePaths: { stories: layout.serverData } }, created)).toEqual([
      expect.stringContaining("CORS"),
    ]);
    expect(targetProblems({ db, openaiBaseUrl: created.openaiBaseUrl, corsOrigins: ["localhost:5173"], storagePaths: { stories: path.join(repoRoot, "data", "stories") } }, created)).toEqual([
      expect.stringContaining("stories storage"),
    ]);
  });
});

describe("the network rules", () => {
  it("lets a socket connect only to a port the harness started on 127.0.0.1", () => {
    expect(connectionAllowed({ host: "127.0.0.1", port: 54011 }, [54011])).toBe(true);
    expect(connectionAllowed({ host: "localhost", port: "54011" }, [54011])).toBe(true);
    expect(connectionAllowed({ host: "127.0.0.1", port: 9 }, [54011])).toBe(false);
    expect(connectionAllowed({ host: "127.0.0.1", port: 5432 }, [54011])).toBe(false);
    expect(connectionAllowed({ host: "guard-test.invalid", port: 54011 }, [54011])).toBe(false);
    expect(connectionAllowed({ host: "10.0.0.5", port: 54011 }, [54011])).toBe(false);
    expect(connectionAllowed({ path: "/var/run/postgresql/.s.PGSQL.5432" }, [54011])).toBe(false);
  });

  it("treats a target as a pipe only when its path is set, as Node does: its HTTP agent passes path null for TCP", () => {
    expect(connectionAllowed({ host: "127.0.0.1", port: 54011, path: null }, [54011])).toBe(true);
    expect(connectionAllowed({ host: "127.0.0.1", port: 54011, path: undefined }, [54011])).toBe(true);
    expect(connectionAllowed({ host: "127.0.0.1", port: 54011, path: "" }, [54011])).toBe(true);
    expect(connectionAllowed({ host: "127.0.0.1", port: 54011, path: "/some/socket" }, [54011])).toBe(false);
    expect(connectionAllowed({ host: "guard-test.invalid", port: 54011, path: null }, [54011])).toBe(false);
    expect(isPipeTarget({ path: null })).toBe(false);
    expect(isPipeTarget({ path: "\\\\.\\pipe\\x" })).toBe(true);
  });

  it("reads and reports the target of every Socket#connect signature", () => {
    expect(connectTarget([[{ host: "127.0.0.1", port: 54011, path: null }, () => undefined]])).toEqual({ host: "127.0.0.1", port: 54011, path: null });
    expect(connectTarget([5432, "127.0.0.1"])).toEqual({ port: 5432, host: "127.0.0.1" });
    expect(connectTarget(["5432"])).toEqual({ port: "5432", host: undefined });
    expect(connectTarget(["/some/socket"])).toEqual({ path: "/some/socket" });
    expect(describeTarget({ host: "127.0.0.1", port: 9, path: null })).toBe("127.0.0.1:9");
    expect(describeTarget({ port: 9 })).toBe("localhost:9");
    expect(describeTarget({ path: "/some/socket" })).toBe("socket /some/socket");
  });

  it("lets the browser reach only the front door", () => {
    expect(browserRequestAllowed("http://127.0.0.1:41000/library", 41000)).toBe(true);
    expect(browserRequestAllowed("ws://127.0.0.1:41000/socket.io/?EIO=4", 41000)).toBe(true);
    expect(browserRequestAllowed("data:image/png;base64,AAAA", 41000)).toBe(true);
    expect(browserRequestAllowed("http://127.0.0.1:3000/templates", 41000)).toBe(false);
    expect(browserRequestAllowed("http://localhost:41000/", 41000)).toBe(false);
    expect(browserRequestAllowed("https://fonts.example.com/a.css", 41000)).toBe(false);
  });

  it("exits 3 on any guard violation, whatever else failed, but never hides a guard test that was not refused", () => {
    expect(finalExitCode(EXIT_CODES.ok, 0)).toBe(0);
    expect(finalExitCode(EXIT_CODES.ok, 1)).toBe(3);
    // A connection the harness refused surfaces in its caller as a setup or journey failure first
    expect(finalExitCode(EXIT_CODES.setup, 1)).toBe(3);
    expect(finalExitCode(EXIT_CODES.journey, 2)).toBe(3);
    expect(finalExitCode(EXIT_CODES.timeout, 1)).toBe(3);
    expect(finalExitCode(EXIT_CODES.refused, 0)).toBe(2);
    expect(finalExitCode(EXIT_CODES.guardTestNotRefused, 1)).toBe(70);
    expect(finalExitCode(EXIT_CODES.setup, 0)).toBe(1);
  });

  it("routes every WebSocket but the front door's to the block, agreeing with the request rule", () => {
    const blocked = blockedWebSocketPattern(41000);
    const urls = [
      "ws://127.0.0.1:41000/socket.io/?EIO=4&transport=websocket&sid=abc",
      "ws://127.0.0.1:3000/socket.io/?EIO=4&transport=websocket",
      "ws://127.0.0.1:410001/socket.io/",
      "ws://localhost:41000/socket.io/",
      "wss://127.0.0.1:41000/socket.io/",
      "wss://realtime.example.com/feed",
    ];
    for (const url of urls) expect(blocked.test(url)).toBe(!browserRequestAllowed(url, 41000));
    expect(blocked.test(urls[0])).toBe(false);
  });
});

describe("the client bundle", () => {
  const coreConfig = fs.readFileSync(path.join(repoRoot, "core", "config.ts"), "utf8");
  const literals = apiUrlLiterals(coreConfig);

  it("finds core/config.ts's hard-coded API URLs and rewrites them to the front door's prefix", () => {
    expect(literals).toHaveLength(2);
    expect(literals[0]).toBe('"http://localhost:3000"');
    const { code, replaced } = rewriteApiUrls(coreConfig, literals);
    expect(replaced).toBe(2);
    for (const literal of literals) expect(code).not.toContain(literal);
    expect(apiUrlLiterals(code)).toEqual([`"${CLIENT_API_PREFIX}"`, `"${CLIENT_API_PREFIX}"`]);
  });

  it("refuses a bundle that still calls a hard-coded API URL, or never calls the prefix", () => {
    const ok = { name: "assets/index.js", text: `const a={DEFAULT_API_URL:x?"${CLIENT_API_PREFIX}":"${CLIENT_API_PREFIX}"}` };
    expect(clientBundleProblems([ok], literals)).toEqual([]);
    expect(clientBundleProblems([ok, { name: "assets/chunk.js", text: 'fetch("http://localhost:3000/x")' }], literals)).toEqual([
      expect.stringContaining("assets/chunk.js"),
    ]);
    expect(clientBundleProblems([{ name: "assets/index.js", text: "" }], literals)).toEqual([expect.stringContaining(CLIENT_API_PREFIX)]);
    expect(clientBundleProblems([ok], [])).toEqual([expect.stringContaining("could not be read")]);
  });

  // The site origins every join link, seat card QR code and copied invite link is built from (generateJoinLink)
  const originLiterals = siteOriginLiterals(coreConfig);
  const host = "127.0.0.1:41000";
  const productionHost = JSON.parse(originLiterals[1] ?? "[]")[0];

  it("finds core/config.ts's site origins and rewrites both lists to the front door's host", () => {
    expect(originLiterals).toEqual(['["localhost:5173"]', expect.stringMatching(/^\["[^"]+"\]$/)]);
    const { code, replaced } = rewriteSiteOrigins(coreConfig, originLiterals, host);
    expect(replaced).toBe(2);
    expect(code).not.toContain("localhost:5173");
    expect(siteOriginLiterals(code)).toEqual([`["${host}"]`, `["${host}"]`]);
    // The API URLs are left to their own rewrite
    expect(apiUrlLiterals(code)).toEqual(literals);
  });

  it("reads no site origins from a form it doesn't know, so the build stops", () => {
    expect(siteOriginLiterals("DEFAULT_CORS_ORIGIN: origins,")).toEqual([]);
    expect(siteOriginLiterals('DEFAULT_CORS_ORIGIN: isDevelopment ? [] : ["example.invalid"],')).toEqual([]);
    expect(siteOriginLiterals('DEFAULT_CORS_ORIGIN: isDevelopment ? [devOrigin] : ["example.invalid"],')).toEqual([]);
  });

  it("refuses a bundle whose join links could lead anywhere but the front door", () => {
    const ok = { name: "assets/index.js", text: `const c={DEFAULT_CORS_ORIGIN:x?["${host}"]:["${host}"]};const copy="Listed on ${productionHost}."` };
    expect(siteOriginBundleProblems([ok], originLiterals, host)).toEqual([]);
    expect(siteOriginBundleProblems([ok, { name: "assets/chunk.js", text: 'join("http://localhost:5173/game/ABC")' }], originLiterals, host)).toEqual([
      "assets/chunk.js still links to the development site's origin",
    ]);
    expect(siteOriginBundleProblems([ok, { name: "index.html", text: "<a href=http://localhost:5173/>" }], originLiterals, host)).toEqual([
      "index.html still links to the development site's origin",
    ]);
    expect(siteOriginBundleProblems([ok, { name: "assets/config.js", text: `x?["${host}"]:${originLiterals[1]}` }], originLiterals, host)).toEqual([
      "assets/config.js still links to the production site's origin",
    ]);
    expect(siteOriginBundleProblems([{ name: "assets/index.js", text: "" }], originLiterals, host)).toEqual([`no script in the bundle links to the front door's ${host}`]);
    expect(siteOriginBundleProblems([ok], [], host)).toEqual([expect.stringContaining("could not be read")]);
    expect(siteOriginBundleProblems([ok], originLiterals, "localhost:41000")).toEqual([expect.stringContaining("not the front door's on 127.0.0.1")]);
  });

  it("passes a client built with both rewrites through both checks", () => {
    const { code: api } = rewriteApiUrls(coreConfig, literals);
    const { code } = rewriteSiteOrigins(api, originLiterals, host);
    const bundle = [{ name: "assets/index.js", text: code }];
    expect(clientBundleProblems(bundle, literals)).toEqual([]);
    expect(siteOriginBundleProblems(bundle, originLiterals, host)).toEqual([]);
  });
});

describe("the parameters and the output folder", () => {
  it("reads the documented parameters", () => {
    expect(parseArgs(["--out", "/tmp/x", "--viewport=mobile", "--timeout", "90", "--guard-test=target"])).toMatchObject({
      out: "/tmp/x",
      viewport: "mobile",
      timeoutSeconds: 90,
      guardTest: "target",
    });
    expect(parseArgs(["--out=/tmp/x", "--steps", "my-steps.mjs", "--pg-bin", "/opt/pg/bin"])).toMatchObject({ steps: "my-steps.mjs", pgBin: "/opt/pg/bin" });
    expect(parseArgs(["--out", "/tmp/x"]).groupMode).toBeUndefined();
    expect(parseArgs(["--out", "/tmp/x", "--group-mode", "competitive"]).groupMode).toBe("competitive");
  });

  it("takes every multiplayer game mode for the group World, and only those", () => {
    expect([...GROUP_GAME_MODES].sort()).toEqual(Object.values(GameModes).filter((mode) => mode !== GameModes.SinglePlayer).sort());
    expect(() => parseArgs(["--out", "/tmp/x", "--group-mode", "single-player"])).toThrow("--group-mode takes");
    expect(() => parseArgs(["--out", "/tmp/x", "--group-mode=versus"])).toThrow("--group-mode takes");
  });

  it("refuses what it does not take", () => {
    expect(() => parseArgs([])).toThrow("--out is required");
    expect(() => parseArgs(["--out", "/tmp/x", "--url", "https://example.com"])).toThrow("Unknown parameter --url");
    expect(() => parseArgs(["--out", "/tmp/x", "--guard-test=network"])).toThrow("--guard-test takes");
    expect(() => parseArgs(["--out", "/tmp/x", "--viewport", "tablet"])).toThrow("--viewport takes");
    expect(() => parseArgs(["--out", "/tmp/x", "--timeout", "0"])).toThrow("--timeout");
  });

  it("takes only a new or empty folder outside the repository", () => {
    expect(outputFolderProblem(outDir, repoRoot, [])).toBeUndefined();
    expect(outputFolderProblem(path.join(repoRoot, "harness-output"), repoRoot, [])).toContain("outside the repository");
    expect(outputFolderProblem(path.dirname(repoRoot), repoRoot, [])).toContain("outside the repository");
    expect(outputFolderProblem(outDir, repoRoot, ["leftover"])).toContain("new or empty");
    expect(outputFolderProblem("relative/out", repoRoot, [])).toContain("absolute");
  });
});

describe("the fixtures", () => {
  it("sign in with the dev seed's synthetic accounts and its documented local password", () => {
    const users = buildDevSeedPlan(Date.now()).users;
    expect(users.find((u) => u.email === fixtureVars.player.email)?.roleId).toBe("role_user");
    expect(users.find((u) => u.email === fixtureVars.editor.email)?.roleId).toBe("role_admin");
    expect(fixtureVars.player.password).toBe(DEV_SEED_PASSWORD);
    expect(fixtureVars.editor.password).toBe(DEV_SEED_PASSWORD);
  });

  it("name a database the dev seed's own guard accepts on the harness's host", () => {
    expect(checkDevSeedTarget(freshEnvironment(), { host: "127.0.0.1", database: fixtureVars.server.DB_DATABASE })).toEqual({ ok: true });
  });

  it("describe Worlds the template editor could make: one for a single player, one drafted for three seats that starts stories of two or three", () => {
    const { template, groupTemplate } = fixtureVars;
    expect(template).toMatchObject({ playerCount: 1, gameMode: GameModes.SinglePlayer });
    expect(groupTemplate).toMatchObject({ playerCount: MAX_PLAYERS, playerCountMin: 2 });
    expect(GROUP_GAME_MODES).toContain(groupTemplate.gameMode);
    for (const world of [template, groupTemplate]) {
      expect(world.maxTurns).toBeGreaterThanOrEqual(MIN_TURNS);
      expect(world.maxTurns).toBeLessThanOrEqual(MAX_TURNS);
      expect(world.premise.length).toBeGreaterThan(0);
    }
  });

  it("set no variable the guard would refuse, and look like no real credential", () => {
    expect(Object.keys(fixtureVars.server).every((name) => SERVER_CONFIG_NAMES.includes(name))).toBe(true);
    for (const value of Object.values(fixtureVars.server) as string[]) expect(value).not.toMatch(/^sk-/);
  });
});
