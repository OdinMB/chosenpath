import { ChatOpenAI, type ChatOpenAIFields } from "@langchain/openai";
import type { Callbacks } from "@langchain/core/callbacks/manager";
import type { ClientOptions } from "openai";
import { Logger } from "shared/logger.js";
import {
  REASONING_EFFORTS,
  VERBOSITIES,
  type TextModelSettings,
  type TextRole,
  type UncheckedTextModelSettings,
} from "./textModelSettings.js";

/*
 * The one place a text-model ChatOpenAI is built: the exact request shape per
 * model family, the retry policy and retry logging. Only gpt-4.x and gpt-6
 * are accepted; anything else throws, because an unknown family would fail
 * at runtime (and a fail-closed content filter would then block creation).
 *
 * LangChain 0.6.7 does not know gpt-6 is a reasoning model, so effort goes
 * through modelKwargs and temperature must never be set. maxTokens is never
 * set either: 0.6.7 would send it as max_tokens.
 */

export type ModelFamily = "gpt-4.x" | "gpt-6";

export type ChatModelOptions = {
  role: TextRole;
  settings: TextModelSettings;
  maxRetries: number;
  timeoutMs: number;
  callbacks?: Callbacks;
  /** Passed to the OpenAI client (tests and the eval inject fetch here) */
  configuration?: ClientOptions;
};

export function modelFamily(model: string): ModelFamily {
  if (model.startsWith("gpt-4.1") || model.startsWith("gpt-4o")) {
    return "gpt-4.x";
  }
  if (/^gpt-6-/.test(model)) {
    return "gpt-6";
  }
  throw new Error(
    `Unsupported text model "${model}": only gpt-4.1*, gpt-4o* and gpt-6-* are configured`
  );
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

/** Throws unless the settings form a request shape this factory can send. */
export function assertSupportedSettings(
  settings: UncheckedTextModelSettings
): asserts settings is TextModelSettings {
  const { model, temperature, reasoningEffort, verbosity } = settings;
  if (modelFamily(model) === "gpt-4.x") {
    if (reasoningEffort !== undefined || verbosity !== undefined) {
      throw new Error(`${model} takes no reasoning effort or verbosity`);
    }
    if (
      temperature !== undefined &&
      (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
    ) {
      throw new Error(`Temperature for ${model} must be between 0 and 2`);
    }
    return;
  }
  if (temperature !== undefined) {
    throw new Error(`${model} takes no temperature`);
  }
  if (reasoningEffort === undefined || !isOneOf(REASONING_EFFORTS, reasoningEffort)) {
    throw new Error(
      `${model} needs a reasoning effort of ${REASONING_EFFORTS.join(", ")} (got ${reasoningEffort ?? "none set"})`
    );
  }
  if (verbosity !== undefined && !isOneOf(VERBOSITIES, verbosity)) {
    throw new Error(`Unsupported verbosity "${verbosity}" for ${model}`);
  }
}

function readField(error: unknown, field: string): unknown {
  return error && typeof error === "object" && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

// LangChain's default retry policy (@langchain/core utils/async_caller.js),
// which a custom onFailedAttempt replaces, so it is re-applied here
const STATUS_NO_RETRY = [400, 401, 402, 403, 404, 405, 406, 407, 409];

function rethrowIfNotRetryable(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const name = readField(error, "name");
  if (message.startsWith("Cancel") || message.startsWith("AbortError") || name === "AbortError") {
    throw error;
  }
  if (readField(error, "code") === "ECONNABORTED") {
    throw error;
  }
  const status = readField(readField(error, "response"), "status") ?? readField(error, "status");
  if (status !== undefined && STATUS_NO_RETRY.includes(Number(status))) {
    throw error;
  }
  if (readField(readField(error, "error"), "code") === "insufficient_quota") {
    const quotaError = new Error(message);
    quotaError.name = "InsufficientQuotaError";
    throw quotaError;
  }
}

/** Logs each retry LangChain is about to make; non-retryable errors are rethrown. */
export function retryHandler(
  role: TextRole,
  log: (line: string) => void = (line) => Logger.forService("LLM").warn(line)
): (error: unknown) => void {
  return (error) => {
    rethrowIfNotRetryable(error);
    const retriesLeft = readField(error, "retriesLeft");
    if (typeof retriesLeft === "number" && retriesLeft > 0) {
      const status = readField(error, "status");
      const code = readField(error, "code");
      log(
        `retry ${JSON.stringify({
          role,
          attempt: readField(error, "attemptNumber"),
          retriesLeft,
          status: typeof status === "number" ? status : undefined,
          code: typeof code === "string" ? code : undefined,
          name: readField(error, "name"),
        })}`
      );
    }
  };
}

/** The constructor fields for one role's model: the pinned request shape. */
export function chatModelFields(options: ChatModelOptions): ChatOpenAIFields {
  const { settings } = options;
  assertSupportedSettings(settings);
  const shape: ChatOpenAIFields =
    modelFamily(settings.model) === "gpt-4.x"
      ? { model: settings.model, temperature: settings.temperature }
      : {
          model: settings.model,
          modelKwargs: {
            reasoning_effort: settings.reasoningEffort,
            // Caching off until prompts are restructured: GPT-6's implicit
            // default bills a 1.25x cache write on every unique prompt
            prompt_cache_options: { mode: "explicit" },
            ...(settings.verbosity ? { verbosity: settings.verbosity } : {}),
          },
        };
  return {
    ...shape,
    maxRetries: options.maxRetries,
    timeout: options.timeoutMs,
    useResponsesApi: false,
    __includeRawResponse: true,
    callbacks: options.callbacks,
    // Reaches every callback's metadata, so call logs carry the role
    metadata: { role: options.role },
    onFailedAttempt: retryHandler(options.role),
    configuration: options.configuration,
  };
}

/** Production retries: each is billed, so at most two, and each is logged. */
export const PRODUCTION_MAX_RETRIES = 2;

/** Well above the slowest expected call (3-player setup, ~100 s); cuts only hung requests. */
export const PRODUCTION_TIMEOUT_MS: Record<TextRole, number> = {
  setup: 240_000,
  templateGeneration: 240_000,
  templateIteration: 240_000,
  beat: 180_000,
  switchAnalysis: 120_000,
  threadAnalysis: 120_000,
  contentFilter: 60_000,
};

export function createChatModel(options: ChatModelOptions): ChatOpenAI {
  return new ChatOpenAI(chatModelFields(options));
}
