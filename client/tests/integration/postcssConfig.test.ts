import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

/*
 * The client's PostCSS config (postcss.config.js) must run whenever Vite
 * builds with client/ as its root, also when the build starts in another
 * folder, as `vite build client` from the repository root does. Nothing is
 * built: one snippet goes through Vite's CSS pipeline in a process of its own
 * (tests/helpers/cssThroughViteConfig.mjs), started outside client/.
 */

const clientDir = resolve(__dirname, "../..");
const runner = join(clientDir, "tests", "helpers", "cssThroughViteConfig.mjs");

let elsewhere: string;

beforeAll(() => {
  elsewhere = mkdtempSync(join(tmpdir(), "client-postcss-test-"));
  mkdirSync(join(elsewhere, "env"));
});

afterAll(() => {
  rmSync(elsewhere, { recursive: true, force: true });
});

function cssThroughViteConfig(css: string) {
  return spawnSync(
    process.execPath,
    [runner, join(clientDir, "vite.config.ts"), join(elsewhere, "env"), css],
    { cwd: elsewhere, env: { PATH: process.env.PATH ?? "" }, encoding: "utf8", timeout: 60_000 }
  );
}

describe("the client's CSS pipeline", () => {
  it("runs Tailwind from postcss.config.js when the build starts outside client/", () => {
    const result = cssThroughViteConfig(".probe { @apply flex; }");
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("@apply");
    expect(result.stdout).toMatch(/\.probe\s*\{\s*display:\s*flex;?\s*\}/);
  }, 90_000);
});
