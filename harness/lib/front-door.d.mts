// Types for front-door.mjs, so the server's tests can import it.

export declare function routeRequest(urlPath: string): { to: "server"; path: string } | { to: "static"; pathname: string };

export declare function responseHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]>;

export declare function staticFile(root: string, pathname: string, exists?: (file: string) => boolean): string | undefined;

export type FrontDoor = { port: number; origin: string; close: () => Promise<void> };

export declare function startFrontDoor(options: {
  upstreamPort: () => number | undefined;
  staticRoot: () => string | undefined;
  log?: (line: string) => void;
}): Promise<FrontDoor>;
