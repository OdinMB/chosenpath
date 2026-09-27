import type { CaseTags } from "../../../../src/evals/textModelEval/cases.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import type { CheckResult } from "../../../../src/evals/textModelEval/textChecks.js";
import { variantComparisons } from "../../../../src/evals/textModelEval/variantComparison.js";
import { record, tags } from "./fixtures.js";

const MEDIUM_MINIMAL = "gpt-6-luna@medium/minimal";
const MEDIUM_PROD = "gpt-6-luna@medium/prod";

/** One job-final call of an arm on a case and sample, with its output file named after all three. */
function call(armKey: string, caseId: string, sample: number, overrides: Partial<CallRecord> = {}): CallRecord {
  return record({
    jobKey: `${caseId}|${armKey}|postfix|s${sample}`,
    promptState: "postfix",
    group: "beat",
    armKey,
    callArmKey: armKey,
    model: "gpt-6-luna",
    baseline: false,
    caseId,
    sample,
    outputFile: `${armKey}|${caseId}|${sample}`,
    ...overrides,
  });
}

const caseTags = (...ids: string[]) => new Map<string, CaseTags>(ids.map((id) => [id, tags()]));

function checked(entries: [CallRecord, Record<string, boolean>, Record<string, number>?][]): Map<string, CheckResult> {
  return new Map(entries.map(([r, checks, counts]) => [r.outputFile ?? "", { checks, counts: counts ?? {}, unknownIds: [] }]));
}

