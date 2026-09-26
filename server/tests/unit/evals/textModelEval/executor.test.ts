import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { executeCall, type FetchFn } from "../../../../src/evals/textModelEval/executor.js";
import { MESSAGE_SEPARATOR } from "../../../../src/evals/textModelEval/variants.js";
import { BASELINE, LUNA } from "./fixtures.js";

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

  describe("the request body, by request shape and model family", () => {
    type Body = { messages: { role: string; content: unknown }[] };
    const schema = z.object({ answer: z.string() });
    const split = { fixed: "The fixed rules.", perCall: "This call's facts.", schema };

    /** Sends the request and returns the JSON body the API would have received. */
    async function sent(arm: typeof LUNA, request: Parameters<typeof executeCall>[0]["request"]) {
      const bodies: Body[] = [];
      const fetch: FetchFn = async (input, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return replyWith('{"answer":"yes"}')(input, init);
      };
      const result = await executeCall({ callId: `call-${bodies.length}`, role: "beat", arm, request }, { outDir, now: () => 0, fetch });
      expect(result.check.outcome).toBe("valid");
      return { body: bodies[0], result };
    }

    it("sends a split request to gpt-6 as a developer message with an explicit cache breakpoint, then the user message", async () => {
      const { body } = await sent(LUNA, split);
      expect(body.messages).toEqual([
        { role: "developer", content: [{ type: "text", text: "The fixed rules.", prompt_cache_breakpoint: { mode: "explicit" } }] },
        { role: "user", content: "This call's facts." },
      ]);
    });

    it("sends a split request to gpt-4.1-mini as system and user strings, with no breakpoint anywhere", async () => {
      const { body } = await sent(BASELINE, split);
      expect(body.messages).toEqual([
        { role: "system", content: "The fixed rules." },
        { role: "user", content: "This call's facts." },
      ]);
      expect(JSON.stringify(body)).not.toContain("prompt_cache_breakpoint");
    });

    it("stores a split request's prompt as both parts around the separator", async () => {
      const { result } = await sent(LUNA, split);
      const stored = fs.readFileSync(path.join(outDir, "prompts", `${result.promptHash}.txt`), "utf-8");
      expect(stored).toBe(`The fixed rules.${MESSAGE_SEPARATOR}This call's facts.`);
    });

    it("still sends a plain request as one user message", async () => {
      const { body } = await sent(LUNA, { prompt: "write", schema });
      expect(body.messages).toEqual([{ role: "user", content: "write" }]);
    });
  });
});
