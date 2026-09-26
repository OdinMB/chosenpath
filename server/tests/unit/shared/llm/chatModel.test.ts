import { jest } from "@jest/globals";
import { z } from "zod";
import { createChatModel, modelFamily } from "../../../../src/shared/llm/chatModel.js";
import type { TextModelSettings } from "../../../../src/shared/llm/textModelSettings.js";

type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

function completion(content: string) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "test-model",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content, refusal: null },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fake fetch that answers from a queue of statuses and records request bodies. */
function fakeFetch(statuses: number[]) {
  const bodies: Record<string, unknown>[] = [];
  const queue = [...statuses];
  const fetch: FetchFn = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    const status = queue.shift() ?? 200;
    return status === 200
      ? jsonResponse(200, completion('{"answer":"yes"}'))
      : jsonResponse(status, { error: { message: "fail", type: "server_error", code: null } });
  };
  return { fetch, bodies };
}

const schema = z.object({ answer: z.string() });

async function sendOnce(settings: TextModelSettings) {
  const { fetch, bodies } = fakeFetch([200]);
  const model = createChatModel({
    role: "beat",
    settings,
    maxRetries: 0,
    timeoutMs: 5_000,
    configuration: { fetch },
  });
  const result = await model.withStructuredOutput(schema).invoke("x");
  expect(result).toEqual({ answer: "yes" });
  expect(bodies).toHaveLength(1);
  return bodies[0];
}

describe("createChatModel wire shape", () => {
  it("sends temperature and no reasoning parameters for gpt-4.1-mini", async () => {
    const body = await sendOnce({ model: "gpt-4.1-mini", temperature: 0.2 });
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body.temperature).toBe(0.2);
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("prompt_cache_options");
    expect(body).not.toHaveProperty("max_tokens");
  });

  it.each([
    [{ model: "gpt-6-luna", reasoningEffort: "none" }],
    [{ model: "gpt-6-sol", reasoningEffort: "medium" }],
  ] as [TextModelSettings][])("pins the gpt-6 shape for %j", async (settings) => {
    const body = await sendOnce(settings);
    expect(body).not.toHaveProperty("temperature");
    expect(body.reasoning_effort).toBe(settings.reasoningEffort);
    expect(body.prompt_cache_options).toEqual({ mode: "explicit" });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("verbosity");
    const format = body.response_format as { type: string; json_schema: { strict: boolean } };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
  });

  it("passes verbosity through when set", async () => {
    const body = await sendOnce({ model: "gpt-6-luna", reasoningEffort: "low", verbosity: "low" });
    expect(body.verbosity).toBe("low");
  });

  it("refuses settings outside the pinned families", () => {
    expect(() => modelFamily("o4-mini")).toThrow(/Unsupported text model/);
    expect(() =>
      createChatModel({
        role: "beat",
        settings: { model: "gpt-6-luna", reasoningEffort: "low", temperature: 0.2 },
        maxRetries: 0,
        timeoutMs: 1_000,
      })
    ).toThrow(/takes no temperature/);
  });
});

describe("createChatModel retries", () => {
  it("retries a 500 once and logs the retry", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { fetch, bodies } = fakeFetch([500, 200]);
      const model = createChatModel({
        role: "switchAnalysis",
        settings: { model: "gpt-4.1-mini", temperature: 0.2 },
        maxRetries: 1,
        timeoutMs: 5_000,
        configuration: { fetch },
      });
      await expect(model.withStructuredOutput(schema).invoke("x")).resolves.toEqual({
        answer: "yes",
      });
      expect(bodies).toHaveLength(2);
      const retryLines = warn.mock.calls.filter((call) => String(call[0]).includes("retry"));
      expect(retryLines).toHaveLength(1);
      expect(String(retryLines[0][0])).toContain('"role":"switchAnalysis"');
    } finally {
      warn.mockRestore();
    }
  }, 20_000);

  it("does not retry a 400", async () => {
    const { fetch, bodies } = fakeFetch([400, 200]);
    const model = createChatModel({
      role: "beat",
      settings: { model: "gpt-4.1-mini", temperature: 0.2 },
      maxRetries: 2,
      timeoutMs: 5_000,
      configuration: { fetch },
    });
    await expect(model.withStructuredOutput(schema).invoke("x")).rejects.toBeDefined();
    expect(bodies).toHaveLength(1);
  });
});
