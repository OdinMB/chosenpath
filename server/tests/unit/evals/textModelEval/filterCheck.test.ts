import { jest } from "@jest/globals";
import type { ContentClassifier, ContentFilterVerdict } from "../../../../src/game/services/ContentFilterService.js";
import { contentFilterClassifier } from "../../../../src/game/services/ContentFilterService.js";
import { armSettings } from "../../../../src/evals/textModelEval/arms.js";
import { budgetCheck, resolveCaps, spentByStage } from "../../../../src/evals/textModelEval/budget.js";
import type { FetchFn } from "../../../../src/evals/textModelEval/executor.js";
import { FILTER_CASES, type FilterCase } from "../../../../src/evals/textModelEval/filterCases.js";
import {
  checkCase,
  DEFAULT_FILTER_ARMS,
  FILTER_ARMS,
  filterCheckEstimateUsd,
  filterSpendUsd,
  recordingFetch,
  renderFilterReport,
  runFilterCheck,
  scoreFilterCheck,
  type FilterAttempt,
  type FilterRecord,
} from "../../../../src/evals/textModelEval/filterCheck.js";
import { costFromUsage } from "../../../../src/evals/textModelEval/pricing.js";
import { productionCallLimits } from "../../../../src/shared/llm/chatModel.js";

const [MINI, LUNA_LOW, LUNA_MEDIUM] = FILTER_ARMS;

beforeEach(() => {
  // The filter logs every prompt and verdict
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function completionResponse(verdict: ContentFilterVerdict, usage = { prompt_tokens: 900, completion_tokens: 300, reasoning: 240 }) {
  const body = {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "gpt-6-luna",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(verdict), refusal: null } }],
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.prompt_tokens + usage.completion_tokens,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: usage.reasoning },
    },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

const REFUSE: ContentFilterVerdict = { isAppropriate: false, reason: "rule 1" };
const ALLOW: ContentFilterVerdict = { isAppropriate: true, reason: "" };

const premise = (id: string, expect: FilterCase["expect"], group: FilterCase["group"] = "allowed"): FilterCase => ({
  id,
  kind: "premise",
  group,
  expect,
  kids: false,
  text: `premise ${id}`,
  note: "",
});

const record = (caseId: string, armKey: string, verdict: FilterRecord["verdict"], extra: Partial<FilterRecord> = {}): FilterRecord => ({
  at: "2026-09-27T00:00:00.000Z",
  caseId,
  armKey,
  model: armKey.split("@")[0],
  verdict,
  latencyMs: 1_000,
  attempts: [],
  costUsd: 0.001,
  ...extra,
});

describe("the filter test set", () => {
  const refusals = (group: FilterCase["group"]) => FILTER_CASES.filter((c) => c.group === group && c.expect === "refuse");

  it("covers each Art. 5 rule, the older rules and kids mode on both sides", () => {
    expect(new Set(FILTER_CASES.map((c) => c.id)).size).toBe(FILTER_CASES.length);
    for (const group of ["rule1-minors", "rule2-real-people", "rule3-undressing", "older-rules"] as const) {
      expect(refusals(group).length).toBeGreaterThanOrEqual(3);
    }
    expect(FILTER_CASES.filter((c) => c.expect === "allow").length).toBeGreaterThanOrEqual(8);
    expect(FILTER_CASES.filter((c) => c.kids && c.expect === "refuse").length).toBeGreaterThanOrEqual(2);
    expect(FILTER_CASES.filter((c) => c.kids && c.expect === "allow").length).toBeGreaterThanOrEqual(2);
    // Image requests on both sides, some with reference images
    const images = FILTER_CASES.filter((c) => c.kind === "image");
    expect(images.every((c) => c.referenceImages !== undefined)).toBe(true);
    expect(images.some((c) => c.expect === "allow") && images.some((c) => c.expect === "refuse")).toBe(true);
    expect(images.some((c) => (c.referenceImages ?? 0) > 0 && c.expect === "refuse")).toBe(true);
  });

  it("sends kids premises as the setup page merges them", () => {
    for (const kidsCase of FILTER_CASES.filter((c) => c.kids)) {
      expect(kidsCase.kind).toBe("premise");
      expect(kidsCase.text).toMatch(/^Create an age-appropriate story/);
    }
  });
});

describe("recordingFetch", () => {
  it("records every response's usage and the request's cap and effort, retries included", async () => {
    const attempts: FilterAttempt[] = [];
    const statuses = [500, 200];
    const inner: FetchFn = async () =>
      statuses.shift() === 500
        ? new Response(JSON.stringify({ error: { message: "fail", type: "server_error", code: null } }), { status: 500, headers: { "content-type": "application/json" } })
        : completionResponse(REFUSE);
    const classify = contentFilterClassifier(armSettings(LUNA_LOW), { configuration: { fetch: recordingFetch(inner, attempts) } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(classify("prompt")).resolves.toEqual(REFUSE);

    warn.mockRestore();
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ status: 500, outputTokens: 0 });
    expect(attempts[1]).toMatchObject({
      status: 200,
      inputTokens: 900,
      outputTokens: 300,
      reasoningTokens: 240,
      finishReason: "stop",
      sentEffort: "low",
      sentCap: productionCallLimits("contentFilter", 1).maxCompletionTokens,
    });
  }, 20_000);
});

