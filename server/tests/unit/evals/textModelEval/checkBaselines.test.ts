import { checkBaselines, renderCheckBaselines, type BaselineInput } from "../../../../src/evals/textModelEval/checkBaselines.js";
import type { RatingKey } from "../../../../src/evals/textModelEval/ratingSets.js";
import type { ExportedRatings } from "../../../../src/evals/textModelEval/ratingScore.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import type { CheckResult } from "../../../../src/evals/textModelEval/textChecks.js";
import { BASELINE, LUNA, evalCase, record, tags } from "./fixtures.js";

const result = (checks: Record<string, boolean>, counts: Record<string, number> = {}): CheckResult => ({ checks, counts, unknownIds: [] });

/** Setup records of an arm on cases c0..c<n-1>, samples 1 and 2 unless one, each with its own output file. */
function setupRecords(arm: typeof LUNA, cases: number, samples = [1, 2]): CallRecord[] {
  return Array.from({ length: cases }, (_, i) => i).flatMap((i) =>
    samples.map((sample) =>
      record({
        jobKey: `c${i}|${arm.key}|postfix|s${sample}`,
        promptState: "postfix",
        role: "setup",
        group: "setup",
        caseId: `c${i}`,
        armKey: arm.key,
        callArmKey: arm.key,
        model: arm.model,
        baseline: arm.baseline,
        sample,
        outputFile: `${arm.key}-c${i}-s${sample}`,
        latencyMs: 10_000 * (i + 1),
        promptHash: `hash-c${i}`,
      })
    )
  );
}

function input(overrides: Partial<BaselineInput> = {}): BaselineInput {
  const records = [...setupRecords(LUNA, 4), ...setupRecords(BASELINE, 4, [1])];
  const design = new Map<string, CheckResult>();
  for (const r of records) {
    const i = Number(r.caseId.slice(1));
    // Luna passes modeSlate on samples 1 of c0-c3 and on sample 2 of c0-c1: 100% against 50%
    const pass = r.armKey === LUNA.key ? r.sample === 1 || i < 2 : i === 0;
    design.set(r.outputFile as string, result({ modeSlate: pass }, { outcomes: 3, outcomesNamingElement: r.sample === 1 ? 3 : 0 }));
  }
  const cases = Array.from({ length: 4 }, (_, i) => evalCase(`c${i}`, "setup", { tags: tags({ players: 2 }) }));
  return { records, cases, design, all: design, generatedAt: new Date("2026-09-27T00:00:00Z"), ...overrides };
}

describe("checkBaselines: per-arm rates and the two-sample noise", () => {
  it("reads each check's pass rate per arm, and the noise as sample 1 against sample 2 on the cases with both", () => {
    const report = checkBaselines(input());
    const setup = report.roles.find((r) => r.role === "setup");
    const luna = setup?.arms.find((a) => a.arm === `postfix:${LUNA.key}`);
    expect(luna?.replies).toBe(8);
    expect(luna?.checks.modeSlate).toEqual({ rate: 0.75, n: 8, noise: 0.5 });
    // A one-sample arm has no noise of its own
    expect(setup?.arms.find((a) => a.arm === `postfix:${BASELINE.key}`)?.checks.modeSlate).toEqual({ rate: 0.25, n: 4 });
  });

  it("reads counts as means with noise, and pooled shares from their count pairs", () => {
    const luna = checkBaselines(input()).roles[0].arms.find((a) => a.arm === `postfix:${LUNA.key}`);
    expect(luna?.counts.outcomesNamingElement).toEqual({ mean: 1.5, n: 8, noise: 3 });
    expect(luna?.ratios.outcomeNamesElementShare).toEqual({ rate: 0.5, n: 8, noise: 1 });
  });
});

