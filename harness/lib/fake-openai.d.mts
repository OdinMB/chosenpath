// Types for fake-openai.mjs, so the server's tests can import it.

export declare const PLACEHOLDER_MARK: string;

export type SchemaHints = {
  enum?: Record<string, unknown[]>;
  boolean?: Record<string, boolean>;
};

export declare const DEFAULT_HINTS: SchemaHints;

export declare function arrayLength(schema: Record<string, unknown>): number;

export declare function instanceFromSchema(rootSchema: unknown, hints?: SchemaHints, options?: { offset?: number }): unknown;

export declare function placeholderPng(width: number, height: number, seed?: number): Buffer;

export declare function imageSize(size: unknown): { width: number; height: number };

export declare function placeholderImage(
  format: string,
  size: unknown,
  seed: number,
  sharpFrom?: string
): Promise<{ bytes: Buffer; format: string }>;

export declare function requestedSchema(
  body: unknown
): { schema: unknown; as: "content" } | { schema: unknown; as: "tool"; name: string } | undefined;

export declare function chatCompletion(body: unknown, sequence: number): Record<string, unknown>;

export type FakeRequestRecord = {
  method: string | undefined;
  path: string;
  model?: string;
  kind: "models" | "structured" | "text" | "image" | "moderation" | "unhandled" | "error";
  status: number;
};

export type FakeOpenAI = {
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
};

export declare function startFakeOpenAI(options?: {
  record?: (entry: FakeRequestRecord) => void;
  sharpFrom?: string;
}): Promise<FakeOpenAI>;
