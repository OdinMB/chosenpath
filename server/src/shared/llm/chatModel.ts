import { ChatOpenAI, type ChatOpenAIFields } from "@langchain/openai";
import type { Callbacks } from "@langchain/core/callbacks/manager";
import type { ClientOptions } from "openai";
import { Logger } from "shared/logger.js";
import {
  reasoningEffortsFor,
  VERBOSITIES,
  type TextModelSettings,
  type TextRole,
  type UncheckedTextModelSettings,
} from "./textModelSettings.js";
import { errorFinishReason, errorName } from "./usageRecorder.js";

/*
 * The one place a text-model ChatOpenAI is built: the exact request shape per
 * model family, the retry policy, retry logging, and production's timeout and
 * output cap per role. The factory accepts gpt-4.x and gpt-6 (gpt-6-* and
 * gpt-6.1-*, each at the efforts it takes: reasoningEffortsFor); anything
 * else throws, because an unknown family would fail at runtime (and a
 * fail-closed content filter would then block creation). Production text
 * roles take gpt-6 only (textModelSettings.ts); gpt-4.x stays here for the
 * eval's comparison arms.
 *
 * LangChain 0.6.7 does not know gpt-6 is a reasoning model, so effort goes
 * through modelKwargs and temperature must never be set. For the same reason
 * a gpt-6 output cap goes through modelKwargs as max_completion_tokens
 * (which counts reasoning): 0.6.7 would send maxTokens as max_tokens.
 */

export type ModelFamily = "gpt-4.x" | "gpt-6";

export type ChatModelOptions = {
  role: TextRole;
  settings: TextModelSettings;
  maxRetries: number;
  timeoutMs: number;
  /** Output cap; on gpt-6 it counts reasoning tokens. Unset: no cap (the eval) */
  maxCompletionTokens?: number;
  callbacks?: Callbacks;
  /** Passed to the OpenAI client (tests and the eval inject fetch here) */
  configuration?: ClientOptions;
};

