// Types for provision.mjs, so the server's tests can import it.

export type FixtureTemplate = { premise: string; playerCount: number; playerCountMin?: number; maxTurns: number; gameMode: string };

export type ProvisionedTemplate = { id: string; title: string; playerCountMin: number; playerCountMax: number; gameMode: string; maxTurns: number };

export declare function apiSession(origin: string): {
  request: (method: string, apiPath: string, body?: unknown) => Promise<{ status: number; json: unknown }>;
  hasCookie: (name: string) => boolean;
};

export declare function fixtureTemplates(
  fixtureVars: { template: FixtureTemplate; groupTemplate: FixtureTemplate },
  options?: { groupMode?: string; storyLength?: number }
): { template: FixtureTemplate; groupTemplate: FixtureTemplate };

export declare function provisionTemplates<Name extends string>(
  origin: string,
  fixture: {
    editor: { email: string; password: string };
    templates: Record<Name, FixtureTemplate>;
  }
): Promise<Record<Name, ProvisionedTemplate>>;
