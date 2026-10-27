// The browser: Playwright's Chromium from the machine's global install (never
// a dependency of this repository), every page in a context that aborts any
// request and WebSocket not to the front door's port, and Chromium's own
// traffic sent to the closed proxy with name resolution off. A journey gets
// { page, baseUrl, login, shot, log, finding, newPage, fixture, viewport }.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CLOSED_PROXY_URL, VIEWPORTS, blockedWebSocketPattern, browserRequestAllowed } from "./guard.mjs";

/** Where global npm packages live for this Node: <prefix>/lib/node_modules, or <prefix>/node_modules on Windows; NODE_PATH first. */
export function globalModuleRoots({ execPath, platform, env }) {
  const fromNodePath = String(env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean);
  const prefix = platform === "win32" ? path.dirname(execPath) : path.dirname(path.dirname(execPath));
  const roots = [...fromNodePath, platform === "win32" ? path.join(prefix, "node_modules") : path.join(prefix, "lib", "node_modules")];
  if (env.npm_config_prefix) {
    roots.push(platform === "win32" ? path.join(env.npm_config_prefix, "node_modules") : path.join(env.npm_config_prefix, "lib", "node_modules"));
  }
  return [...new Set(roots)];
}

export const PLAYWRIGHT_MISSING = [
  "Playwright is not installed globally, and the harness never installs it or adds it to this repository.",
  "It needs a one-time install outside the project (harness/README.md, \"Needs outside the project\"), for example:",
  "  npm install -g playwright@1.63.0 && npx -y playwright@1.63.0 install chromium",
].join("\n");

/** The global Playwright package: its module, name, version and folder. Throws PLAYWRIGHT_MISSING when there is none. */
export async function loadPlaywright(roots, exists = fs.existsSync) {
  for (const root of roots) {
    for (const name of ["playwright", "playwright-core"]) {
      const dir = path.join(root, name);
      const entry = path.join(dir, "index.mjs");
      if (!exists(entry)) continue;
      // From its real folder: a global install is often a symlink, and its own
      // dependency (playwright-core) sits next to the real one
      const module = await import(pathToFileURL(realPath(entry)).href);
      const version = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
      return { module: module.default ?? module, name, version, dir };
    }
  }
  throw new Error(PLAYWRIGHT_MISSING);
}

function realPath(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "shot";
}

/** Chromium's flags: no background traffic, no name resolution but 127.0.0.1's. */
export const CHROMIUM_ARGS = [
  "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-domain-reliability",
  "--disable-sync",
  "--dns-prefetch-disable",
  "--no-pings",
  "--metrics-recording-only",
];

/**
 * Runs a journey and closes the browser. `steps` is the journey function;
 * `env` the browser process's cleared environment; `onBlocked` gets every
 * aborted URL, `onFinding` every finding the journey reports (something the
 * product did that it should not have, where the journey could go on).
 * Resolves with the screenshots taken.
 */
export async function runJourney({ playwright, origin, port, viewport, steps, shotsDir, log, fixture, env, onBlocked, onConsole, onFinding = () => undefined }) {
  const chromium = playwright.chromium;
  // Loopback goes direct; everything Chromium sends past the page routes reaches the closed proxy
  process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = "1";
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: CHROMIUM_ARGS,
      env,
      proxy: { server: CLOSED_PROXY_URL, bypass: "127.0.0.1" },
    });
  } catch (error) {
    // Headless runs use Playwright's headless shell, which is a separate install from Chromium itself
    if (/Executable doesn't exist|playwright install/i.test(String(error?.message))) {
      throw new Error(
        `Playwright's Chromium is not installed for this Playwright ${fixture.playwrightVersion ?? ""}; install it once outside the project: npx -y playwright@${fixture.playwrightVersion ?? "<version>"} install chromium`
      );
    }
    throw error;
  }
  const shots = [];
  try {
    const newPage = async () => {
      const context = await browser.newContext({ ...VIEWPORTS[viewport], baseURL: origin, serviceWorkers: "block" });
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (browserRequestAllowed(url, port)) return route.continue();
        onBlocked(url);
        return route.abort("blockedbyclient");
      });
      // Only the WebSockets to block reach this handler; the front door's go through natively
      await context.routeWebSocket(blockedWebSocketPattern(port), (ws) => {
        if (browserRequestAllowed(ws.url(), port)) {
          ws.connectToServer();
          return;
        }
        onBlocked(ws.url());
        ws.close({ code: 1008, reason: "blocked by the harness" });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") onConsole(`${message.type()}: ${message.text()}`);
      });
      page.on("pageerror", (error) => onConsole(`pageerror: ${error.message}`));
      return page;
    };

    const page = await newPage();
    const shot = async (name, target = page) => {
      const file = path.join(shotsDir, `${String(shots.length + 1).padStart(2, "0")}-${slug(name)}-${viewport}.png`);
      await target.screenshot({ path: file, fullPage: true });
      shots.push(file);
      log(`screenshot ${path.basename(file)}`);
      return file;
    };
    const login = async (target = page, account = fixture.login) => {
      await target.goto("/users/signin?view=login");
      await target.locator("#email").fill(account.email);
      await target.locator("#password").fill(account.password);
      const answer = target.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/auth/login"), { timeout: 30_000 });
      await target.locator("form button[type=submit]").first().click();
      const response = await answer;
      if (!response.ok()) throw new Error(`signing in as ${account.email} failed (HTTP ${response.status()}); the seed's accounts are in server/src/scripts/devSeedData.ts`);
      // The page leaves the sign-in form once the client has the user
      await target.waitForURL((url) => new URL(url).pathname !== "/users/signin", { timeout: 30_000 });
    };

    const finding = (text) => {
      log(`finding: ${text}`);
      onFinding(text);
    };

    try {
      await steps({ page, baseUrl: origin, login, shot, log, finding, newPage, fixture, viewport });
    } catch (error) {
      // Where the journey stopped, for whoever reads the failure
      await shot("failure").catch(() => undefined);
      log(`the journey stopped at ${page.url()}`);
      throw error;
    }
  } finally {
    await browser.close();
  }
  return shots;
}
