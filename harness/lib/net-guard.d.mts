// Types for net-guard.mjs, so the server's tests can import it.

import type { ConnectTarget } from "./guard.mjs";

export declare function connectTarget(args: unknown[]): ConnectTarget;

export declare function describeTarget(target: ConnectTarget): string;

export declare function installConnectGuard(options: {
  allowedPorts: number[] | (() => number[]);
  onRefused: (target: string) => void;
}): void;

export declare function installListenGuard(options: {
  onListening: (listening: { requested: number | null; port: number | undefined }) => void;
}): void;
