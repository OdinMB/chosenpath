import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { CHALLENGE_RESULTS_CASES, CHALLENGE_RESULTS_PROMPT_STATE, armsFor, pipelinePlans, stageInterleavesArms, stagePlansCase } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { CHALLENGE_RESULTS_CASE_SPECS, challengeResultsCases, challengeResultsCasesToFreeze } from "../../../../src/evals/textModelEval/challengeResultsCases.js";
import { productionSends } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS_2, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestText } from "../../../../src/evals/textModelEval/variants.js";
import { pickedOutcome } from "../../../../src/game/services/pacing.js";
import { TEXT_MODEL_GROUPS } from "../../../../src/shared/llm/textModelSettings.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The challenge-results stage's cases (2026-10-01, fix 5 of the second
 * playthroughs' review): chapter plans of the second round's stored runs,
 * rebuilt by replaying each run (playthroughReplay.ts) and frozen as round
 * cases, each only where its request is the one production sent there, byte
 * for byte. Production's chapter planner is unchanged since that run.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("challengeResultsCases on a played fake story", () => {
  it("freezes a chapter plan's input, category challenge-results", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS_2[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const chapterTurn = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan");
    expect(chapterTurn).toBeDefined();
    const specs = [{ id: "round-results-fake", story: run.spec.id, turn: chapterTurn?.turn ?? 0, role: "thread" as const, purpose: "A chapter plan." }];
    // A run played through today's code sent today's requests
    const { cases, problems } = challengeResultsCases([run], hashOf, specs, productionSends);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis, c.tags.source, c.tags.category, c.tags.players])).toEqual([["round-results-fake", "thread", undefined, "round", "challenge-results", 2]]);
    expect(challengeResultsCasesToFreeze(cases, [run], hashOf, false, specs, productionSends).skipped).toEqual(["round-results-fake"]);
    // Read as the second round sent it (planner v2f), today's chapter planner is not that request (the stage's adoption)
    expect(challengeResultsCases([run], hashOf, specs).problems).toEqual([expect.stringMatching(/^round-results-fake: its request is not the one the run sent/)]);
  });

  it("builds no case at a turn that planned no chapter", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS_2[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const switchTurn = run.turns.find((t) => t.turn > 1 && t.plan?.kind === "switch plan");
    const specs = [{ id: "round-results-wrong", story: run.spec.id, turn: switchTurn?.turn ?? 0, role: "thread" as const, purpose: "Not a chapter." }];
    const { cases, problems } = challengeResultsCases([run], (file) => byId.get(outputIdOf(file)), specs, productionSends);
    expect(cases).toEqual([]);
    expect(problems).toEqual([expect.stringMatching(/planned no chapter/)]);
  });
});

describe("the stage's arms", () => {
  it("run production's and the variant's chapter planners twice on every case, interleaved, on the planner model both player counts share", () => {
    const all = [...CHALLENGE_RESULTS_CASES.single, ...CHALLENGE_RESULTS_CASES.groups];
    expect(armsFor("challenge-results", "thread").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])]])).toEqual([
      ["gpt-6-luna@low/adopted", 2, "all", all],
      ["gpt-6-luna@low/resultsAsOutcomes", 2, "all", all],
    ]);
    // One arm covers both player counts: production's single-player and group planners run the same model and effort
    expect([TEXT_MODEL_GROUPS.analysis.model, TEXT_MODEL_GROUPS.analysis.reasoningEffort]).toEqual([TEXT_MODEL_GROUPS.multiplayerAnalysis.model, TEXT_MODEL_GROUPS.multiplayerAnalysis.reasoningEffort]);
    for (const role of ["setup", "beat", "switch", "iteration"] as const) expect(armsFor("challenge-results", role)).toEqual([]);
    expect(pipelinePlans("challenge-results")).toEqual([]);
    expect(stageInterleavesArms("challenge-results")).toBe(true);
    expect(CHALLENGE_RESULTS_PROMPT_STATE).toBe("adopted12");
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, each a chapter plan, and each only from the stage on", () => {
    const ids = CHALLENGE_RESULTS_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...CHALLENGE_RESULTS_CASES.single, ...CHALLENGE_RESULTS_CASES.groups].sort());
    for (const spec of CHALLENGE_RESULTS_CASE_SPECS) {
      expect(spec.id).toBe(`round-results-${spec.story.replace(/^play-/, "")}-t${spec.turn}`);
      expect(spec.role).toBe("thread");
      expect(stagePlansCase("parallel-threads", spec.id)).toBe(false);
      expect(stagePlansCase("challenge-results", spec.id)).toBe(true);
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

describe("challengeResultsCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every case, each request the one production sent, by player count and switch kind as the stage lists them", () => {
    const { cases, problems } = challengeResultsCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(CHALLENGE_RESULTS_CASE_SPECS.map((s) => s.id));
    for (const c of cases) expect([c.id, c.tags.players > 1]).toEqual([c.id, (CHALLENGE_RESULTS_CASES.groups as readonly string[]).includes(c.id)]);
    // Each case is the chapter planner's input after the switch the stage names: a flavor switch for most defects
    const kinds = Object.fromEntries(cases.map((c) => [c.id, pickedOutcome(caseStory(c, false), "player1")?.kind]));
    expect(Object.entries(kinds).filter(([, kind]) => kind === "flavor").map(([id]) => id)).toEqual([
      "round-results-lemonade-t2",
      "round-results-kids-mouse-t9",
      "round-results-avalon-t21",
      "round-results-food-trucks-t2",
      "round-results-food-trucks-t9",
      "round-results-food-trucks-t21",
      "round-results-space-pirates-t2",
      "round-results-space-pirates-t19",
      "round-results-estate-agents-t2",
      "round-results-estate-agents-t16",
      "round-results-estate-agents-t23",
    ]);
  });
});
