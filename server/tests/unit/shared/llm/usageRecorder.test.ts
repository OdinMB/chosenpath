import { z } from "zod";
import { createChatModel } from "../../../../src/shared/llm/chatModel.js";
import {
  callMetricsFromCompletion,
  LlmCallLogger,
  type LlmCallRecord,
} from "../../../../src/shared/llm/usageRecorder.js";

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

const fullCompletion = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 0,
  model: "gpt-6-luna-2026-09-22",
  system_fingerprint: "fp_1",
  service_tier: "default",
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: '{"answer":"yes"}', refusal: null },
    },
  ],
  usage: {
    prompt_tokens: 1200,
    completion_tokens: 300,
    total_tokens: 1500,
    prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 1000 },
    completion_tokens_details: { reasoning_tokens: 120 },
  },
};

function respondWith(status: number, body: unknown): FetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}

describe("callMetricsFromCompletion", () => {
  it("reads every token type, the finish reason and the served model", () => {
    expect(callMetricsFromCompletion(fullCompletion)).toEqual({
      model: "gpt-6-luna-2026-09-22",
      systemFingerprint: "fp_1",
      serviceTier: "default",
      inputTokens: 1200,
      cachedTokens: 200,
      cacheWriteTokens: 1000,
      outputTokens: 300,
      reasoningTokens: 120,
      finishReason: "stop",
      refusal: false,
    });
  });

  it("flags a refusal and defaults missing fields", () => {
    const metrics = callMetricsFromCompletion({
      choices: [{ finish_reason: "stop", message: { refusal: "I can't help with that." } }],
    });
    expect(metrics).toMatchObject({
      inputTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      refusal: true,
    });
    expect(callMetricsFromCompletion(undefined).refusal).toBe(false);
  });
});

describe("LlmCallLogger", () => {
  function clock() {
    let t = 1_000;
    return () => (t += 250);
  }

  it("emits one record per call with latency, role, model and story tags", async () => {
    const records: LlmCallRecord[] = [];
    const model = createChatModel({
      role: "beat",
      settings: { model: "gpt-6-luna", reasoningEffort: "low" },
      maxRetries: 0,
      timeoutMs: 5_000,
      callbacks: [new LlmCallLogger((r) => records.push(r), clock())],
      configuration: { fetch: respondWith(200, fullCompletion) },
    });
    await model.withStructuredOutput(z.object({ answer: z.string() })).invoke("x", {
      metadata: { storyId: "s1", turn: 4, players: 1, pregeneration: true, prompt: "secret" },
    });
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record).toMatchObject({
      role: "beat",
      storyId: "s1",
      turn: 4,
      players: 1,
      pregeneration: true,
      model: "gpt-6-luna",
      effort: "low",
      ok: true,
      ms: 250,
    });
    expect(record.metrics?.cacheWriteTokens).toBe(1000);
    // Unknown metadata never reaches the log
    expect(JSON.stringify(record)).not.toContain("secret");
  });

  it("records status, code and param on an error", async () => {
    const records: LlmCallRecord[] = [];
    const model = createChatModel({
      role: "setup",
      settings: { model: "gpt-6-sol", reasoningEffort: "medium" },
      maxRetries: 0,
      timeoutMs: 5_000,
      callbacks: [new LlmCallLogger((r) => records.push(r), clock())],
      configuration: {
        fetch: respondWith(400, {
          error: {
            message: "Unsupported parameter",
            type: "invalid_request_error",
            code: "unsupported_parameter",
            param: "temperature",
          },
        }),
      },
    });
    await expect(
      model.withStructuredOutput(z.object({ answer: z.string() })).invoke("x")
    ).rejects.toBeDefined();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      role: "setup",
      ok: false,
      error: { status: 400, code: "unsupported_parameter", param: "temperature" },
    });
  });
});
