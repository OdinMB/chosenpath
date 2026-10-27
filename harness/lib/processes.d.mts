// Types for processes.mjs, so the server's tests can import it.

export type Marker = Record<string, unknown>;
export type ExitResult = { code: number | null; signal: string | null; error?: Error };

export declare function markerLog(): {
  records: Marker[];
  push: (record: Marker) => void;
  waitFor: (pick: (record: Marker) => boolean, options: { exit: Promise<ExitResult>; timeoutMs: number; what: string }) => Promise<Marker>;
};

export declare function startChild(options: {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  logFile: string;
  onMarker?: (marker: Marker) => void;
}): {
  child: import("node:child_process").ChildProcess;
  exit: Promise<ExitResult>;
  stop: (graceMs?: number) => Promise<void>;
  isRunning: () => boolean;
};
