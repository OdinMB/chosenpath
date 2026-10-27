// Types for postgres.mjs, so the server's tests can import it.

export type NamespaceUser = { name: string; uid: string; gid: string };

export declare function findPgBin(options: {
  pgBin?: string;
  env: Record<string, string | undefined>;
  platform: string;
  exists?: (file: string) => boolean;
  readdir?: (dir: string) => string[];
}): string | undefined;

export declare function socketDirectory(layout: { pg: string; out: string }, port: number, platform: string): string;

export declare function namespaceUser(passwdText: string): NamespaceUser;

export declare function pgInvocation(
  bin: string,
  tool: string,
  args: string[],
  options: { platform: string; uid: number | undefined; mapTo?: { uid: string; gid: string } }
): { command: string; args: string[] };

export declare function freePort(): Promise<number>;

export declare function startPostgres(options: {
  bin: string;
  layout: { pg: string; out: string };
  database: string;
  user: string;
  password: string;
  env: Record<string, string>;
  platform: string;
  uid: number | undefined;
  log: (line: string) => void;
  logFile: string;
  onPort?: (port: number) => void;
}): Promise<{ port: number; socketDir: string; dataDir: string; stop: () => Promise<void> }>;