describe("checkCase", () => {
  it("runs a case through the production filter and prices every attempt", async () => {
    const fetch: FetchFn = async () => completionResponse(REFUSE);
    let clock = 0;
    const result = await checkCase(FILTER_CASES.find((c) => c.id === "r1-teen-erotic") as FilterCase, LUNA_LOW, {
      classifierFor: (arm, recording) => contentFilterClassifier(armSettings(arm), { configuration: { fetch: recording } }),
      fetch,
      now: () => (clock += 1_500),
    });
    expect(result).toMatchObject({ caseId: "r1-teen-erotic", armKey: LUNA_LOW.key, model: "gpt-6-luna", verdict: "refused", reason: "rule 1", latencyMs: 1_500 });
    expect(result.attempts).toHaveLength(1);
    expect(result.costUsd).toBeCloseTo(costFromUsage("gpt-6-luna", { inputTokens: 900, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 300 }));
  });

  it("sends an image case through the image-request filter with its reference count", async () => {
    const prompts: string[] = [];
    const classify: ContentClassifier = async (prompt) => (prompts.push(prompt), ALLOW);
    const imageCase = FILTER_CASES.find((c) => c.id === "r3-image-remove-clothes") as FilterCase;
    const result = await checkCase(imageCase, MINI, { classifierFor: () => classify, fetch: async () => completionResponse(ALLOW), now: () => 0 });
    expect(result.verdict).toBe("allowed");
    expect(prompts[0]).toContain(imageCase.text);
    expect(prompts[0]).toContain("1 reference image(s)");
  });

  it("reads a filter that could not answer as unavailable, not as a verdict", async () => {
    const classify: ContentClassifier = async () => {
      throw new Error("timeout");
    };
    const result = await checkCase(premise("p", "refuse"), LUNA_LOW, { classifierFor: () => classify, fetch: async () => completionResponse(ALLOW), now: () => 0 });
    expect(result.verdict).toBe("unavailable");
    expect(result.error).toMatch(/unavailable/);
  });
});

describe("runFilterCheck", () => {
  const cases = [premise("a", "allow"), premise("b", "refuse", "rule1-minors")];

  it("interleaves the arms per case, skips answered pairs and re-asks unavailable ones", async () => {
    const asked: string[] = [];
    const recorded: FilterRecord[] = [];
    const { records, stoppedReason } = await runFilterCheck({
      cases,
      arms: [MINI, LUNA_LOW],
      previous: [record("a", MINI.key, "allowed"), record("a", LUNA_LOW.key, "unavailable")],
      deps: {
        classifierFor: (arm) => async (prompt) => (asked.push(`${arm.key}:${prompt.includes("premise b") ? "b" : "a"}`), REFUSE),
        fetch: async () => completionResponse(REFUSE),
        now: () => 0,
        record: (r) => recorded.push(r),
        budget: () => ({ ok: true }),
        log: () => undefined,
      },
    });
    expect(stoppedReason).toBeUndefined();
    expect(asked).toEqual([`${LUNA_LOW.key}:a`, `${MINI.key}:b`, `${LUNA_LOW.key}:b`]);
    expect(records).toEqual(recorded);
    expect(records.map((r) => [r.caseId, r.armKey, r.verdict])).toEqual([
      ["a", LUNA_LOW.key, "refused"],
      ["b", MINI.key, "refused"],
      ["b", LUNA_LOW.key, "refused"],
    ]);
  });

  it("stops before a case the budget refuses, passing what this run spent", async () => {
    const spentSeen: number[] = [];
    const { records, stoppedReason } = await runFilterCheck({
      cases,
      arms: [LUNA_LOW],
      previous: [],
      deps: {
        classifierFor: (arm, fetch) => contentFilterClassifier(armSettings(arm), { configuration: { fetch } }),
        fetch: async () => completionResponse(ALLOW),
        now: () => 0,
        record: () => undefined,
        budget: (_estimate, invocationSpent) => (spentSeen.push(invocationSpent), spentSeen.length > 1 ? { ok: false, reason: "cap" } : { ok: true }),
        log: () => undefined,
      },
    });
    expect(records).toHaveLength(1);
    expect(stoppedReason).toBe("cap");
    expect(spentSeen[0]).toBe(0);
    expect(spentSeen[1]).toBeCloseTo(records[0].costUsd);
  });
});

