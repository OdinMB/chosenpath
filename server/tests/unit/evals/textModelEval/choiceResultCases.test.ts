import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { CHOICE_RESULT_BUILT_CASES } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import {
  CHOICE_RESULT_CASE_SPECS,
  choiceResultCases,
  choiceResultCasesToFreeze,
  type ChoiceCaseSpec,
} from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The choice-result stage's cases (2026-09-30): turns and chapter plans of the
 * playthroughs' stored runs, rebuilt by replaying each run (playthroughReplay.ts)
 * and frozen as round cases. A turn case is the turn's input (a chapter
 * opening's the story before its plan, the plan as its fixed analysis, as the
 * frozen chapter openings read), a plan case the chapter planner's input. A
 * case is built only where its request is the one production sent there,
 * byte for byte.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const hashOfRequest = (evalCase: Parameters<typeof requestInputFor>[0]) => sha256(requestText(requestFor("adopted", requestInputFor(evalCase))));

/** A played fake story and the prompt hash each of its calls sent, by output file. */
async function playedFake() {
  const { call, calls } = fakeCall(1);
  const { run } = await playStory(PLAYTHROUGHS[0], input(1), call, { sample: 1 });
  const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
  // fakeCall writes each call's output as outputs/<case id>.json
  const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
  return { run, hashOf };
}

const SPECS: ChoiceCaseSpec[] = [
  { id: "round-choice-fake-t2", story: "play-lemonade", turn: 2, role: "beat", purpose: "A chapter opening." },
  { id: "round-choice-fake-t3", story: "play-lemonade", turn: 3, role: "beat", purpose: "A chapter step." },
  { id: "round-choice-plan-fake-t2", story: "play-lemonade", turn: 2, role: "thread", purpose: "A chapter plan." },
];

describe("choiceResultCases: turns and plans of a stored playthrough, frozen as round cases", () => {
  it("freezes a chapter opening as the story before its plan with the plan as its fixed analysis, a step as its input, a plan case as the planner's input; each request as the run sent it", async () => {
    const { run, hashOf } = await playedFake();
    const { cases, problems } = choiceResultCases([run], hashOf, SPECS);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis?.kind, c.tags.source, c.tags.category, c.tags.analysisTurn])).toEqual([
      ["round-choice-fake-t2", "beat", "thread", "round", "choice-result", true],
      ["round-choice-fake-t3", "beat", undefined, "round", "choice-result", false],
      ["round-choice-plan-fake-t2", "thread", undefined, "round", "choice-result", false],
    ]);
    // Each request is the one the run sent there, byte for byte
    const [opening, step, plan] = cases;
    expect(hashOfRequest(opening)).toBe(hashOf(run.turns[1].calls[0].outputFile ?? ""));
    expect(hashOfRequest(step)).toBe(hashOf(run.turns[2].calls[0].outputFile ?? ""));
    expect(hashOfRequest(plan)).toBe(hashOf(run.turns[1].plan?.calls[0].outputFile ?? ""));
    // The chapter opening reads as one, and the planner case before any plan
    expect(caseStory(opening).getCurrentThreadBeatsCompleted()).toBe(0);
    expect(caseStory(plan, false).getCurrentBeatType()).toBe(caseStory(opening, false).getCurrentBeatType());
    // The note says what the case tests and how it was built
    expect(opening.note).toMatch(/^A chapter opening\. Built from the stored playthrough play-lemonade \(sample 1\) at turn 2/);
  });

  it("builds nothing where a rebuilt request is not the one the run sent, and says why", async () => {
    const { run } = await playedFake();
    const { cases, problems } = choiceResultCases([run], () => "not-the-hash", SPECS);
    expect(cases).toEqual([]);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/round-choice-fake-t2: its request is not the one the run sent/);
  });

  it("refuses a plan case on a turn without a chapter plan, and a story or turn the runs don't hold", async () => {
    const { run, hashOf } = await playedFake();
    const { problems } = choiceResultCases([run], hashOf, [
      { id: "a", story: "play-lemonade", turn: 3, role: "thread", purpose: "x" },
      { id: "b", story: "play-avalon", turn: 3, role: "beat", purpose: "x" },
      { id: "c", story: "play-lemonade", turn: 40, role: "beat", purpose: "x" },
    ]);
    expect(problems).toEqual([expect.stringMatching(/^a: turn 3 of play-lemonade planned no chapter/), expect.stringMatching(/^b: .*play-avalon/), expect.stringMatching(/^c: .*turn 40/)]);
  });

  it("freezes only the cases not frozen yet, unless rebuilding", async () => {
    const { run, hashOf } = await playedFake();
    const first = choiceResultCasesToFreeze([], [run], hashOf, false, SPECS);
    expect(first.cases).toHaveLength(3);
    const again = choiceResultCasesToFreeze(first.cases, [run], hashOf, false, SPECS);
    expect(again.cases).toEqual([]);
    expect(again.skipped).toEqual(SPECS.map((s) => s.id));
    expect(choiceResultCasesToFreeze(first.cases, [run], hashOf, true, SPECS).cases).toHaveLength(3);
  });

  it("names the stage's own cases, each once, as the stage plans them", () => {
    const ids = CHOICE_RESULT_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CHOICE_RESULT_CASE_SPECS.filter((s) => s.role === "thread").map((s) => s.id)).toEqual([...CHOICE_RESULT_BUILT_CASES.plans]);
    expect(CHOICE_RESULT_CASE_SPECS.filter((s) => s.role === "beat").map((s) => s.id)).toEqual([...CHOICE_RESULT_BUILT_CASES.single, ...CHOICE_RESULT_BUILT_CASES.groups]);
    for (const spec of CHOICE_RESULT_CASE_SPECS) expect(spec.id.startsWith("round-choice-")).toBe(true);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs.json"), "utf-8"))) : [];
const storedHashes = (() => {
  const file = path.join(DIR, "prep-calls.jsonl");
  if (!fs.existsSync(file)) return new Map<string, string>();
  const records = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { outputFile?: string; promptHash?: string });
  return new Map(records.flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
})();

describe("choiceResultCases on the stored playthroughs (skipped where the output folder is absent)", () => {
  (stored.length ? it : it.skip)("builds every one of the stage's cases, each request the one production sent on 30 September", () => {
    const { cases, problems } = choiceResultCases(stored, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(CHOICE_RESULT_CASE_SPECS.map((s) => s.id));
    for (const c of cases) {
      const players = c.tags.players;
      const expected = (CHOICE_RESULT_BUILT_CASES.groups as readonly string[]).includes(c.id) ? players > 1 : c.role === "beat" ? players === 1 : true;
      expect([c.id, expected]).toEqual([c.id, true]);
      expect(c.tags.firstBeat).toBe(false);
      expect(c.tags.ending).toBe(false);
    }
    // The turn cases are exploration steps: some player's thread explores
    for (const c of cases.filter((x) => x.role === "beat")) {
      const threads = caseStory(c).getCurrentThreadAnalysis()?.threads ?? [];
      expect([c.id, threads.some((t) => "resolution1" in t.progression[0].possibleResolutions)]).toEqual([c.id, true]);
    }
  });
});
