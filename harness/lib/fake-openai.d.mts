// Types for fake-openai.mjs, so the server's tests can import it.

import type { FakeRequestReading } from "./fake-story.mjs";

export declare const PLACEHOLDER_MARK: string;

type Hint = (...args: never[]) => unknown;

export type SchemaHints = {
  enum?: Record<string, unknown[] | Hint>;
  boolean?: Record<string, boolean>;
  length?: Record<string, Hint>;
  number?: Record<string, Hint>;
  string?: Record<string, Hint>;
  union?: Record<string, Hint>;
};

export declare const DEFAULT_HINTS: SchemaHints;

export declare function arrayLength(schema: Record<string, unknown>): number;

export declare function instanceFromSchema(
  rootSchema: unknown,
  hints?: SchemaHints,
  options?: { offset?: number; seed?: number; request?: FakeRequestReading }
): unknown;

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

export declare function chatCompletion(body: unknown, sequence: number, options?: { seed?: number }): Record<string, unknown>;

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
  seed?: number;
}): Promise<FakeOpenAI>;
