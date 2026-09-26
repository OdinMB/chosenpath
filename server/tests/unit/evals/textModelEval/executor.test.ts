import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { executeCall, type FetchFn } from "../../../../src/evals/textModelEval/executor.js";
import { LUNA } from "./fixtures.js";

function replyWith(content: string): FetchFn {
  return async () =>
    new Response(
      JSON.stringify({
        id: "c",
        object: "chat.completion",
        created: 0,
        model: "gpt-6-luna",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content, refusal: null } }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
      }),
      { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-1", "openai-processing-ms": "1234" } }
    );
}

describe("executeCall", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "text-eval-"));
  afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

  it("keeps the raw reply when LangChain cannot parse it (text after the JSON)", async () => {
    let t = 0;
    const result = await executeCall(
      { callId: "call-1", role: "beat", arm: LUNA, request: { prompt: "write", schema: z.object({ answer: z.string() }) } },
      { outDir, now: () => (t += 500), fetch: replyWith('{"answer":"yes"} and some extra words') }
    );
    expect(result.check).toMatchObject({ outcome: "repaired", parsed: { answer: "yes" } });
    expect(result.capture).toMatchObject({ status: 200, requestId: "req-1", processingMs: 1234 });
    expect(result.metrics).toMatchObject({ inputTokens: 50, outputTokens: 20 });
    expect(result.latencyMs).toBe(500);
    const stored = JSON.parse(fs.readFileSync(path.join(outDir, result.outputFile), "utf-8"));
    expect(stored.rawBody).toContain("and some extra words");
    expect(fs.readFileSync(path.join(outDir, "prompts", `${result.promptHash}.txt`), "utf-8")).toBe("write");
  });
});
