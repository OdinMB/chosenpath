import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/*
 * The product's client/vite.config.ts as the harness loads it
 * (harness/lib/vite-config.mjs): transpiled in memory and imported, in a
 * process of its own, without Vite's config loader and without writing
 * anything into the repository. Nothing is built.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const clientDir = path.join(repoRoot, "client");
const viteConfigModule = pathToFileURL(path.join(repoRoot, "harness", "lib", "vite-config.mjs")).href;

let scratch: string;

beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "harness-vite-config-test-"));
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function viteTempEntries() {
  return [path.join(repoRoot, "node_modules", ".vite-temp"), path.join(clientDir, "node_modules", ".vite-temp")].flatMap(
    (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => path.join(dir, name)) : [])
  );
}

describe("the product's vite config, loaded by the harness", () => {
  it("comes back with the product's aliases and plugins, and writes nothing", () => {
    const script = path.join(scratch, "load-config.mjs");
    fs.writeFileSync(
      script,
      [
        'import { createRequire } from "node:module";',
        `import { productViteConfig } from ${JSON.stringify(viteConfigModule)};`,
        `const esbuild = createRequire(${JSON.stringify(path.join(clientDir, "package.json"))})("esbuild");`,
        "const config = await productViteConfig({",
        "  esbuild,",
        `  configPath: ${JSON.stringify(path.join(clientDir, "vite.config.ts"))},`,
        `  clientDir: ${JSON.stringify(clientDir)},`,
        "});",
        "process.stdout.write(JSON.stringify({",
        "  alias: config.resolve.alias,",
        "  plugins: config.plugins.flat().map((plugin) => plugin.name),",
        "  outDir: config.build.outDir,",
        "}));",
        "",
      ].join("\n")
    );
    const before = viteTempEntries();
    const result = spawnSync(process.execPath, [script], {
      cwd: scratch,
      env: { PATH: process.env.PATH ?? "" },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const loaded = JSON.parse(result.stdout);
    expect(loaded.alias.core).toBe(path.join(repoRoot, "core"));
    expect(loaded.alias.game).toBe(path.join(clientDir, "src", "game"));
    expect(loaded.plugins.some((name: string) => name.startsWith("vite:react"))).toBe(true);
    expect(loaded.outDir).toBe("dist");
    expect(viteTempEntries()).toEqual(before);
  }, 90_000);
});
