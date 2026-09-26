import type { z } from "zod";

/*
 * What happened to one eval call, read from the raw HTTP response the
 * executor captured (so a reply LangChain failed to parse is still visible):
 * rejected, timed out, refused, cut off, valid, repairable (text after the
 * JSON), or broken. Also flags junk characters inside the output's strings.
 */

export type Outcome =
  | "http-error"
  | "timeout"
  | "network-error"
  | "refusal"
  | "length"
  | "valid"
  | "repaired"
  | "invalid-json"
  | "schema-mismatch";

/** Outcomes whose output the harness can use */
export const USABLE_OUTCOMES: Outcome[] = ["valid", "repaired"];

export type Capture = {
  status?: number;
  requestId?: string;
  processingMs?: number;
  body?: string;
};

export type CallCheck = {
  outcome: Outcome;
  /** The schema-validated output (valid and repaired only) */
  parsed?: unknown;
  status?: number;
  code?: string;
  param?: string;
  /** A 400 naming a parameter: the API rejected part of the request shape */
  rejectedParam: boolean;
  /** Text after the first complete JSON object ("text after JSON") */
  trailingText?: string;
  finishReason?: string;
  content?: string;
  junkChars: number;
  junkSample?: string;
  errorMessage?: string;
};

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseJson(text: string | undefined): { ok: true; value: unknown } | { ok: false } {
  if (text === undefined) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** The first balanced top-level `{...}` in the text, respecting strings. */
export function firstJsonObject(text: string): { json: string; rest: string } | undefined {
  const start = text.indexOf("{");
  if (start < 0) {
    return undefined;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      return { json: text.slice(start, i + 1), rest: text.slice(i + 1) };
    }
  }
  return undefined;
}

const ALLOWED_CONTROL = new Set(["\n", "\r", "\t"]);
const ALLOWED_SCRIPT = /\p{Script=Latin}|\p{Script=Greek}|\p{Script=Cyrillic}/u;

/** Control characters, private-use or replacement characters, and letters outside Latin, Greek and Cyrillic. */
function isJunk(ch: string): boolean {
  if (/\p{Cc}/u.test(ch)) return !ALLOWED_CONTROL.has(ch);
  if (/\p{Co}|\p{Cn}|�/u.test(ch)) return true;
  if (/\p{L}/u.test(ch)) return !ALLOWED_SCRIPT.test(ch);
  return false;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

export function junkIn(value: unknown): { count: number; sample?: string } {
  let count = 0;
  let sample: string | undefined;
  for (const text of strings(value)) {
    for (const ch of text) {
      if (isJunk(ch)) {
        count++;
        sample ??= ch;
      }
    }
  }
  return { count, sample };
}

function isTimeout(error: unknown): boolean {
  const name = asString(field(error, "name")) ?? "";
  const message = error instanceof Error ? error.message : "";
  return /timeout/i.test(name) || /timed? ?out/i.test(message);
}

export function classifyCall(
  capture: Capture,
  error: unknown,
  schema: z.ZodTypeAny
): CallCheck {
  const errorMessage = error === undefined ? undefined : error instanceof Error ? error.message : String(error);
  const body = parseJson(capture.body);
  const bodyValue = body.ok ? body.value : undefined;
  const base = { rejectedParam: false, junkChars: 0, errorMessage };

  if (capture.status !== undefined && capture.status >= 400) {
    const apiError = field(bodyValue, "error");
    const param = asString(field(apiError, "param"));
    return {
      ...base,
      outcome: "http-error",
      status: capture.status,
      code: asString(field(apiError, "code")),
      param,
      rejectedParam: capture.status === 400 && param !== undefined,
    };
  }
  if (capture.status === undefined) {
    return { ...base, outcome: isTimeout(error) ? "timeout" : "network-error" };
  }

  const choice = (field(bodyValue, "choices") as unknown[] | undefined)?.[0];
  const message = field(choice, "message");
  const finishReason = asString(field(choice, "finish_reason"));
  const content = asString(field(message, "content"));
  const refusal = asString(field(message, "refusal"));
  const withReply = { ...base, status: capture.status, finishReason, content };

  if (refusal) {
    return { ...withReply, outcome: "refusal" };
  }
  if (finishReason === "length") {
    return { ...withReply, outcome: "length" };
  }

  const validate = (value: unknown) => {
    const result = schema.safeParse(value);
    return result.success ? result.data : undefined;
  };
  const junk = (value: unknown) => {
    const found = junkIn(value);
    return { junkChars: found.count, junkSample: found.sample };
  };

  const whole = parseJson(content);
  if (whole.ok) {
    const parsed = validate(whole.value);
    return parsed === undefined
      ? { ...withReply, outcome: "schema-mismatch", ...junk(whole.value) }
      : { ...withReply, outcome: "valid", parsed, ...junk(parsed) };
  }

  const first = content === undefined ? undefined : firstJsonObject(content);
  const repaired = parseJson(first?.json);
  if (!first || !repaired.ok) {
    return { ...withReply, outcome: "invalid-json" };
  }
  const parsed = validate(repaired.value);
  return parsed === undefined
    ? { ...withReply, outcome: "schema-mismatch", trailingText: first.rest, ...junk(repaired.value) }
    : { ...withReply, outcome: "repaired", parsed, trailingText: first.rest, ...junk(parsed) };
}
