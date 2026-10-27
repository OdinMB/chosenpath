// Types for provision.mjs, so the server's tests can import it.

export declare function apiSession(origin: string): {
  request: (method: string, apiPath: string, body?: unknown) => Promise<{ status: number; json: unknown }>;
  hasCookie: (name: string) => boolean;
};

export declare function provisionTemplate(
  origin: string,
  fixture: {
    editor: { email: string; password: string };
    template: { premise: string; playerCount: number; maxTurns: number; gameMode: string };
  }
): Promise<{ id: string; title: string }>;
