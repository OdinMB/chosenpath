import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { PARALLEL_THREADS_CASES, PARALLEL_THREADS_PROMPT_STATE, armsFor, pipelinePlans, stageInterleavesArms, stagePlansCase } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { PARALLEL_THREADS_CASE_SPECS, parallelThreadsCases, parallelThreadsCasesToFreeze } from "../../../../src/evals/textModelEval/parallelThreadsCases.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS_2, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestText } from "../../../../src/evals/textModelEval/variants.js";
import { takesLastStageLine, takesOneSidedLine, takesParallelLine } from "../../../../src/game/services/storyTextRounds/parallelThreads.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The parallel-threads stage's cases (2026-10-01, fix 4 of the second
 * playthroughs' review): the switch plans before a contest's last stage and
 * the chapter openings with parallel threads, from the second round's stored
 * runs, rebuilt by replaying each run (playthroughReplay.ts) and frozen as
 * round cases, each only where its request is the one production sent there,
 * byte for byte. Production's planners are unchanged since that run.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("parallelThreadsCases on a played fake story", () => {
  it("freezes a switch plan's input and a chapter plan's input, category parallel-threads", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS_2[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const switchTurn = run.turns.find((t) => t.turn > 1 && t.plan?.kind === "switch plan");
    const chapterTurn = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan");
    expect(switchTurn && chapterTurn).toBeDefined();
    const specs = [
      { id: "round-parallel-switch-fake", story: run.spec.id, turn: switchTurn?.turn ?? 0, role: "switch" as const, purpose: "A switch plan." },
      { id: "round-parallel-fake", story: run.spec.id, turn: chapterTurn?.turn ?? 0, role: "thread" as const, purpose: "A chapter plan." },
    ];
    const { cases, problems } = parallelThreadsCases([run], hashOf, specs);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis, c.tags.source, c.tags.category, c.tags.players])).toEqual([
      ["round-parallel-switch-fake", "switch", undefined, "round", "parallel-threads", 2],
      ["round-parallel-fake", "thread", undefined, "round", "parallel-threads", 2],
    ]);
    // The switch case is the story before the switch plan: its switch planner's request is the one the run sent
    expect(caseStory(cases[0], false).getCurrentTurn()).toBe(switchTurn?.turn ? switchTurn.turn - 1 : -1);
    expect(parallelThreadsCasesToFreeze(cases, [run], hashOf, false, specs).skipped).toEqual(["round-parallel-switch-fake", "round-parallel-fake"]);
  });

  it("builds no switch case at a turn that planned no switch", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS_2[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const chapterTurn = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan");
    const specs = [{ id: "round-parallel-switch-wrong", story: run.spec.id, turn: chapterTurn?.turn ?? 0, role: "switch" as const, purpose: "Not a switch." }];
    const { cases, problems } = parallelThreadsCases([run], (file) => byId.get(outputIdOf(file)), specs);
    expect(cases).toEqual([]);
    expect(problems).toEqual([expect.stringMatching(/planned no switch/)]);
  });
});

describe("the stage's arms and chains", () => {
  it("run production's and the variant's group switch planners twice on the switches, and their chains twice on the chapter openings", () => {
    expect(armsFor("parallel-threads", "switch").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])]])).toEqual([
      ["gpt-6-luna@low/adopted", 2, "multiplayer", [...PARALLEL_THREADS_CASES.switches]],
      ["gpt-6-luna@low/parallelThreads", 2, "multiplayer", [...PARALLEL_THREADS_CASES.switches]],
    ]);
    expect(pipelinePlans("parallel-threads").map((p) => [p.analysis.key, p.beats.map((b) => b.key), p.samples, p.roles, [...(p.caseIds ?? [])]])).toEqual([
      ["gpt-6-luna@low/adopted", ["gpt-6-luna@low/adopted"], 2, ["thread"], [...PARALLEL_THREADS_CASES.chapters]],
      ["gpt-6-luna@low/parallelThreads", ["gpt-6-luna@low/parallelThreads"], 2, ["thread"], [...PARALLEL_THREADS_CASES.chapters]],
    ]);
    for (const role of ["setup", "beat", "thread", "iteration"] as const) expect(armsFor("parallel-threads", role)).toEqual([]);
    expect(stageInterleavesArms("parallel-threads")).toBe(true);
    expect(PARALLEL_THREADS_PROMPT_STATE).toBe("adopted11");
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, and each only from the stage on", () => {
    const ids = PARALLEL_THREADS_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...PARALLEL_THREADS_CASES.switches, ...PARALLEL_THREADS_CASES.chapters].sort());
    for (const spec of PARALLEL_THREADS_CASE_SPECS) {
      expect(spec.id.startsWith("round-parallel-")).toBe(true);
      expect(spec.role).toBe((PARALLEL_THREADS_CASES.switches as readonly string[]).includes(spec.id) ? "switch" : "thread");
      expect(stagePlansCase("lever-direction", spec.id)).toBe(false);
      expect(stagePlansCase("parallel-threads", spec.id)).toBe(true);
    }
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];
const storedHashes = (() => {
  const file = path.join(DIR, "prep-calls.jsonl");
  if (!fs.existsSync(file)) return new Map<string, string>();
  const records = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { outputFile?: string; promptHash?: string });
  return new Map(records.flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
})();

describe("parallelThreadsCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every case, each request the one production sent; each takes the variant's lines where the defect happened", () => {
    const { cases, problems } = parallelThreadsCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(PARALLEL_THREADS_CASE_SPECS.map((s) => s.id));
    const byId = new Map(cases.map((c) => [c.id, caseStory(c, false)]));
    // Every switch is one before a contest's last stage, where the switch planner takes its line
    for (const id of PARALLEL_THREADS_CASES.switches) expect([id, takesLastStageLine(byId.get(id) as never)]).toEqual([id, true]);
    // Every chapter opening sets several outcomes; only the two where one side alone chose the contest take the one-sided line
    const [pirates, estate, trucks] = PARALLEL_THREADS_CASES.chapters;
    for (const id of PARALLEL_THREADS_CASES.chapters) expect([id, takesParallelLine(byId.get(id) as never)]).toEqual([id, true]);
    expect([pirates, estate, trucks].map((id) => takesOneSidedLine(byId.get(id) as never))).toEqual([true, true, false]);
    expect(cases.map((c) => c.tags.players)).toEqual([3, 2, 2, 3, 2, 2]);
  });
});
