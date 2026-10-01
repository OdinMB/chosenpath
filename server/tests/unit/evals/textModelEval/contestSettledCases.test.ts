import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import {
  CONTEST_SETTLED_CASES,
  CONTEST_SETTLED_PROMPT_STATE,
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
import { CONTEST_SETTLED_CASE_SPECS, contestSettledCases, contestSettledCasesToFreeze } from "../../../../src/evals/textModelEval/contestSettledCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { contestSettledBase, contestsDecidedHere, withContestSettledLines, withoutContestSettledLines } from "../../../../src/game/services/storyTextRounds/contestSettled.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The contest-settled stage's cases (decision A's seal fix, the evening of
 * 2026-10-01): the chapter planner's input wherever a stored playthrough of
 * rounds 1-3 planned a contested outcome's last stage, rebuilt by replaying
 * each run (playthroughReplay.ts) and frozen as round cases, each only where
 * its request is the one production sent there, byte for byte (each round's
 * production as it stood then).
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("contestSettledCases on a played fake group story", () => {
  it("freezes a chapter plan's input, category contest-settled, from the round the spec names", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const plan = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan");
    expect(plan).toBeDefined();
    const specs = [{ id: "round-contest-fake", round: 3 as const, story: run.spec.id, turn: plan?.turn ?? 0, role: "thread" as const, purpose: "A chapter plan." }];
    // A run played through today's code sent today's requests
    const sent = { 1: productionSends, 2: productionSends, 3: productionSends };
    const { cases, problems } = contestSettledCases({ 1: [], 2: [], 3: [run] }, hashOf, specs, sent);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.tags.source, c.tags.category, c.tags.players])).toEqual([["round-contest-fake", "thread", "round", "contest-settled", 2]]);
    expect(contestSettledCasesToFreeze(cases, { 1: [], 2: [], 3: [run] }, hashOf, false, specs, sent).skipped).toEqual(["round-contest-fake"]);
    // A spec whose round holds no such story is a problem, not a case
    expect(contestSettledCases({ 1: [], 2: [], 3: [] }, hashOf, specs, sent).problems).toHaveLength(1);
  });
});

describe("the stage's arms", () => {
  it("run production's chapter planner and the variant twice on the stage's cases, interleaved, under a tag of their own", () => {
    expect(armsFor("contest-settled", "thread").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])].join(",")])).toEqual([
      ["gpt-6-luna@low/adopted", 2, "multiplayer", CONTEST_SETTLED_CASES.join(",")],
      ["gpt-6-luna@low/contestSettled", 2, "multiplayer", CONTEST_SETTLED_CASES.join(",")],
    ]);
    for (const role of ["setup", "beat", "switch", "iteration"] as const) expect(armsFor("contest-settled", role)).toEqual([]);
    expect(pipelinePlans("contest-settled")).toEqual([]);
    expect(referenceKey("gpt-6-luna@low/contestSettled")).toBe("gpt-6-luna@low/adopted");
    expect(stageInterleavesArms("contest-settled")).toBe(true);
    expect(stageChecksTurns("contest-settled")).toBe(false);
    expect(CONTEST_SETTLED_PROMPT_STATE).toBe("adopted25");
    expect(CONTEST_SETTLED_PROMPT_STATE).not.toBe(SCENES_PROMPT_STATE);
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, each a chapter plan, and each only from the stage on", () => {
    const ids = CONTEST_SETTLED_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...CONTEST_SETTLED_CASES]);
    for (const spec of CONTEST_SETTLED_CASE_SPECS) {
      expect(spec.id.startsWith(`round-contest-r${spec.round}-`)).toBe(true);
      expect(spec.role).toBe("thread");
      expect(stagePlansCase("scenes", spec.id)).toBe(false);
      expect(stagePlansCase("contest-settled", spec.id)).toBe(true);
    }
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const read = (file: string): PlayRun[] => (fs.existsSync(path.join(DIR, file)) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, file), "utf-8"))) : []);
const stored = { 1: read("playthroughs.json"), 2: read("playthroughs-2.json"), 3: read("playthroughs-3.json") };
const storedHashes = (() => {
  const file = path.join(DIR, "prep-calls.jsonl");
  if (!fs.existsSync(file)) return new Map<string, string>();
  const records = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { outputFile?: string; promptHash?: string });
  return new Map(records.flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
})();

describe("contestSettledCases on the stored playthroughs of rounds 1-3 (skipped where the output folder is absent)", () => {
  (stored[3].length ? it : it.skip)("builds every case, each request the one production sent; each decides its contest here; production today is the variant (adopted after the run of 2026-10-01), the stage's production arm its base", () => {
    const { cases, problems } = contestSettledCases(stored, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(CONTEST_SETTLED_CASE_SPECS.map((s) => s.id));
    for (const c of cases) {
      const story = caseStory(c, false);
      const spec = CONTEST_SETTLED_CASE_SPECS.find((s) => s.id === c.id);
      expect([c.id, contestsDecidedHere(story)]).toEqual([c.id, [spec?.outcomeId]]);
      const today = requestText(requestFor("adopted", requestInputFor(c)));
      expect([c.id, today]).toEqual([c.id, requestText(requestFor("contestSettled", requestInputFor(c)))]);
      // The stage's production arm (adopted under adopted25) sent production as it stood before the adoption, the variant's base
      expect([c.id, withContestSettledLines(withoutContestSettledLines(today, story), story)]).toEqual([c.id, today]);
      expect([c.id, contestSettledBase(story).prompt]).toEqual([c.id, withoutContestSettledLines(today, story)]);
    }
  });
});
