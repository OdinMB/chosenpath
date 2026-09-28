import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { GameModes } from "core/types/index.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { EVAL_TIMEOUT_MS, callOptionsFor, executeCall, type FetchFn } from "../../../../src/evals/textModelEval/executor.js";
import { MESSAGE_SEPARATOR, requestFor } from "../../../../src/evals/textModelEval/variants.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { BASELINE, LUNA, record } from "./fixtures.js";

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

  it("stores the reply text so it reads back whitespace and all, beside the parsed output", async () => {
    const content = '{"answer":\n\n        "yes"}';
    const result = await executeCall(
      { callId: "call-padded", role: "beat", arm: LUNA, request: { prompt: "write", schema: z.object({ answer: z.string() }) } },
      { outDir, now: () => 0, fetch: replyWith(content) }
    );
    const files = evalFiles(outDir);
    const stored = record({ outputFile: result.outputFile });
    expect(files.loadOutput(stored)).toEqual({ answer: "yes" });
    expect(files.loadReplyContent(stored)).toBe(content);
    expect(files.loadReplyContent(record({ outputFile: undefined }))).toBeUndefined();
  });

  it("stores a reply written in another order as the fields saved today, when its request assembles it", async () => {
    const assemble = (reply: unknown) => {
      const { later, ...rest } = reply as { later: { answer: string } };
      return { ...rest, ...later, assembled: true };
    };
    const schema = z.object({ first: z.string(), later: z.object({ answer: z.string() }) });
    const result = await executeCall(
      { callId: "call-assembled", role: "setup", arm: LUNA, request: { prompt: "write", schema, assemble } },
      { outDir, now: () => 0, fetch: replyWith('{"first":"a","later":{"answer":"yes"}}') }
    );
    expect(result.check).toMatchObject({ outcome: "valid", parsed: { first: "a", answer: "yes", assembled: true } });
    // Every reader loads the saved fields; the reply as written stays in the raw body
    expect(evalFiles(outDir).loadOutput(record({ outputFile: result.outputFile }))).toEqual({ first: "a", answer: "yes", assembled: true });
    expect(evalFiles(outDir).loadReplyContent(record({ outputFile: result.outputFile }))).toBe('{"first":"a","later":{"answer":"yes"}}');
    // A reply that does not parse has nothing to assemble
    const broken = await executeCall(
      { callId: "call-assembled-broken", role: "setup", arm: LUNA, request: { prompt: "write", schema, assemble } },
      { outDir, now: () => 0, fetch: replyWith('{"first":"a"}') }
    );
    expect(broken.check).toMatchObject({ outcome: "schema-mismatch" });
    expect(broken.check.parsed).toBeUndefined();
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

    it("sends a request's own output cap where it carries production's limits, and none otherwise (the eval caps nothing)", async () => {
      const limited = await sent(LUNA, { ...split, limits: { timeoutMs: 90_000, maxCompletionTokens: 12_000 } });
      expect((limited.body as unknown as Record<string, unknown>).max_completion_tokens).toBe(12_000);
      const plain = await sent(LUNA, split);
      expect(JSON.stringify(plain.body)).not.toContain("max_completion_tokens");
    });
  });

  it("sends production's own code (the adopted variant) with production's limits for the role and player count, as production does", () => {
    const beat = (players: number) => requestFor("adopted", { role: "beat", story: players > 1 ? threadBeat(players) : threadBeat(1) });
    expect(callOptionsFor(beat(1))).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
    expect(callOptionsFor(beat(3))).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 16_000 });
    expect(callOptionsFor(requestFor("adopted", { role: "thread", story: threadBeat(1) }))).toEqual({ timeoutMs: 30_000, maxCompletionTokens: 4_000 });
    const setup = requestFor("adopted", { role: "setup", setup: { premise: "A goblin union", playerCount: 2, gameMode: GameModes.Cooperative, maxTurns: 20 } });
    expect(callOptionsFor(setup)).toEqual({ timeoutMs: 120_000, maxCompletionTokens: 20_000 });
    // B9 on production's form carries the same turn limits, so the gate compares the two request shapes alone
    expect(callOptionsFor(requestFor("adoptedSplit", { role: "beat", story: threadBeat(1) }))).toEqual(callOptionsFor(beat(1)));
    // Today's frozen form (prod) keeps the eval's 300 s and no cap, as every stored reference ran
    expect(callOptionsFor(requestFor("prod", { role: "beat", story: threadBeat(1) }))).toEqual({ timeoutMs: EVAL_TIMEOUT_MS });
  });

  it("sends the template editor's AI Draft (adoptedTemplate) with the template editor's limits, and covers setup only", () => {
    const input = { role: "setup" as const, setup: { premise: "A goblin union", playerCount: 2 as const, gameMode: GameModes.Competitive, maxTurns: 20 } };
    expect(callOptionsFor(requestFor("adoptedTemplate", input))).toEqual({ timeoutMs: 240_000, maxCompletionTokens: 20_000 });
    expect(() => requestFor("adoptedTemplate", { role: "beat", story: threadBeat(1) })).toThrow(/adoptedTemplate/);
  });

  it("waits a request's own timeout where it carries production's limits, else the eval's 300 s", () => {
    const schema = z.object({ answer: z.string() });
    expect(callOptionsFor({ prompt: "write", schema })).toEqual({ timeoutMs: EVAL_TIMEOUT_MS });
    expect(callOptionsFor({ fixed: "f", perCall: "p", schema, limits: { timeoutMs: 90_000, maxCompletionTokens: 12_000 } })).toEqual({
      timeoutMs: 90_000,
      maxCompletionTokens: 12_000,
    });
  });
});