describe("variantComparisons", () => {
  it("pairs a trimmed arm with its prod reference in the same group and prompt state", () => {
    const records = [
      call(MEDIUM_MINIMAL, "a", 1),
      call(MEDIUM_PROD, "a", 1),
      call(MEDIUM_PROD, "a", 1, { promptState: "prefix", jobKey: "a|prod|prefix|s1" }),
      call(MEDIUM_PROD, "a", 1, { group: "switch", jobKey: "a|prod|switch|s1" }),
    ];
    const [comparison, ...rest] = variantComparisons(records, new Map(), caseTags("a"), "postfix");
    expect(rest).toHaveLength(0);
    expect(comparison).toMatchObject({ group: "beat", armKey: MEDIUM_MINIMAL, referenceKey: MEDIUM_PROD, pairs: 1 });
    expect(comparison.reference.calls).toBe(1);
  });

  it("pairs each Stage 4 arm with its reference arm", () => {
    const keys = ["gpt-6-luna@medium/slim", "gpt-6-luna@medium/rewriteSlim", "gpt-6-luna@medium+vlow/rewriteSlim"];
    const comparisons = variantComparisons(keys.map((key) => call(key, "a", 1)), new Map(), caseTags("a"), "postfix");
    expect(comparisons.map((c) => [c.armKey, c.referenceKey]).sort()).toEqual([
      ["gpt-6-luna@medium+vlow/rewriteSlim", "gpt-6-luna@medium/rewriteSlim"],
      ["gpt-6-luna@medium/rewriteSlim", "gpt-6-luna@medium/slim"],
    ]);
  });

  it("reads the baseline's records as a reference, and never the baseline as a candidate", () => {
    const today = "gpt-4.1-mini@t0.2/prod";
    const records = [
      call(today, "a", 1, { model: "gpt-4.1-mini", baseline: true }),
      call("gpt-4.1-mini@t0.2/rewrite", "a", 1, { model: "gpt-4.1-mini" }),
    ];
    const comparisons = variantComparisons(records, new Map(), caseTags("a"), "postfix");
    expect(comparisons.map((c) => [c.armKey, c.referenceKey])).toEqual([["gpt-4.1-mini@t0.2/rewrite", today]]);
    expect(comparisons[0].reference.baseline).toBe(true);
  });

  it("reads the reference arm only on the arm's (case, sample) pairs", () => {
    const records = [
      call(MEDIUM_MINIMAL, "a", 1, { outputTokens: 500 }),
      call(MEDIUM_MINIMAL, "b", 1, { outputTokens: 500 }),
      call(MEDIUM_PROD, "a", 1, { outputTokens: 1_000 }),
      // A paired call's re-sent first attempt counts too
      call(MEDIUM_PROD, "b", 1, { attempt: 1, final: false, jobFinal: false, outcome: "invalid-json", outputTokens: 0 }),
      call(MEDIUM_PROD, "b", 1, { attempt: 2, outputTokens: 1_000 }),
      // Another case, another sample and a rare-failure sample: not paired
      call(MEDIUM_PROD, "c", 1, { outputTokens: 9_000 }),
      call(MEDIUM_PROD, "a", 2, { outputTokens: 9_000 }),
      call(MEDIUM_PROD, "a", 3, { outputTokens: 9_000 }),
    ];
    const [comparison] = variantComparisons(records, new Map(), caseTags("a", "b", "c"), "postfix");
    expect(comparison.pairs).toBe(2);
    expect(comparison.reference.calls).toBe(2);
    expect(comparison.reference.validity).toMatchObject({ calls: 2, firstAttemptValid: 1 });
    expect(comparison.reference.medianTokens.output).toBe(1_000);
  });

  it("pairs chains on both sides and reads them by their beat step", () => {
    const chain = (analysis: string, beat: string, sample: number, turnLatencyMs: number) =>
      call(`pipeline:${analysis}>${beat}`, "s", sample, { group: "pipeline", step: 2, turnLatencyMs });
    const records = [
      chain("gpt-6-luna@low/minimal", MEDIUM_MINIMAL, 1, 30_000),
      chain("gpt-6-luna@low/prod", MEDIUM_PROD, 1, 40_000),
      call("pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod", "s", 1, { group: "pipeline", step: 1, jobKey: "step1" }),
    ];
    const [comparison] = variantComparisons(records, new Map(), caseTags("s"), "postfix");
    expect(comparison.referenceKey).toBe("pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod");
    expect(comparison.reference.turnLatencies).toEqual([40]);
    expect(comparison.arm.turnLatencies).toEqual([30]);
  });

  it("flags a check beyond the reference's noise floor, and not one inside it", () => {
    const trimmed = [1, 2].flatMap((sample) => ["a", "b"].map((c) => call(MEDIUM_MINIMAL, c, sample)));
    const full = [1, 2].flatMap((sample) => ["a", "b"].map((c) => call(MEDIUM_PROD, c, sample)));
    const [t1a, t1b, t2a, t2b] = trimmed;
    const [f1a, f1b, f2a, f2b] = full;
    const checks = checked([
      // knownIds: full 100% on both samples (noise 0); trimmed 75% -> lower
      // sentences: full 100% / 50% (75% ± 50%); trimmed 50% -> inside the floor
      // paragraphs: full 50% on both samples (noise 0); trimmed 100% -> higher
      [f1a, { knownIds: true, sentences: true, paragraphs: true }, { facts: 2 }],
      [f1b, { knownIds: true, sentences: true, paragraphs: false }, { facts: 2 }],
      [f2a, { knownIds: true, sentences: true, paragraphs: true }, { facts: 4 }],
      [f2b, { knownIds: true, sentences: false, paragraphs: false }, { facts: 4 }],
      [t1a, { knownIds: true, sentences: true, paragraphs: true }, { facts: 1 }],
      [t1b, { knownIds: true, sentences: false, paragraphs: true }, { facts: 1 }],
      [t2a, { knownIds: true, sentences: true, paragraphs: true }, { facts: 1 }],
      [t2b, { knownIds: false, sentences: false, paragraphs: true }, { facts: 1 }],
    ]);
    const [comparison] = variantComparisons([...trimmed, ...full], checks, caseTags("a", "b"), "postfix");
    const flag = (name: string) => comparison.checks.find((c) => c.name === name)?.flag;
    expect(flag("knownIds")).toBe("lower");
    expect(flag("sentences")).toBeUndefined();
    expect(flag("paragraphs")).toBe("higher");
    expect(comparison.counts).toEqual([{ name: "facts", reference: 3, arm: 1, noise: 2 }]);
  });

  it("gives a one-sample arm the noise of the reference's two samples on the matched cases, and flags beyond it", () => {
    const setup = { group: "setup" as const };
    const arm = [call("gpt-6-sol@low/rewrite", "a", 1, setup), call("gpt-6-sol@low/rewrite", "b", 1, setup)];
    const reference = [1, 2].flatMap((sample) => ["a", "b"].map((c) => call("gpt-6-sol@low/prod", c, sample, setup)));
    // A reference sample on a case the arm did not run is not part of the noise
    const unmatched = call("gpt-6-sol@low/prod", "c", 2, setup);
    const checks = checked([
      [arm[0], { playerStats: false, sharedStats: true }, { storyElements: 5 }],
      [arm[1], { playerStats: true, sharedStats: true }, { storyElements: 5 }],
      // playerStats: reference 100% on both samples (noise 0), arm 50% -> lower
      // sharedStats: reference 100% / 50% on the matched cases (noise 50%), arm 100% -> inside the floor
      [reference[0], { playerStats: true, sharedStats: true }, { storyElements: 8 }],
      [reference[1], { playerStats: true, sharedStats: true }, { storyElements: 8 }],
      [reference[2], { playerStats: true, sharedStats: true }, { storyElements: 7 }],
      [reference[3], { playerStats: true, sharedStats: false }, { storyElements: 7 }],
      [unmatched, { playerStats: false, sharedStats: false }, { storyElements: 1 }],
    ]);
    const [comparison] = variantComparisons([...arm, ...reference, unmatched], checks, caseTags("a", "b", "c"), "postfix");
    expect(comparison.pairs).toBe(2);
    expect(comparison.hasNoise).toBe(true);
    expect(comparison.checks.find((c) => c.name === "playerStats")).toEqual({ name: "playerStats", reference: 1, arm: 0.5, flag: "lower" });
    expect(comparison.checks.find((c) => c.name === "sharedStats")?.flag).toBeUndefined();
    // The reference itself is read on the matched pairs (sample 1); the noise on both samples
    expect(comparison.counts).toEqual([{ name: "storyElements", reference: 8, arm: 5, noise: 1 }]);
  });

  it("lists no flags when the reference has only one sample on the matched cases", () => {
    const trimmed = call(MEDIUM_MINIMAL, "a", 1, { group: "setup" });
    const full = call(MEDIUM_PROD, "a", 1, { group: "setup" });
    const checks = checked([
      [trimmed, { playerStats: false }, { storyElements: 5 }],
      [full, { playerStats: true }, { storyElements: 8 }],
    ]);
    const [comparison] = variantComparisons([trimmed, full], checks, caseTags("a"), "postfix");
    expect(comparison.hasNoise).toBe(false);
    expect(comparison.checks).toEqual([{ name: "playerStats", reference: 1, arm: 0 }]);
    expect(comparison.counts).toEqual([{ name: "storyElements", reference: 8, arm: 5 }]);
  });

  it("reads cache shares, writing calls, lines and input cost, billed and uncached", () => {
    const rewrite = "gpt-6-luna@medium/rewriteSlim";
    // Line A: the first call writes 40K of 100K input; the second reads 40K. Line B: one call that writes 20K.
    const records = [
      call(rewrite, "a", 1, { cacheLine: "A", inputTokens: 100_000, cachedTokens: 0, cacheWriteTokens: 40_000, outputTokens: 1_000 }),
      call(rewrite, "b", 1, { cacheLine: "A", inputTokens: 100_000, cachedTokens: 40_000, cacheWriteTokens: 0, outputTokens: 1_000 }),
      call(rewrite, "c", 1, { cacheLine: "B", inputTokens: 100_000, cachedTokens: 0, cacheWriteTokens: 20_000, outputTokens: 1_000 }),
      ...["a", "b", "c"].map((c) => call("gpt-6-luna@medium/slim", c, 1, { inputTokens: 100_000 })),
    ];
    const [comparison] = variantComparisons(records, new Map(), caseTags("a", "b", "c"), "postfix");
    expect(comparison.arm.cache).toEqual({ readShare: 40_000 / 300_000, writeShare: 60_000 / 300_000, writingCalls: 2, lines: 2 });
    expect(comparison.reference.cache).toEqual({ readShare: 0, writeShare: 0, writingCalls: 0, lines: 0 });
    // Luna per 1M: input $0.10, cached $0.01, cache write $0.125
    const billed = [60_000 * 0.1 + 40_000 * 0.125, 60_000 * 0.1 + 40_000 * 0.01, 80_000 * 0.1 + 20_000 * 0.125].map((x) => x / 1e6);
    expect(comparison.arm.inputCost.billed).toBeCloseTo(billed.reduce((a, b) => a + b) / 3, 10);
    expect(comparison.arm.inputCost.uncached).toBeCloseTo((100_000 * 0.1) / 1e6, 10);
  });

  describe("a request the API rejected, not yet re-run", () => {
    const rewrite = "gpt-4.1-mini@t0.2/rewrite";
    const today = "gpt-4.1-mini@t0.2/prod";
    const rejectedCall = (caseId: string) =>
      call(rewrite, caseId, 1, {
        model: "gpt-4.1-mini",
        outcome: "http-error",
        status: 400,
        param: "response_format",
        rejectedParam: true,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        costSource: "none",
        outputFile: undefined,
      });
    const reference = ["a", "b"].map((c) => call(today, c, 1, { model: "gpt-4.1-mini", baseline: true, outputTokens: c === "a" ? 1_000 : 9_000, costUsd: 0.02 }));

    it("is not a finished pair: the reference is read only where the arm has a reply", () => {
      const records = [call(rewrite, "a", 1, { model: "gpt-4.1-mini", costUsd: 0.02 }), rejectedCall("b"), ...reference];
      const [comparison] = variantComparisons(records, new Map(), caseTags("a", "b"), "postfix");
      expect(comparison.pairs).toBe(1);
      expect(comparison.reference.calls).toBe(1);
      expect(comparison.reference.medianTokens.output).toBe(1_000);
      // Nor a $0 call on the arm's side
      expect(comparison.arm.cost.billed.perCall).toBeCloseTo(0.02, 10);
    });

    it("gives an arm with only rejected requests no comparison", () => {
      expect(variantComparisons([rejectedCall("a"), rejectedCall("b"), ...reference], new Map(), caseTags("a", "b"), "postfix")).toEqual([]);
    });

    it("pairs again once the job was re-run", () => {
      const rerun = call(rewrite, "b", 1, { model: "gpt-4.1-mini", attempt: 2, costUsd: 0.02 });
      const records = [call(rewrite, "a", 1, { model: "gpt-4.1-mini", costUsd: 0.02 }), rejectedCall("b"), rerun, ...reference];
      const [comparison] = variantComparisons(records, new Map(), caseTags("a", "b"), "postfix");
      expect(comparison.pairs).toBe(2);
      expect(comparison.arm.calls).toBe(2);
      expect(comparison.arm.cost.billed.perCall).toBeCloseTo(0.02, 10);
    });
  });

  it("finds nothing in a prompt state without variant arms", () => {
    expect(variantComparisons([call(MEDIUM_PROD, "a", 1)], new Map(), caseTags("a"), "postfix")).toEqual([]);
  });
});

