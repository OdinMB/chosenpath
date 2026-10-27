import { describe, expect, it } from "@jest/globals";
import path from "node:path";
import { harnessBuildConfig, localApiPlugin, siteOriginPlugin } from "../../../../harness/lib/vite-config.mjs";

/*
 * The harness's changes to the client build (harness/lib/vite-config.mjs):
 * the plugins that point core/config.ts's API URLs and site origins at the
 * front door, and the folders the build may write to.
 */

const coreConfigPath = path.resolve("/repo/core/config.ts");
const literals = ['"http://localhost:3000"', '"https://api.example.invalid"'];
const source = 'DEFAULT_API_URL: isDevelopment ? "http://localhost:3000" : "https://api.example.invalid",';

const context = {
  error: (message: string): never => {
    throw new Error(message);
  },
};

describe("the harness's API plugin", () => {
  it("points core/config.ts's API URLs at the front door, and counts what it replaced", () => {
    const plugin = localApiPlugin({ coreConfigPath, literals });
    const result = plugin.transform.call(context, source, `${coreConfigPath}?v=1`);
    expect(result?.code).toBe('DEFAULT_API_URL: isDevelopment ? "/__api" : "/__api",');
    expect(plugin.rewrites()).toBe(2);
  });

  it("leaves every other module alone", () => {
    const plugin = localApiPlugin({ coreConfigPath, literals });
    expect(plugin.transform.call(context, source, path.resolve("/repo/client/src/main.tsx"))).toBeNull();
    expect(plugin.rewrites()).toBe(0);
  });

  it("stops the build when core/config.ts no longer holds the URLs", () => {
    const plugin = localApiPlugin({ coreConfigPath, literals });
    expect(() => plugin.transform.call(context, "DEFAULT_API_URL: apiFromSomewhereElse,", coreConfigPath)).toThrow(
      "core/config.ts holds none of the API URLs the harness rewrites"
    );
    expect(plugin.rewrites()).toBe(0);
  });
});

describe("the harness's site origin plugin", () => {
  const originLiterals = ['["localhost:5173"]', '["example.invalid"]'];
  const origins = 'DEFAULT_CORS_ORIGIN: isDevelopment ? ["localhost:5173"] : ["example.invalid"],';

  it("points core/config.ts's site origins, which join links are built from, at the front door's host", () => {
    const plugin = siteOriginPlugin({ coreConfigPath, literals: originLiterals, host: "127.0.0.1:41000" });
    const result = plugin.transform.call(context, `${source}\n${origins}`, coreConfigPath);
    expect(result?.code).toBe(`${source}\nDEFAULT_CORS_ORIGIN: isDevelopment ? ["127.0.0.1:41000"] : ["127.0.0.1:41000"],`);
    expect(plugin.rewrites()).toBe(2);
    expect(plugin.name).not.toBe(localApiPlugin({ coreConfigPath, literals }).name);
  });

  it("leaves every other module alone, and stops the build when core/config.ts no longer holds the origins", () => {
    const plugin = siteOriginPlugin({ coreConfigPath, literals: originLiterals, host: "127.0.0.1:41000" });
    expect(plugin.transform.call(context, origins, path.resolve("/repo/client/src/shared/utils/codeSetUtils.ts"))).toBeNull();
    expect(() => plugin.transform.call(context, source, coreConfigPath)).toThrow("core/config.ts holds none of the site origins the harness rewrites");
    expect(plugin.rewrites()).toBe(0);
  });

  it("runs after the API plugin on the same module, each rewriting only its own literals", () => {
    const api = localApiPlugin({ coreConfigPath, literals });
    const origin = siteOriginPlugin({ coreConfigPath, literals: originLiterals, host: "127.0.0.1:41000" });
    const once = api.transform.call(context, `${source}\n${origins}`, coreConfigPath);
    const twice = origin.transform.call(context, once?.code ?? "", coreConfigPath);
    expect(twice?.code).toBe('DEFAULT_API_URL: isDevelopment ? "/__api" : "/__api",\nDEFAULT_CORS_ORIGIN: isDevelopment ? ["127.0.0.1:41000"] : ["127.0.0.1:41000"],');
    expect([api.rewrites(), origin.rewrites()]).toEqual([2, 2]);
  });
});

describe("the harness's build configuration", () => {
  const folders = {
    clientDir: path.resolve("/repo/client"),
    outDir: path.resolve("/out/client/dist"),
    cacheDir: path.resolve("/out/client/cache"),
    envDir: path.resolve("/out/client/env"),
  };
  const productConfig = {
    plugins: ["react"],
    css: { postcss: "./postcss.config.cjs", devSourcemap: true },
    resolve: { alias: { core: "/repo/core" } },
    build: { outDir: "dist", emptyOutDir: true, rollupOptions: { output: {} } },
  };

  it("keeps the product's settings, and writes only under the output folder", () => {
    const config = harnessBuildConfig(productConfig, folders, "harness-plugin");
    expect(config).toMatchObject({
      configFile: false,
      root: folders.clientDir,
      mode: "production",
      envDir: folders.envDir,
      cacheDir: folders.cacheDir,
      resolve: productConfig.resolve,
      build: { outDir: folders.outDir, emptyOutDir: true, rollupOptions: { output: {} } },
    });
  });

  it("resolves the postcss path against client/, and adds the plugin last", () => {
    const config = harnessBuildConfig(productConfig, folders, "harness-plugin");
    expect(config.css).toEqual({ postcss: path.join(folders.clientDir, "postcss.config.cjs"), devSourcemap: true });
    expect(config.plugins).toEqual(["react", "harness-plugin"]);
  });

  it("adds a list of plugins last, in their order", () => {
    expect(harnessBuildConfig(productConfig, folders, ["api-plugin", "origin-plugin"]).plugins).toEqual(["react", "api-plugin", "origin-plugin"]);
  });

  it("works for a config with no css, plugins or build section", () => {
    const config = harnessBuildConfig({}, folders, "harness-plugin");
    expect(config.plugins).toEqual(["harness-plugin"]);
    expect(config.css).toEqual({});
    expect(config.build).toEqual({ outDir: folders.outDir, emptyOutDir: true });
  });
});