describe("checkBaselines: what separates the owner's rank-1 picks", () => {
  const key: RatingKey = {
    setId: "text-setup",
    pageId: "page",
    salt: "s",
    keyFile: "text-setup-page.json",
    createdAt: "",
    baseline: { promptState: "postfix", armKey: BASELINE.key },
    items: {
      "setup-01": {
        caseId: "c0",
        labels: { A: { promptState: "postfix", armKey: LUNA.key, sample: 1, caseId: "c0" }, B: { promptState: "postfix", armKey: BASELINE.key, sample: 1, caseId: "c0" } },
      },
      "setup-02": {
        caseId: "c2",
        labels: { A: { promptState: "postfix", armKey: BASELINE.key, sample: 1, caseId: "c2" }, B: { promptState: "postfix", armKey: LUNA.key, sample: 1, caseId: "c2" } },
      },
      "setup-03": {
        caseId: "c3",
        labels: { A: { promptState: "postfix", armKey: LUNA.key, sample: 1, caseId: "c3" }, B: { promptState: "postfix", armKey: BASELINE.key, sample: 1, caseId: "c3" } },
      },
    },
    labelDistribution: {},
    notes: [],
  };
  // Luna ranked first on setup-01 and setup-03, the baseline on setup-02 (Luna passes modeSlate on c0, c2, c3; the baseline only on c0)
  const exported: ExportedRatings = {
    pageId: "page",
    setId: "text-setup",
    exportedAt: "",
    ratings: { "setup-01": { A: { rank: 1 } }, "setup-02": { A: { rank: 1 }, B: { rank: 2 } }, "setup-03": { A: { rank: 1 } } },
  };

  it("counts, per check, the items where the rank-1 pick passes and a lower one fails, and the reverse", () => {
    const [page] = checkBaselines(input({ rated: [{ key, exported }] })).separation;
    expect(page.pageId).toBe("page");
    const mode = page.checks.find((c) => c.name === "modeSlate");
    // setup-01: both pass; setup-02: the pick fails, Luna passes; setup-03: the pick passes, the baseline fails
    expect(mode).toMatchObject({ rank1: { pass: 2, n: 3 }, others: { pass: 2, n: 3 }, agree: 1, disagree: 1, split: 2 });
    const named = page.counts.find((c) => c.name === "outcomesNamingElement");
    expect(named).toMatchObject({ rank1Mean: 3, othersMean: 3 });
  });

  it("renders the report with every section and no NaN", () => {
    const md = renderCheckBaselines(checkBaselines(input({ rated: [{ key, exported }] })));
    for (const heading of ["# Check baselines", "## setup", "## What separates the owner's rank-1 picks", "## Waits per turn kind"]) expect(md).toContain(heading);
    expect(md).toMatch(/\| postfix:gpt-6-luna@low\/prod \| 8 \|/);
    expect(md).toContain("75% ±50");
    expect(md).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe("checkBaselines: waits per turn kind", () => {
  it("reads beat waits per branch, planner waits, and chain waits by the planner they start with", () => {
    const beatCases = [
      evalCase("first", "beat", { tags: tags({ firstBeat: true }) }),
      evalCase("opening", "beat", { fixedAnalysis: { kind: "thread", phase: {} as never }, tags: tags({ analysisTurn: true }) }),
      evalCase("step", "beat"),
      evalCase("sw", "switch"),
    ];
    const beat = (caseId: string, latencyMs: number) => record({ caseId, role: "beat", group: "beat", armKey: LUNA.key, callArmKey: LUNA.key, latencyMs, outputFile: `b-${caseId}` });
    const records = [
      beat("first", 20_000),
      beat("opening", 30_000),
      beat("step", 10_000),
      record({ caseId: "sw", role: "switch", group: "switch", armKey: LUNA.key, callArmKey: LUNA.key, latencyMs: 5_000, outputFile: "p-sw" }),
      record({ caseId: "sw", role: "beat", group: "pipeline", step: 2, armKey: `pipeline:${LUNA.key}>${LUNA.key}`, callArmKey: LUNA.key, latencyMs: 25_000, turnLatencyMs: 31_000, outputFile: "c-sw" }),
    ];
    const design = new Map(records.map((r) => [r.outputFile as string, result({})]));
    const { turnKinds } = checkBaselines({ records, cases: beatCases, design, all: design, generatedAt: new Date(0) });
    expect(turnKinds.beats).toEqual(
      expect.arrayContaining([
        { arm: `prefix:${LUNA.key}`, kind: "first turn", n: 1, p95: 20 },
        { arm: `prefix:${LUNA.key}`, kind: "chapter opening", n: 1, p95: 30 },
        { arm: `prefix:${LUNA.key}`, kind: "chapter step", n: 1, p95: 10 },
      ])
    );
    expect(turnKinds.planners).toEqual([{ arm: `prefix:${LUNA.key}`, kind: "switch plan", n: 1, p95: 5 }]);
    expect(turnKinds.chains).toEqual([{ arm: `prefix:pipeline:${LUNA.key}>${LUNA.key}`, kind: "switch turn (planner + turn)", n: 1, p95: 31 }]);
  });
});

describe("checkBaselines: the stored chapters' backfilled frames", () => {
  it("reads each chapter's frame checks as pass counts, and renders them in their own section", () => {
    const frames: { chapterKey: string; storyId: string; threadId: string; checks: Record<string, boolean> }[] = [
      { chapterKey: "a", storyId: "s", threadId: "t1", checks: { questionNearerThanOutcome: false, milestoneKindConcrete: false } },
      { chapterKey: "b", storyId: "s", threadId: "t2", checks: { questionNearerThanOutcome: true, milestoneKindConcrete: false } },
      { chapterKey: "c", storyId: "s", threadId: "t3", checks: { milestoneKindConcrete: true } },
    ];
    const report = checkBaselines(input({ frames }));
    expect(report.frames).toEqual({ chapters: 3, checks: { questionNearerThanOutcome: { pass: 1, n: 2 }, milestoneKindConcrete: { pass: 1, n: 3 } } });
    const md = renderCheckBaselines(report);
    expect(md).toContain("## Stored chapters: the backfilled question and the plan's kind of milestone");
    expect(md).toContain("| questionNearerThanOutcome | 1 of 2 |");
    expect(md).toContain("| milestoneKindConcrete | 1 of 3 |");
    expect(renderCheckBaselines(checkBaselines(input()))).toContain("No stored chapter was read");
  });

  it("reads the nearer frames (the plan refresh of 2026-09-28) in a section of their own, beside the first frames", () => {
    const nearer = [{ chapterKey: "a", storyId: "s", threadId: "t1", checks: { questionNearerThanOutcome: true, milestoneKindConcrete: true } }];
    const report = checkBaselines(input({ nearerFrames: nearer }));
    expect(report.nearerFrames).toEqual({ chapters: 1, checks: { questionNearerThanOutcome: { pass: 1, n: 1 }, milestoneKindConcrete: { pass: 1, n: 1 } } });
    const md = renderCheckBaselines(report);
    expect(md).toContain("## Stored chapters: the nearer frames' question and kind of milestone");
    expect(md).toContain("| questionNearerThanOutcome | 1 of 1 |");
    // Without nearer frames the section says so
    expect(renderCheckBaselines(checkBaselines(input()))).toContain("No nearer frame was read");
  });
});

describe("checkBaselines: stored references against today's prompts", () => {
  it("counts the cases whose stored production-form request today's code rebuilds byte for byte", () => {
    const report = checkBaselines(input({ todaysPromptHash: (c) => (c.id === "c3" ? "changed" : `hash-${c.id}`) }));
    expect(report.references).toEqual([{ role: "setup", promptState: "postfix", cases: 4, identical: 3 }]);
  });
});
