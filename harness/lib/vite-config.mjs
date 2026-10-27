// The client build's configuration: the product's own vite.config.ts, loaded
// without Vite's config loader (which writes a bundled copy into
// node_modules/.vite-temp), and the harness's changes to it.

import { isBuiltin } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rewriteApiUrls, rewriteSiteOrigins } from "./guard.mjs";

/**
 * vite.config.ts as an object: transpiled in memory with esbuild, its
 * imports resolved from client/ to absolute file URLs, its __dirname set to
 * client/, then imported from a data: URL. Nothing is written.
 */
export async function productViteConfig({ esbuild, configPath, clientDir }) {
  const result = await esbuild.build({
    entryPoints: [configPath],
    absWorkingDir: clientDir,
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "silent",
    define: {
      __dirname: JSON.stringify(path.dirname(configPath)),
      __filename: JSON.stringify(configPath),
      "import.meta.url": JSON.stringify(pathToFileURL(configPath).href),
    },
    plugins: [
      {
        name: "imports-as-file-urls",
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, async (args) => {
            if (args.pluginData?.resolving || args.kind === "entry-point" || path.isAbsolute(args.path)) return undefined;
            if (isBuiltin(args.path)) return { path: args.path, external: true };
            const resolved = await build.resolve(args.path, {
              kind: args.kind,
              resolveDir: args.resolveDir,
              pluginData: { resolving: true },
            });
            if (resolved.errors.length > 0) return { errors: resolved.errors };
            return { path: pathToFileURL(resolved.path).href, external: true };
          });
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const exported = module.default;
  return typeof exported === "function" ? exported({ command: "build", mode: "production" }) : exported;
}

/**
 * A plugin that rewrites core/config.ts as Vite loads it, in memory, and
 * stops the build if the rewrite finds nothing to replace. `rewrites()`
 * counts what it replaced, so the build can check it ran at all.
 */
function coreConfigPlugin({ name, coreConfigPath, rewrite, nothingFound }) {
  let rewrites = 0;
  return {
    name,
    enforce: "pre",
    rewrites: () => rewrites,
    transform(code, id) {
      if (path.resolve(String(id).split("?")[0]) !== path.resolve(coreConfigPath)) return null;
      const { code: rewritten, replaced } = rewrite(code);
      if (replaced === 0) this.error(nothingFound);
      rewrites += replaced;
      return { code: rewritten, map: null };
    },
  };
}

/** The plugin that rewrites core/config.ts's hard-coded API URLs to the front door's prefix. */
export function localApiPlugin({ coreConfigPath, literals }) {
  return coreConfigPlugin({
    name: "harness-local-api",
    coreConfigPath,
    rewrite: (code) => rewriteApiUrls(code, literals),
    nothingFound: "core/config.ts holds none of the API URLs the harness rewrites",
  });
}

/** The plugin that rewrites core/config.ts's site origins, which join links and QR codes are built from, to the front door's host. */
export function siteOriginPlugin({ coreConfigPath, literals, host }) {
  return coreConfigPlugin({
    name: "harness-site-origin",
    coreConfigPath,
    rewrite: (code) => rewriteSiteOrigins(code, literals, host),
    nothingFound: "core/config.ts holds none of the site origins the harness rewrites",
  });
}

/**
 * The product's config with the harness's changes: root and output, cache and
 * env folders (the env folder empty, so no .env file is read), the postcss
 * path resolved against client/ as when the product builds there, and the
 * harness's plugins (one or a list) last.
 */
export function harnessBuildConfig(config, { clientDir, outDir, cacheDir, envDir }, plugins) {
  const postcss = config.css?.postcss;
  return {
    ...config,
    configFile: false,
    root: clientDir,
    mode: "production",
    logLevel: "warn",
    envDir,
    cacheDir,
    css: { ...config.css, ...(typeof postcss === "string" ? { postcss: path.resolve(clientDir, postcss) } : {}) },
    plugins: [...(config.plugins ?? []), ...[].concat(plugins)],
    build: { ...config.build, outDir, emptyOutDir: true },
  };
}
