// Types for guard.mjs, so the server's tests can import it.

export type Env = Record<string, string | undefined>;

export type GuardTestCase = "env" | "target" | "target-loopback";

export type OutputLayout = {
  out: string;
  guard: string;
  home: string;
  appData: string;
  localAppData: string;
  config: string;
  cache: string;
  data: string;
  state: string;
  tmp: string;
  logs: string;
  shots: string;
  pg: string;
  serverWork: string;
  serverData: string;
  clientEnv: string;
  clientDist: string;
  clientCache: string;
  browserHome: string;
  noDotenv: string;
};

export type CreatedTargets = {
  db: { host: string; port: number; database: string };
  openaiBaseUrl: string;
  outDir: string;
};

export type ResolvedTargets = {
  db?: { host?: string; port?: number | string; database?: string };
  openaiBaseUrl?: string;
  corsOrigins?: string[];
  storagePaths?: Record<string, string>;
};

export type FixtureVars = { server: Record<string, string> };

export type HarnessArgs = {
  out: string | undefined;
  steps: string | undefined;
  viewport: string;
  timeoutSeconds: number;
  pgBin: string | undefined;
  guardTest: string | undefined;
  help: boolean;
};

export declare const GUARD_LINE_PREFIX: string;
export declare const MARKER_PREFIX: string;
export declare const GUARD_TEST_CASES: GuardTestCase[];
export declare const GUARD_TEST_TARGETS: Record<"target" | "target-loopback", string>;
export declare const PLANTED_VARIABLE: string;
export declare const CLOSED_PROXY_URL: string;
export declare const CLIENT_API_PREFIX: string;
export declare const DEVELOPMENT_CORS_ORIGINS: string[];
export declare const SERVER_CONFIG_NAMES: string[];
export declare const VIEWPORTS: Record<string, Record<string, unknown>>;
export declare const USAGE: string;

export declare function platformVariables(parentEnv: Env, platform: string): Record<string, string>;
export declare function outputLayout(outDir: string): OutputLayout;
export declare function homeVariables(layout: OutputLayout, home?: string): Record<string, string>;
export declare function proxyVariables(proxyUrl?: string): Record<string, string>;
export declare function serverFixtures(fixtureVars: FixtureVars, created: CreatedTargets): Record<string, string>;
export declare function productEnvironment(options: {
  parentEnv: Env;
  platform: string;
  layout: OutputLayout;
  fixtureVars: FixtureVars;
  created: CreatedTargets;
  manifestPath: string;
  tsconfigPath: string;
}): Record<string, string>;
export declare function clientBuildEnvironment(options: { parentEnv: Env; platform: string; layout: OutputLayout }): Record<string, string>;
export declare function plantGuardTest(env: Env, testCase: string): void;
export declare function environmentProblems(env: Env, expected: Record<string, string>, platform?: string): string[];
export declare function configVariableProblems(env: Env, names: string[], expected: Record<string, string>): string[];
export declare function targetProblems(resolved: ResolvedTargets, created: CreatedTargets): string[];
export declare function outwardClientProblems(env: Env, created: CreatedTargets): string[];
export type ConnectTarget = { host?: string; port?: number | string; path?: string | null };
export declare function isPipeTarget(target: ConnectTarget | undefined): boolean;
export declare function connectionAllowed(target: ConnectTarget | undefined, allowedPorts: number[]): boolean;
export declare function browserRequestAllowed(url: string, frontDoorPort: number): boolean;
export declare function blockedWebSocketPattern(frontDoorPort: number): RegExp;
export declare function apiUrlLiterals(coreConfigSource: string): string[];
export declare function rewriteApiUrls(source: string, literals: string[], prefix?: string): { code: string; replaced: number };
export declare function clientBundleProblems(files: { name: string; text: string }[], literals: string[], prefix?: string): string[];
export declare const EXIT_CODES: {
  ok: 0;
  setup: 1;
  refused: 2;
  violation: 3;
  journey: 4;
  guardTestNotRefused: 70;
  timeout: 124;
  interrupted: 130;
};
export declare function finalExitCode(code: number, violationCount: number): number;
export declare function markerLine(record: unknown): string;
export declare function parseMarker(line: string): Record<string, unknown> | undefined;
export declare function parseArgs(argv: string[]): HarnessArgs;
export declare function outputFolderProblem(outDir: string, repoRoot: string, entries: string[]): string | undefined;
export declare function isInside(child: string, parent: string): boolean;
