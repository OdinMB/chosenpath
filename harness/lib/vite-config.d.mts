// Types for vite-config.mjs, so the server's tests can import it.

type ViteConfig = Record<string, unknown> & {
  plugins?: unknown[];
  css?: Record<string, unknown> & { postcss?: unknown };
  build?: Record<string, unknown>;
};

export type LocalApiPlugin = {
  name: string;
  enforce: "pre";
  rewrites: () => number;
  transform(this: { error: (message: string) => never }, code: string, id: string): { code: string; map: null } | null;
};

export declare function productViteConfig(options: {
  esbuild: { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
  configPath: string;
  clientDir: string;
}): Promise<ViteConfig>;

export declare function localApiPlugin(options: { coreConfigPath: string; literals: string[] }): LocalApiPlugin;

export declare function harnessBuildConfig(
  config: ViteConfig,
  folders: { clientDir: string; outDir: string; cacheDir: string; envDir: string },
  plugin: unknown
): ViteConfig & {
  configFile: false;
  root: string;
  mode: "production";
  logLevel: "warn";
  envDir: string;
  cacheDir: string;
  build: Record<string, unknown> & { outDir: string; emptyOutDir: true };
};
