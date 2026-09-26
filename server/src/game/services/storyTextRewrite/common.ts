import { z } from "zod";

/*
 * What both Stage 4 rewrites share: the split request shape, taking
 * production's verbatim text from its prompt at an anchor, and guarded
 * access to production's zod schemas. Eval only (see beat.ts and setup.ts).
 */

/** A request in two messages: fixed rules (cacheable), then this call's part. */
export type SplitTextRequest = {
  /** Identical for every call of the role (setup: of its player-count class), so it caches */
  fixed: string;
  /** This call's instructions, ending with production's own state or configuration text */
  perCall: string;
  schema: z.ZodTypeAny;
};

function required(text: string, anchor: string, name: string): number {
  const at = text.indexOf(anchor);
  if (at < 0) throw new Error(`Stage 4 rewrite: ${name} anchor "${anchor}" not found`);
  return at;
}

/** The text from the anchor's first occurrence on; the anchor must exist. */
export function textFrom(text: string, anchor: string, name: string): string {
  return text.slice(required(text, anchor, name));
}

/** The text between the first occurrences of both anchors, exclusive; both must exist, in order. */
export function textBetween(text: string, from: string, to: string, name: string): string {
  const start = required(text, from, name) + from.length;
  const end = required(text, to, name);
  if (end < start) throw new Error(`Stage 4 rewrite: ${name} anchor "${to}" comes before "${from}"`);
  return text.slice(start, end);
}

export function asObject(schema: unknown, label: string): z.AnyZodObject {
  if (!(schema instanceof z.ZodObject)) throw new Error(`Stage 4 rewrite: ${label} is not an object schema`);
  return schema;
}

export function asArray(schema: unknown, label: string): z.ZodArray<z.ZodTypeAny> {
  if (!(schema instanceof z.ZodArray)) throw new Error(`Stage 4 rewrite: ${label} is not an array schema`);
  return schema;
}

export function asUnion(schema: unknown, label: string): z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]> {
  if (!(schema instanceof z.ZodUnion)) throw new Error(`Stage 4 rewrite: ${label} is not a union schema`);
  return schema;
}

export function asDiscriminatedUnion(
  schema: unknown,
  label: string
): z.ZodDiscriminatedUnion<string, z.ZodDiscriminatedUnionOption<string>[]> {
  if (!(schema instanceof z.ZodDiscriminatedUnion)) {
    throw new Error(`Stage 4 rewrite: ${label} is not a discriminated union schema`);
  }
  return schema;
}

/** The schema with one passage of its description replaced; the passage must occur exactly once. */
export function reworded<T extends z.ZodTypeAny>(schema: T, find: string, replace: string): T {
  const description = schema.description ?? "";
  const count = description.split(find).length - 1;
  if (count !== 1) throw new Error(`Stage 4 rewrite: "${find}" found ${count} times in a description`);
  return schema.describe(description.split(find).join(replace));
}
