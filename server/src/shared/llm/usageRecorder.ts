import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMResult } from "@langchain/core/outputs";
import { Logger } from "shared/logger.js";

/*
 * Turns one finished chat call into a metrics record and logs it: role,
 * model, effort, tokens by type, milliseconds, finish reason, refusal, and the
 * story tags the caller passed as invoke metadata. Never logs prompt or
 * output text (so no error message), and never a user id. A reply cut off
 * at its output cap fails inside openai's parse, so it shows only as a
 * failed attempt: `finishReason` "length" on the retry line (chatModel.ts)
 * or on this record's error. Background: .context/text-model-eval.md.
 */

export type CallMetrics = {
  model?: string;
  systemFingerprint?: string;
  serviceTier?: string;
  inputTokens: number;
  cachedTokens: number;
  /** GPT-6 only; LangChain 0.6.7 drops it from usage_metadata */
  cacheWriteTokens: number;
  /** Includes reasoning tokens */
  outputTokens: number;
  reasoningTokens: number;
  finishReason?: string;
  refusal: boolean;
};

/** Story tags a caller passes as `invoke(prompt, { metadata })`. */
export type CallTags = {
  role?: string;
  storyId?: string;
  turn?: number;
  players?: number;
  beatType?: string;
  images?: boolean;
  pregeneration?: boolean;
};

export type LlmCallRecord = CallTags & {
  model?: string;
  effort?: string;
  ms: number;
  ok: boolean;
  metrics?: CallMetrics;
  error?: { name?: string; status?: number; code?: string; param?: string; finishReason?: string };
};

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * An error's name, or its class where the name is the generic "Error":
 * openai's own errors (LengthFinishReasonError, InternalServerError,
 * APIConnectionError, …) set none, so without the class every one of them
 * would log as "Error".
 */
export function errorName(error: unknown): string | undefined {
  const name = stringAt(error, "name");
  if (name && name !== "Error") return name;
  const className = error && typeof error === "object" ? error.constructor?.name : undefined;
  return className && className !== "Object" ? className : name;
}

// openai's parse throws these before LangChain sees the reply, so a cut-off
// or filtered reply never reaches handleLLMEnd's finish reason
const FINISH_REASON_ERRORS: Record<string, string> = {
  LengthFinishReasonError: "length",
  ContentFilterFinishReasonError: "content_filter",
};

/** "length" for a reply cut off at its output cap, "content_filter" for a filtered one; otherwise undefined. */
export function errorFinishReason(error: unknown): string | undefined {
  const name = errorName(error);
  return name ? FINISH_REASON_ERRORS[name] : undefined;
}

function numberAt(value: unknown, ...path: string[]): number {
  const found = path.reduce<unknown>((current, key) => field(current, key), value);
  return typeof found === "number" ? found : 0;
}

function stringAt(value: unknown, ...path: string[]): string | undefined {
  const found = path.reduce<unknown>((current, key) => field(current, key), value);
  return typeof found === "string" ? found : undefined;
}

/** Reads a raw Chat Completions body; missing fields default to 0 / undefined. */
export function callMetricsFromCompletion(raw: unknown): CallMetrics {
  const usage = field(raw, "usage");
  const choices = field(raw, "choices");
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const refusal = field(field(first, "message"), "refusal");
  return {
    model: stringAt(raw, "model"),
    systemFingerprint: stringAt(raw, "system_fingerprint"),
    serviceTier: stringAt(raw, "service_tier"),
    inputTokens: numberAt(usage, "prompt_tokens"),
    cachedTokens: numberAt(usage, "prompt_tokens_details", "cached_tokens"),
    cacheWriteTokens: numberAt(usage, "prompt_tokens_details", "cache_write_tokens"),
    outputTokens: numberAt(usage, "completion_tokens"),
    reasoningTokens: numberAt(usage, "completion_tokens_details", "reasoning_tokens"),
    finishReason: stringAt(first, "finish_reason"),
    refusal: typeof refusal === "string" && refusal.length > 0,
  };
}

/** Only the known tags, so nothing else a caller passes can reach the log. */
function tagsFrom(metadata: Record<string, unknown> | undefined): CallTags {
  const num = (key: string) =>
    typeof metadata?.[key] === "number" ? (metadata[key] as number) : undefined;
  const bool = (key: string) =>
    typeof metadata?.[key] === "boolean" ? (metadata[key] as boolean) : undefined;
  return {
    role: stringAt(metadata, "role"),
    storyId: stringAt(metadata, "storyId"),
    turn: num("turn"),
    players: num("players"),
    beatType: stringAt(metadata, "beatType"),
    images: bool("images"),
    pregeneration: bool("pregeneration"),
  };
}

type StartedCall = { startedAt: number; tags: CallTags; model?: string; effort?: string };

export class LlmCallLogger extends BaseCallbackHandler {
  name = "llm-call-logger";
  private started = new Map<string, StartedCall>();

  constructor(
    private readonly sink: (record: LlmCallRecord) => void,
    private readonly now: () => number = Date.now
  ) {
    // Awaited, so a record is written before invoke() returns
    super({ _awaitHandler: true });
  }

  handleChatModelStart(
    _llm: Serialized,
    _messages: BaseMessage[][],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>
  ): void {
    const params = field(extraParams, "invocation_params");
    this.started.set(runId, {
      startedAt: this.now(),
      tags: tagsFrom(metadata),
      model: stringAt(params, "model"),
      effort: stringAt(params, "reasoning_effort"),
    });
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const call = this.take(runId);
    const message = field(output.generations[0]?.[0], "message");
    const raw = field(field(message, "additional_kwargs"), "__raw_response");
    this.sink({ ...call, ok: true, metrics: callMetricsFromCompletion(raw) });
  }

  handleLLMError(error: unknown, runId: string): void {
    const call = this.take(runId);
    const status = field(error, "status");
    this.sink({
      ...call,
      ok: false,
      error: {
        name: errorName(error),
        status: typeof status === "number" ? status : undefined,
        code: stringAt(error, "code"),
        param: stringAt(error, "param"),
        finishReason: errorFinishReason(error),
      },
    });
  }

  private take(runId: string): Omit<LlmCallRecord, "ok"> {
    const call = this.started.get(runId);
    this.started.delete(runId);
    return {
      ...(call?.tags ?? {}),
      model: call?.model,
      effort: call?.effort,
      ms: call ? this.now() - call.startedAt : 0,
    };
  }
}

/** The production instance: one compact JSON line per call. */
export const llmCallLogger = new LlmCallLogger((record) =>
  Logger.forService("LLM").log(JSON.stringify(record))
);