describe("scoreFilterCheck", () => {
  const cases = [
    premise("allow-1", "allow"),
    premise("allow-2", "allow"),
    premise("refuse-1", "refuse", "rule1-minors"),
    premise("refuse-2", "refuse", "rule3-undressing"),
    premise("border-1", "either", "borderline"),
  ];

  it("passes an arm only when it refuses every must-refuse case and allows every clearly allowed one", () => {
    const records = [
      ...["allow-1", "allow-2"].map((id) => record(id, LUNA_LOW.key, "allowed")),
      ...["refuse-1", "refuse-2", "border-1"].map((id) => record(id, LUNA_LOW.key, "refused")),
      record("allow-1", MINI.key, "allowed"),
      record("allow-2", MINI.key, "refused"),
      record("refuse-1", MINI.key, "allowed"),
      record("refuse-2", MINI.key, "unavailable"),
      // A later answer replaces an earlier one for the same case and arm
      record("border-1", MINI.key, "refused"),
      record("border-1", MINI.key, "allowed", { at: "2026-09-27T01:00:00.000Z" }),
    ];
    const [luna, mini, medium] = scoreFilterCheck(records, cases, [LUNA_LOW.key, MINI.key, LUNA_MEDIUM.key]);

    expect(luna).toMatchObject({ armKey: LUNA_LOW.key, passes: true, missedRefusals: [], refusedAllowed: [], unavailable: [], missing: [] });
    expect(luna.borderline).toEqual([{ caseId: "border-1", verdict: "refused" }]);

    expect(mini).toMatchObject({ passes: false, missedRefusals: ["refuse-1"], refusedAllowed: ["allow-2"], unavailable: ["refuse-2"] });
    expect(mini.borderline).toEqual([{ caseId: "border-1", verdict: "allowed" }]);

    expect(medium).toMatchObject({ passes: false, missing: cases.map((c) => c.id) });
  });

  it("reads waits and output tokens from the latest answers, and spend from every record", () => {
    const attempt = (outputTokens: number, finishReason = "stop"): FilterAttempt => ({ status: 200, inputTokens: 900, cachedTokens: 0, cacheWriteTokens: 0, outputTokens, reasoningTokens: outputTokens - 60, finishReason });
    const records = [
      record("allow-1", LUNA_LOW.key, "unavailable", { costUsd: 0.002, latencyMs: 20_000 }),
      record("allow-1", LUNA_LOW.key, "allowed", { at: "2026-09-27T01:00:00.000Z", latencyMs: 2_000, attempts: [attempt(400)] }),
      record("allow-2", LUNA_LOW.key, "allowed", { latencyMs: 4_000, attempts: [attempt(900), attempt(4_000, "length")] }),
    ];
    const [score] = scoreFilterCheck(records, cases.slice(0, 2), [LUNA_LOW.key]);
    expect(score.latencyMs).toEqual({ p50: 2_000, p95: 4_000, max: 4_000 });
    expect(score.outputTokens).toEqual({ p50: 900, max: 4_000 });
    expect(score.reasoningMax).toBe(3_940);
    expect(score.cappedReplies).toBe(1);
    expect(score.costUsd).toBeCloseTo(0.004);
    expect(filterSpendUsd(records)).toBeCloseTo(0.004);
  });

  it("renders a report with each arm's reading and every case's verdicts", () => {
    const records = cases.map((c) => record(c.id, LUNA_LOW.key, c.expect === "refuse" ? "refused" : "allowed", { reason: c.expect === "refuse" ? "rule" : "" }));
    const scores = scoreFilterCheck(records, cases, [LUNA_LOW.key]);
    const report = renderFilterReport(scores, records, cases, new Date("2026-09-27T12:00:00Z"));
    expect(report).toContain(LUNA_LOW.key);
    expect(report).toMatch(/passes/);
    for (const c of cases) expect(report).toContain(c.id);
  });
});

describe("the filter check's budget", () => {
  it("prices a GPT-6 case at its output cap, and the default arms well inside the $0.30 cap", () => {
    const one = [premise("p", "allow")];
    const luna = filterCheckEstimateUsd(one, [LUNA_LOW.key]);
    expect(luna).toBeGreaterThan((productionCallLimits("contentFilter", 1).maxCompletionTokens * 0.5) / 1_000_000);
    expect(filterCheckEstimateUsd(FILTER_CASES, DEFAULT_FILTER_ARMS)).toBeLessThan(0.3);
    expect(DEFAULT_FILTER_ARMS).toEqual([MINI.key, LUNA_LOW.key]);
  });

  it("is its own ledger stage, capped at $0.30 and counted in the global total", () => {
    const { caps } = resolveCaps({});
    expect(caps.stageCaps.filter).toBe(0.3);
    const spend = spentByStage([{ stage: "4", costUsd: 5 }, { stage: "filter", costUsd: 0.28 }]);
    expect(spend.total).toBeCloseTo(5.28);
    expect(budgetCheck(caps, spend, 0, "filter", 0.01)).toEqual({ ok: true });
    expect(budgetCheck(caps, spend, 0, "filter", 0.05)).toMatchObject({ ok: false, reason: expect.stringMatching(/Stage filter cap/) });
  });
});
