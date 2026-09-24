import { runRatingItems } from "../../../../src/evals/imageModelEval/itemScheduler.js";
import type {
  PhaseRunner,
  RatingSetPlan,
} from "../../../../src/evals/imageModelEval/itemScheduler.js";
import { beatArmsForItem } from "../../../../src/evals/imageModelEval/arms.js";
import type { EvalCase } from "../../../../src/evals/imageModelEval/cases.js";
import type { CallRecord, PlannedCall } from "../../../../src/evals/imageModelEval/runner.js";

function evalCase(id: string): EvalCase {
  return {
    id,
    callSite: "beat",
    prompt: "prompt",
    references: [],
    description: "scene",
    styleNotes: "- none given",
  };
}

function plan(primaries: string[], reserves: string[]): RatingSetPlan[] {
  return [
    {
      setId: "set",
      items: primaries.map((id, i) => ({
        itemId: `set-0${i + 1}`,
        arms: beatArmsForItem(i),
        evalCase: evalCase(id),
      })),
      reserves: reserves.map(evalCase),
    },
  ];
}

/** Fake phase runner: every call succeeds unless its case is listed as failing. */
function fakeRunner(failingBaselines: string[], stopOnPhase?: number) {
  const records: CallRecord[] = [];
  const phases: PlannedCall[][] = [];
  const runPhase: PhaseRunner = async (calls) => {
    phases.push(calls);
    if (stopOnPhase === phases.length) {
      return { records, stoppedBySpendGuard: true };
    }
    for (const c of calls) {
      const failed = c.arm.baseline && failingBaselines.includes(c.evalCase.id);
      records.push({
        itemId: c.itemId,
        caseId: c.evalCase.id,
        armKey: c.arm.key,
        model: c.arm.model,
        quality: c.arm.quality,
        size: c.arm.size,
        startedAt: "",
        latencyMs: 1,
        status: failed ? "error" : "success",
        attempt: 1,
        final: true,
        costUsd: 0,
        costSource: "none",
        outputFile: failed ? undefined : `images/${c.evalCase.id}-${c.arm.key}.jpeg`,
      });
    }
    return { records, stoppedBySpendGuard: false };
  };
  return { runPhase, phases };
}

const deps = (runPhase: PhaseRunner) => ({
  runPhase,
  estimate: () => 0.01,
  outputExists: () => true,
});

describe("runRatingItems", () => {
  it("runs every baseline before any candidate", async () => {
    const { runPhase, phases } = fakeRunner([]);

    await runRatingItems(plan(["a", "b"], []), [], deps(runPhase));

    expect(phases).toHaveLength(2);
    expect(phases[0].every((c) => c.arm.baseline)).toBe(true);
    expect(phases[0]).toHaveLength(2);
    expect(phases[1].some((c) => c.arm.baseline)).toBe(false);
    expect(phases[1]).toHaveLength(6);
  });

  it("replaces an item whose baseline failed with the next reserve", async () => {
    const { runPhase, phases } = fakeRunner(["a", "r1"]);

    const result = await runRatingItems(plan(["a", "b"], ["r1", "r2"]), [], deps(runPhase));

    expect(result.sets[0].items.map((i) => i.evalCase.id)).toEqual(["r2", "b"]);
    expect(result.sets[0].items[0].itemId).toBe("set-01");
    const candidateCases = new Set(phases[phases.length - 1].map((c) => c.evalCase.id));
    expect([...candidateCases].sort()).toEqual(["b", "r2"]);
    expect(result.partial).toBe(false);
  });

  it("runs no candidates for an item whose baseline failed and has no reserve", async () => {
    const { runPhase, phases } = fakeRunner(["a"]);

    await runRatingItems(plan(["a", "b"], []), [], deps(runPhase));

    const candidateCases = new Set(phases[phases.length - 1].map((c) => c.evalCase.id));
    expect([...candidateCases]).toEqual(["b"]);
  });

  it("reports a partial run when the spend guard stops a phase", async () => {
    const { runPhase, phases } = fakeRunner([], 1);

    const result = await runRatingItems(plan(["a"], []), [], deps(runPhase));

    expect(result.partial).toBe(true);
    expect(phases).toHaveLength(1);
  });
});
