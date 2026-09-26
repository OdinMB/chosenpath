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

/**
 * How the schema carries its list counts.
 * - "exact": Stage 4 as it ran, kept so its records stay reproducible. Counts
 *   are enforced (minItems/maxItems, several with minItems equal to maxItems),
 *   and several descriptions leave the count out. Under strict structured
 *   output a model that wants fewer items cannot close the list, so it pads
 *   whitespace or writes blank items.
 * - "worded": the count fix. No minItems anywhere; maxItems only where a cap
 *   helps (it only lets the model close early); every count in words in its
 *   field's description, as production words it; and one fixed rule that no
 *   list item is empty.
 */
export type RewriteCounts = "exact" | "worded";

/** The worded form's one rule about list items (fixed text, so it caches). */
export const NO_EMPTY_ITEMS = "Every item in a list carries real content; a list never holds an empty or blank item.";

/** The closing lines of the fixed rules: the reply format's own rules. */
export function replyFormatLines(counts: RewriteCounts): string[] {
  return [
    ...(counts === "worded" ? [NO_EMPTY_ITEMS] : []),
    "The field descriptions in the reply format are part of these instructions.",
  ];
}

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
