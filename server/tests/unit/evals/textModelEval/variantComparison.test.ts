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
  it("pairs a trimmed arm with its prod sibling in the same group and prompt state", () => {
    const records = [
      call(MEDIUM_MINIMAL, "a", 1),
      call(MEDIUM_PROD, "a", 1),
      call(MEDIUM_PROD, "a", 1, { promptState: "prefix", jobKey: "a|prod|prefix|s1" }),
      call(MEDIUM_PROD, "a", 1, { group: "switch", jobKey: "a|prod|switch|s1" }),
    ];
    const [comparison, ...rest] = variantComparisons(records, new Map(), caseTags("a"), "postfix");
    expect(rest).toHaveLength(0);
    expect(comparison).toMatchObject({ group: "beat", trimmedKey: MEDIUM_MINIMAL, fullKey: MEDIUM_PROD, pairs: 1 });
    expect(comparison.full.calls).toBe(1);
  });

  it("reads the full arm only on the trimmed arm's (case, sample) pairs", () => {
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
    expect(comparison.full.calls).toBe(2);
    expect(comparison.full.validity).toMatchObject({ calls: 2, firstAttemptValid: 1 });
    expect(comparison.full.medianTokens.output).toBe(1_000);
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
    expect(comparison.fullKey).toBe("pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod");
    expect(comparison.full.turnLatencies).toEqual([40]);
    expect(comparison.trimmed.turnLatencies).toEqual([30]);
  });

  it("flags a check beyond the full form's noise floor, and not one inside it", () => {
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
    expect(comparison.counts).toEqual([{ name: "facts", full: 3, trimmed: 1, noise: 2 }]);
  });

  it("lists no flags when only one sample is matched", () => {
    const trimmed = call(MEDIUM_MINIMAL, "a", 1, { group: "setup" });
    const full = [call(MEDIUM_PROD, "a", 1, { group: "setup" }), call(MEDIUM_PROD, "a", 2, { group: "setup" })];
    const checks = checked([
      [trimmed, { playerStats: false }, { storyElements: 5 }],
      [full[0], { playerStats: true }, { storyElements: 8 }],
      [full[1], { playerStats: true }, { storyElements: 8 }],
    ]);
    const [comparison] = variantComparisons([trimmed, ...full], checks, caseTags("a"), "postfix");
    expect(comparison.hasNoise).toBe(false);
    expect(comparison.checks).toEqual([{ name: "playerStats", full: 1, trimmed: 0 }]);
    expect(comparison.counts).toEqual([{ name: "storyElements", full: 8, trimmed: 5 }]);
  });

  it("finds nothing in a prompt state without trimmed arms", () => {
    expect(variantComparisons([call(MEDIUM_PROD, "a", 1)], new Map(), caseTags("a"), "postfix")).toEqual([]);
  });
});
