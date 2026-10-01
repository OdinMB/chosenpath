import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { KIDS_TURNS_CASES, armsFor, stagePlansCase, stageChecksTurns } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { productionSends } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { KIDS_TURN_CASE_SPECS, kidsTurnCases, kidsTurnCasesToFreeze } from "../../../../src/evals/textModelEval/kidsTurnCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS_2, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { buildMergedPrompt } from "../../../../src/evals/textModelEval/setupPremises.js";
import { requestText } from "../../../../src/evals/textModelEval/variants.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";
import { kidsTurnRequest } from "../../../../src/game/services/storyTextRounds/kidsTurn.js";
import { kidsAgesTurnRequest } from "../../../../src/game/services/storyTextRounds/kidsAges.js";
import { productionBeforeKidsAges } from "../../../helpers/adoptedDeltas.js";
import { choiceResultRequest } from "../../../../src/game/services/storyTextRounds/choiceResult.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The kids-turns stage's cases (2026-10-01, fix 6 of the second playthroughs'
 * review): turns of the second round's mouse story, read with a five-year-old,
 * rebuilt by replaying the stored run and frozen as round cases, each only
 * where its request is the one production sent there, then recorded as the
 * game records a read-with-kids story (its category and the child's age).
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const MOUSE = PLAYTHROUGHS_2.find((s) => s.id === "play-kids-mouse");

describe("kidsTurnCases on a played fake story", () => {
  it("freezes a turn as its input, recorded as a read-with-kids story with the premise's age, category kids-turns", async () => {
    if (!MOUSE) throw new Error("no mouse story");
    const { call, calls } = fakeCall(1);
    const premise = buildMergedPrompt("read-with-kids", { kidAge: "5" }, "A mouse saves its burrow.");
    const { run } = await playStory(MOUSE, { ...input(1), premise, kids: true }, call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const step = run.turns.find((t) => t.turn > 2 && !t.plan);
    expect(step).toBeDefined();
    const specs = [{ id: "round-kids-fake", story: "play-kids-mouse", turn: step?.turn ?? 0, role: "beat" as const, purpose: "A chapter step." }];
    const { cases, problems } = kidsTurnCases([run], hashOf, specs, productionSends);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.tags.source, c.tags.category, c.tags.kids, c.state?.category, c.state?.readingAge])).toEqual([
      ["round-kids-fake", "beat", "round", "kids-turns", true, "read-with-kids", "5"],
    ]);
    // A run played through today's code records the category and the age as the game does, so it sent production's kids
    // turn: the variant since the stage's adoption, and since the kids-ages adoption later that day its age band's (a
    // five-year-old's: 3-5); the second round's stored runs sent the turn before (choiceResultRequest)
    const story = caseStory(cases[0]);
    expect(sha256(beatStep.request(story).prompt)).toBe(hashOf(step?.calls[0]?.outputFile ?? ""));
    expect(beatStep.request(story).prompt).toBe(kidsAgesTurnRequest(story).prompt);
    expect(productionBeforeKidsAges(story).prompt).toBe(kidsTurnRequest(story).prompt);
    expect(kidsTurnRequest(story).prompt).toContain("a child aged 5");
    expect(choiceResultRequest(story).prompt).not.toBe(kidsTurnRequest(story).prompt);
    expect(kidsTurnCasesToFreeze(cases, [run], hashOf, false, specs, productionSends).skipped).toEqual(["round-kids-fake"]);
  });

  it("builds nothing where the premise states no age", async () => {
    if (!MOUSE) throw new Error("no mouse story");
    const { call, calls } = fakeCall(1);
    const { run } = await playStory(MOUSE, input(1), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const step = run.turns.find((t) => t.turn > 2 && !t.plan);
    const specs = [{ id: "round-kids-fake", story: "play-kids-mouse", turn: step?.turn ?? 0, role: "beat" as const, purpose: "A chapter step." }];
    const { cases, problems } = kidsTurnCases([run], (file) => byId.get(outputIdOf(file)), specs, productionSends);
    expect(cases).toEqual([]);
    expect(problems).toEqual(["round-kids-fake: its story's premise states no child's age"]);
  });
});

describe("the stage's arms", () => {
  it("run production and the variant twice on every case on the single-player turn model, each turn with production's checked retry", () => {
    const all = [...KIDS_TURNS_CASES.mouse, ...KIDS_TURNS_CASES.template].sort().join(",");
    expect(armsFor("kids-turns", "beat").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])].sort().join(",")])).toEqual([
      ["gpt-6-luna@medium/adopted", 2, "single-player", all],
      ["gpt-6-luna@medium/kidsTurn", 2, "single-player", all],
    ]);
    expect(armsFor("kids-turns", "thread")).toEqual([]);
    expect(stageChecksTurns("kids-turns")).toBe(true);
  });
});

describe("the stage's own cases", () => {
  it("names each mouse turn once, as the stage plans them, and each only from the stage on; the template stays plannable", () => {
    const ids = KIDS_TURN_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...KIDS_TURNS_CASES.mouse].sort());
    for (const id of ids) {
      expect(stagePlansCase("challenge-results", id)).toBe(false);
      expect(stagePlansCase("kids-turns", id)).toBe(true);
    }
    expect(stagePlansCase("kids-turns", KIDS_TURNS_CASES.template[0])).toBe(true);
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

describe("kidsTurnCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every case, each request the one production sent, each a read-with-kids turn for a child aged 5 of the kind named", () => {
    const { cases, problems } = kidsTurnCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(KIDS_TURN_CASE_SPECS.map((s) => s.id));
    const kinds = cases.map((c) => {
      const story = caseStory(c);
      expect([c.id, story.isReadWithKids(), story.getReadingAge(), c.tags.players]).toEqual([c.id, true, "5", 1]);
      return [c.id, story.isFirstBeat() ? "first" : story.getCurrentBeatType(), c.fixedAnalysis?.kind ?? "none"];
    });
    expect(kinds).toEqual([
      ["round-kids-mouse-t1", "first", "switch"],
      ["round-kids-mouse-t2", "thread", "thread"],
      ["round-kids-mouse-t3", "thread", "none"],
      ["round-kids-mouse-t5", "switch", "switch"],
      ["round-kids-mouse-t7", "thread", "none"],
      ["round-kids-mouse-t11", "ending", "none"],
    ]);
  });
});
