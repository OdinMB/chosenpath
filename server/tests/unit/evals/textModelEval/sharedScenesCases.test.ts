import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import {
  GROUP_OPTIONS_PROMPT_STATE,
  SCENES_CASES,
  SCENES_PROMPT_STATE,
  armsFor,
  pipelinePlans,
  referenceKey,
  stageChecksTurns,
  stageInterleavesArms,
  stagePlansCase,
} from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { productionSends } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { SCENES_CASE_SPECS, sharedScenesCases, sharedScenesCasesToFreeze } from "../../../../src/evals/textModelEval/sharedScenesCases.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { playthroughs3Sent } from "../../../../src/evals/textModelEval/groupOptionsCases.js";
import { SHARED_SCENES_TEXT, takesScenesBlock, takesScenesPlanner, withSharedScenesLines } from "../../../../src/game/services/storyTextRounds/sharedScenes.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The scenes stage's cases (decision A's split-scene retest, the evening of
 * 2026-10-01): chapter openings of the third round's group stories run as
 * chains (the chapter planner, then its group turn) and later chapter steps on
 * the plans the round stored, where a person came to be in two places and
 * one ordinary of each, rebuilt by replaying each run (playthroughReplay.ts)
 * and frozen as round cases, each only where its request is the one
 * production sent there, byte for byte.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("sharedScenesCases on a played fake group story", () => {
  it("freezes a chapter plan's input and a chapter step's input, category scenes", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const plan = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan");
    const step = run.turns.find((t) => t.kind === "chapter step");
    expect(plan && step).toBeDefined();
    const specs = [
      { id: "round-scenes-plan-fake", story: run.spec.id, turn: plan?.turn ?? 0, role: "thread" as const, purpose: "A chapter plan." },
      { id: "round-scenes-fake", story: run.spec.id, turn: step?.turn ?? 0, role: "beat" as const, purpose: "A chapter step." },
    ];
    // A run played through today's code sent today's requests
    const { cases, problems } = sharedScenesCases([run], hashOf, specs, productionSends);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis, c.tags.source, c.tags.category, c.tags.players])).toEqual([
      ["round-scenes-plan-fake", "thread", undefined, "round", "scenes", 2],
      ["round-scenes-fake", "beat", undefined, "round", "scenes", 2],
    ]);
    expect(sharedScenesCasesToFreeze(cases, [run], hashOf, false, specs, productionSends).skipped).toEqual(["round-scenes-plan-fake", "round-scenes-fake"]);
  });
});

describe("the stage's arms and chains", () => {
  it("run production's group turn and the variant twice on the chapter steps, each with production's checked retry, and their chains twice on the chapter openings, interleaved, under a tag of their own", () => {
    const turns = [...SCENES_CASES.turns].sort().join(",");
    expect(armsFor("scenes", "beat").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])].sort().join(",")])).toEqual([
      ["gpt-6-luna@low/adopted", 2, "multiplayer", turns],
      ["gpt-6-luna@low/sharedScenes", 2, "multiplayer", turns],
    ]);
    // The fix-and-retest's chains after them (sharedScenesB, run with --arms after the run of 2026-10-01 evening)
    expect(pipelinePlans("scenes").map((p) => [p.analysis.key, p.beats.map((b) => b.key), p.samples, p.roles, [...(p.caseIds ?? [])]])).toEqual([
      ["gpt-6-luna@low/adopted", ["gpt-6-luna@low/adopted"], 2, ["thread"], [...SCENES_CASES.chains]],
      ["gpt-6-luna@low/sharedScenes", ["gpt-6-luna@low/sharedScenes"], 2, ["thread"], [...SCENES_CASES.chains]],
      ["gpt-6-luna@low/sharedScenesB", ["gpt-6-luna@low/sharedScenesB"], 2, ["thread"], [...SCENES_CASES.chains]],
    ]);
    expect(referenceKey("gpt-6-luna@low/sharedScenesB")).toBe("gpt-6-luna@low/adopted");
    for (const role of ["setup", "switch", "thread", "iteration"] as const) expect(armsFor("scenes", role)).toEqual([]);
    expect(referenceKey("gpt-6-luna@low/sharedScenes")).toBe("gpt-6-luna@low/adopted");
    expect(stageInterleavesArms("scenes")).toBe(true);
    expect(stageChecksTurns("scenes")).toBe(true);
    expect(SCENES_PROMPT_STATE).toBe("adopted24");
    expect(SCENES_PROMPT_STATE).not.toBe(GROUP_OPTIONS_PROMPT_STATE);
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, and each only from the stage on", () => {
    const ids = SCENES_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...SCENES_CASES.chains, ...SCENES_CASES.turns].sort());
    for (const spec of SCENES_CASE_SPECS) {
      expect(spec.id.startsWith("round-scenes-")).toBe(true);
      expect(spec.role).toBe((SCENES_CASES.chains as readonly string[]).includes(spec.id) ? "thread" : "beat");
      expect(["play-food-trucks", "play-estate-agents", "play-space-pirates"]).toContain(spec.story);
      expect(stagePlansCase("group-options", spec.id)).toBe(false);
      expect(stagePlansCase("scenes", spec.id)).toBe(true);
    }
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored3: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-3.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-3.json"), "utf-8"))) : [];
const storedHashes = (() => {
  const file = path.join(DIR, "prep-calls.jsonl");
  if (!fs.existsSync(file)) return new Map<string, string>();
  const records = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { outputFile?: string; promptHash?: string });
  return new Map(records.flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
})();

describe("sharedScenesCases on the third round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored3.length ? it : it.skip)("builds every case, each request the one production sent; each carries the variant's insertions; production's chapter planner today sends what the round sent with the adopted ones (sharedScenesB), its later chapter steps none", () => {
    const { cases, problems } = sharedScenesCases(stored3, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(SCENES_CASE_SPECS.map((s) => s.id));
    for (const c of cases) {
      const story = caseStory(c, c.role === "beat");
      // Every chain's picks set more than one outcome, every turn's chapter has several threads: the variant's situations
      expect([c.id, c.role === "thread" ? takesScenesPlanner(story) : takesScenesBlock(story)]).toEqual([c.id, true]);
      // The chapter planner had not changed since the round until this stage's adoption: production today sends what it
      // sent with sharedScenesB's line, and is sharedScenesB (the group turn changed before only on a rolled step, the
      // group-options adoption: playthroughs3Sent). A later chapter step keeps production's turn: the variant's turn alone
      // did not pass there
      const today = requestText(requestFor("adopted", requestInputFor(c)));
      if (c.role === "thread") {
        expect([c.id, today]).toEqual([c.id, requestText(requestFor("sharedScenesB", requestInputFor(c)))]);
        expect([c.id, sha256(today)]).toEqual([c.id, sha256(withSharedScenesLines(playthroughs3Sent(requestInputFor(c)), story, "thread", { b: true }))]);
      } else {
        expect([c.id, today.includes(SHARED_SCENES_TEXT.blockHead), today.includes(SHARED_SCENES_TEXT.turnLine)]).toEqual([c.id, false, false]);
      }
    }
    expect(cases.map((c) => c.tags.players)).toEqual(SCENES_CASE_SPECS.map((s) => (s.story === "play-space-pirates" ? 3 : 2)));
  });
});
