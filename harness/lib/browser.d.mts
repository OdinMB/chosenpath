// Types for browser.mjs, so the server's tests can import it.

export declare function globalModuleRoots(options: {
  execPath: string;
  platform: string;
  env: Record<string, string | undefined>;
}): string[];

export declare const PLAYWRIGHT_MISSING: string;

export declare function loadPlaywright(
  roots: string[],
  exists?: (file: string) => boolean
): Promise<{ module: unknown; name: string; version: string; dir: string }>;

export declare const CHROMIUM_ARGS: string[];

export declare function runJourney(options: Record<string, unknown>): Promise<string[]>;