export function modelFamily(model: string): ModelFamily {
  if (model.startsWith("gpt-4.1") || model.startsWith("gpt-4o")) {
    return "gpt-4.x";
  }
  // GPT-6.1 Sol (2026-09-29) takes the gpt-6 request; a later point release waits until its page is read
  if (/^gpt-6(\.1)?-/.test(model)) {
    return "gpt-6";
  }
  throw new Error(
    `Unsupported text model "${model}": only gpt-4.1*, gpt-4o*, gpt-6-* and gpt-6.1-* are configured`
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
  const efforts = reasoningEffortsFor(model);
  if (reasoningEffort === undefined || !isOneOf(efforts, reasoningEffort)) {
    throw new Error(
      `${model} needs a reasoning effort of ${efforts.join(", ")} (got ${reasoningEffort ?? "none set"})`
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

/**
 * Logs each retry LangChain is about to make; non-retryable errors are
 * rethrown. A reply cut off at its output cap reads `finishReason` "length"
 * here and nowhere else, since the attempt that follows is the one logged.
 */
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
          name: errorName(error),
          finishReason: errorFinishReason(error),
        })}`
      );
    }
  };
}

/** The constructor fields for one role's model: the pinned request shape. */
export function chatModelFields(options: ChatModelOptions): ChatOpenAIFields {
  const { settings, maxCompletionTokens } = options;
  assertSupportedSettings(settings);
  const shape: ChatOpenAIFields =
    modelFamily(settings.model) === "gpt-4.x"
      ? {
          model: settings.model,
          temperature: settings.temperature,
          // A non-reasoning model: LangChain sends this as max_tokens, which is right here
          ...(maxCompletionTokens !== undefined ? { maxTokens: maxCompletionTokens } : {}),
        }
      : {
          model: settings.model,
          modelKwargs: {
            reasoning_effort: settings.reasoningEffort,
            // Caching off until prompts are restructured: GPT-6's implicit
            // default bills a 1.25x cache write on every unique prompt
            prompt_cache_options: { mode: "explicit" },
            ...(settings.verbosity ? { verbosity: settings.verbosity } : {}),
            ...(maxCompletionTokens !== undefined ? { max_completion_tokens: maxCompletionTokens } : {}),
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

export type CallLimits = { timeoutMs: number; maxCompletionTokens: number };

/**
 * Production's timeout and output cap per role, for the GPT-6 models of
 * 2026-09-27. Derived from the eval's valid replies (DOCS/2026-09-26_gpt6-
 * text-eval/calls.jsonl; the table and margins are in .context/text-model-
 * eval.md, "Timeouts and output caps"): each timeout is about twice the
 * slowest normal reply of the chosen arm, and each cap well above the longest
 * normal reply (reasoning included) but far below the padded runaways, so a
 * stuck or padding call fails and is retried instead of running to the old
 * 180-240 s. At the models' output speed each cap is reached at about the
 * role's timeout, so whichever binds first cuts a runaway. A cut-off call
 * bills what it wrote, so the cap bounds that too.
 */
const TURN_CAP_BY_PLAYERS: Record<1 | 2 | 3, number> = { 1: 12_000, 2: 14_000, 3: 16_000 };

/**
 * A single player's turn that closes a chapter (a switch turn after a chapter, or the ending): its own lower cap, since
 * decision B of 2026-10-01. Such a turn now and then reasons to the cap and writes nothing (the eval's 19 cut first tries,
 * every one a single player's closing turn on Luna medium, 18 of them since 29 September; never a group turn, never on
 * Luna low), and the game's retry costs the player the time the runaway took, 56-89 s at 12,000 tokens. The 445 clean
 * answered single-player closing turns stored (Luna medium, every form, 26 September to 1 October; reasoning included)
 * used median 3,442 tokens, p95 4,656, p99 4,994, at most 5,853 (reasoning alone at most 3,774). 7,500 is 28% over the
 * longest and 50% over the p99, so no answered closing turn would have been cut; a runaway is cut 4,500 tokens sooner,
 * about 26 s at the runaways' median 173 tokens a second (21-34 s over their range).
 */
export const CLOSING_TURN_CAP = 7_500;

/** What a call's limits depend on beyond its role and player count: a turn that closes a chapter (beats only). */
export type CallScope = { closingTurn?: boolean };

export function productionCallLimits(role: TextRole, players: number, scope: CallScope = {}): CallLimits {
  if (players !== 1 && players !== 2 && players !== 3) {
    throw new Error(`Unsupported player count ${players} for ${role} limits (1 to 3)`);
  }
  switch (role) {
    case "beat":
      return { timeoutMs: 90_000, maxCompletionTokens: players === 1 && scope.closingTurn ? CLOSING_TURN_CAP : TURN_CAP_BY_PLAYERS[players] };
    case "setup":
      return { timeoutMs: 120_000, maxCompletionTokens: 20_000 };
    case "templateGeneration":
    case "templateIteration":
      // Sol low since 2026-09-28. No player waits, so the timeout has room for a slow evening: 240 s since 2026-09-29
      // (was 150 s), after Sol's AI Drafts took 104 and 134 s on 2026-09-28 at about 20-24 ms a token, a pace at which
      // Sol low's longest measured setup (8,258 tokens) takes about 195 s. The cap stays 2.4x that setup.
      return { timeoutMs: 240_000, maxCompletionTokens: 20_000 };
    case "switchAnalysis":
    case "threadAnalysis":
      return { timeoutMs: 30_000, maxCompletionTokens: 4_000 };
    case "contentFilter":
      // The filter check of 2026-09-27: Luna low's slowest verdict 1.9 s, longest 122 tokens
      return { timeoutMs: 15_000, maxCompletionTokens: 2_000 };
  }
}

export function createChatModel(options: ChatModelOptions): ChatOpenAI {
  return new ChatOpenAI(chatModelFields(options));
}
