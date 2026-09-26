import type OpenAI from "openai";
import { probeChecks, runProbe } from "../../../../src/evals/textModelEval/probe.js";
import type { ExecutedCall } from "../../../../src/evals/textModelEval/executor.js";

function developerText(body: Record<string, unknown>): string {
  const messages = body.messages as { role: string; content: unknown }[];
  const developer = messages.find((m) => m.role === "developer");
  if (!developer) return "";
  return typeof developer.content === "string"
    ? developer.content
    : (developer.content as { text: string }[]).map((part) => part.text).join("");
}

describe("probeChecks", () => {
  it("checks a strict schema at every effort on both models", () => {
    const ids = probeChecks().map((c) => `${c.model} ${c.id}`);
    for (const model of ["gpt-6-sol", "gpt-6-luna"]) {
      for (const effort of ["none", "low", "medium", "high"]) {
        expect(ids).toContain(`${model} strict-small-${effort}`);
      }
    }
  });

  it("sends every schema variant at all efforts on Luna and once on Sol", () => {
    const schemaChecks = probeChecks().filter((c) => c.id.startsWith("schema-"));
    const luna = schemaChecks.filter((c) => c.model === "gpt-6-luna");
    const sol = schemaChecks.filter((c) => c.model === "gpt-6-sol");
    expect(luna.length).toBe(sol.length * 4);
    expect(new Set(sol.map((c) => c.body.reasoning_effort))).toEqual(new Set(["low"]));
    // Luna before Sol, so a spend cap skips the dearer tail
    expect(schemaChecks.findIndex((c) => c.model === "gpt-6-sol")).toBe(luna.length);
  });

  it("sends the factory's gpt-6 shape for schema checks: no temperature, caching explicit", () => {
    const check = probeChecks().find((c) => c.id === "schema-thread-high" && c.model === "gpt-6-luna");
    // What goes on the wire: JSON drops keys whose value is undefined
    const wire = JSON.parse(JSON.stringify(check?.body)) as Record<string, unknown>;
    expect(wire).toMatchObject({ reasoning_effort: "high", prompt_cache_options: { mode: "explicit" } });
    expect(wire).not.toHaveProperty("temperature");
    expect(wire).not.toHaveProperty("max_tokens");
  });

  it("gives each cache check its own prefix, and a new one per run", () => {
    const cacheIds = ["cache-explicit", "cache-implicit", "cache-breakpoint"];
    const firstLines = (nonce: string) =>
      probeChecks(nonce)
        .filter((c) => cacheIds.includes(c.id))
        .map((c) => developerText(c.body).split("\n")[0]);
    const run1 = firstLines("run-1");
    expect(new Set(run1).size).toBe(run1.length);
    expect(run1.length).toBe(6);
    const run2 = firstLines("run-2");
    expect(run2.some((line) => run1.includes(line))).toBe(false);
  });
});

describe("runProbe", () => {
  it("skips checks that would pass the cap and still runs the reserved full completions", async () => {
    const posted: string[] = [];
    const client = {
      post: async (_path: string, options: { body: Record<string, unknown> }) => {
        posted.push(String(options.body.model));
        return { model: options.body.model, choices: [{ finish_reason: "length", message: { content: "" } }], usage: { prompt_tokens: 100, completion_tokens: 64 } };
      },
    } as unknown as OpenAI;
    const full: string[] = [];
    const report = await runProbe(client, {
      maxSpendUsd: 0.1,
      log: () => undefined,
      nonce: "test",
      executeCall: async (spec) => {
        full.push(spec.arm.key);
        return {
          check: { outcome: "valid" },
          metrics: { inputTokens: 100, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 500, reasoningTokens: 400, refusal: false },
        } as unknown as ExecutedCall;
      },
    });
    expect(report.results.some((r) => r.outcome === "skipped")).toBe(true);
    expect(full).toEqual(["gpt-6-sol@medium/prod", "gpt-6-luna@medium/prod", "gpt-6-luna@high/prod"]);
    expect(report.totalCostUsd).toBeLessThanOrEqual(0.1);
    expect(posted.length).toBeGreaterThan(0);
  });
});