describe("variantComparisons: stored references from another prompt state", () => {
  const ROUND1 = "gpt-6-luna@low/setupR1";
  const LUNA_PROD = "gpt-6-luna@low/prod";
  const setup = { group: "setup" as const, role: "setup" as const };
  /** A setup call of an arm under a prompt state, its request hashed as the executor would */
  const inState = (promptState: string, armKey: string, caseId: string, sample: number, promptHash = `today-${caseId}`) =>
    call(armKey, caseId, sample, { ...setup, promptState, jobKey: `${caseId}|${armKey}|${promptState}|s${sample}`, promptHash, outputFile: `${promptState}|${armKey}|${caseId}|${sample}` });
  const candidate = [1, 2].flatMap((sample) => ["a", "b"].map((c) => inState("round0", ROUND1, c, sample)));
  const stored = [1, 2].flatMap((sample) => ["a", "b"].map((c) => inState("postfix", LUNA_PROD, c, sample)));
  /** Today's code builds the stored request byte for byte */
  const rebuilt = (r: CallRecord) => r.promptHash === `today-${r.caseId}`;

  it("reads a round's candidate against the stored reference that today's code rebuilds, with that reference's two-sample noise", () => {
    const [comparison, ...rest] = variantComparisons([...candidate, ...stored], new Map(), caseTags("a", "b"), "round0", rebuilt);
    expect(rest).toEqual([]);
    expect(comparison).toMatchObject({ group: "setup", armKey: ROUND1, referenceKey: LUNA_PROD, referenceState: "postfix", pairs: 4, hasNoise: true });
    expect(comparison.reference.promptState).toBe("postfix");
  });

  it("leaves out stored records whose request today's code no longer builds", () => {
    const drifted = stored.map((r) => ({ ...r, promptHash: "an older prompt" }));
    expect(variantComparisons([...candidate, ...drifted], new Map(), caseTags("a", "b"), "round0", rebuilt)).toEqual([]);
    // One case rebuilt, one not: only the rebuilt case pairs
    const mixed = stored.map((r) => (r.caseId === "b" ? { ...r, promptHash: "an older prompt" } : r));
    expect(variantComparisons([...candidate, ...mixed], new Map(), caseTags("a", "b"), "round0", rebuilt)[0].pairs).toBe(2);
  });

  it("prefers a reference in the candidate's own prompt state", () => {
    const own = [1, 2].flatMap((sample) => ["a", "b"].map((c) => inState("round0", LUNA_PROD, c, sample)));
    const [comparison] = variantComparisons([...candidate, ...stored, ...own], new Map(), caseTags("a", "b"), "round0", rebuilt);
    expect(comparison.referenceState).toBeUndefined();
    expect(comparison.reference.promptState).toBe("round0");
  });

  it("reads no other prompt state without the rebuild check", () => {
    expect(variantComparisons([...candidate, ...stored], new Map(), caseTags("a", "b"), "round0")).toEqual([]);
  });

  it("reads the design checks' pooled shares beside the checks, flagged beyond the reference's noise", () => {
    const counts = (spendable: number, visible = 4) => ({ spendablePlayerStats: spendable, visiblePlayerStats: visible });
    const [c1a, c1b, c2a, c2b] = candidate;
    const [s1a, s1b, s2a, s2b] = stored;
    const checks = checked([
      // Reference: 2/4 and 2/4 on sample 1, 2/4 and 2/4 on sample 2 (50%, noise 0); candidate 4/4 everywhere (100%) -> higher
      [s1a, {}, counts(2)],
      [s1b, {}, counts(2)],
      [s2a, {}, counts(2)],
      [s2b, {}, counts(2)],
      [c1a, {}, counts(4)],
      [c1b, {}, counts(4)],
      [c2a, {}, counts(4)],
      [c2b, {}, counts(4)],
    ]);
    const [comparison] = variantComparisons([...candidate, ...stored], checks, caseTags("a", "b"), "round0", rebuilt);
    expect(comparison.shares).toEqual([{ name: "spendableShare", reference: 0.5, arm: 1, noise: 0, flag: "higher" }]);
  });
});
