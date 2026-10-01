import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { MONEY_ADDS_UP_CASES, armsFor, stagePlansCase, stageChecksTurns, stageInterleavesArms } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { productionSends } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { MONEY_CASE_SPECS, moneyAddsUpCases, moneyAddsUpCasesToFreeze } from "../../../../src/evals/textModelEval/moneyAddsUpCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS_2, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestText } from "../../../../src/evals/textModelEval/variants.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";
import { moneyAddsUpRequest, takesMoneyRule } from "../../../../src/game/services/storyTextRounds/moneyAddsUp.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The money-adds-up stage's cases (2026-10-01, fix 7 of the second
 * playthroughs' review): turns of the second round's lemonade story, rebuilt
 * by replaying the stored run and frozen as round cases, each only where its
 * request is the one production sent there, then recorded as the game records
 * a story from the learn-something form (its category, which the run did not
 * record and which production's turn does not read).
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const LEMONADE = PLAYTHROUGHS_2.find((s) => s.id === "play-lemonade");

describe("moneyAddsUpCases on a played fake story", () => {
  it("freezes a turn as its input, recorded as a learning story, category money-adds-up, production's request unchanged", async () => {
    if (!LEMONADE) throw new Error("no lemonade story");
    const { call, calls } = fakeCall(1);
    const { run } = await playStory(LEMONADE, input(1), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const step = run.turns.find((t) => t.turn > 2 && !t.plan);
    expect(step).toBeDefined();
    const specs = [{ id: "round-money-fake", story: "play-lemonade", turn: step?.turn ?? 0, role: "beat" as const, purpose: "A chapter step." }];
    const { cases, problems } = moneyAddsUpCases([run], hashOf, specs, productionSends);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.tags.source, c.tags.category, c.state?.category])).toEqual([["round-money-fake", "beat", "round", "money-adds-up", "learn-something"]]);
    // Production's turn reads no learning category, so the recorded case still sends what the run sent
    const story = caseStory(cases[0]);
    expect(sha256(beatStep.request(story).prompt)).toBe(hashOf(step?.calls[0]?.outputFile ?? ""));
    expect(moneyAddsUpCasesToFreeze(cases, [run], hashOf, false, specs, productionSends).skipped).toEqual(["round-money-fake"]);
  });
});

describe("the stage's arms", () => {
  it("run production and the variant twice on every case on the single-player turn model, interleaved, no checked retry; the fix-and-retest twice where production's ledger broke, once on the rest", () => {
    const all = [...MONEY_ADDS_UP_CASES].sort().join(",");
    expect(armsFor("money-adds-up", "beat").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])].sort().join(",")])).toEqual([
      ["gpt-6-luna@medium/adopted", 2, "single-player", all],
      ["gpt-6-luna@medium/moneyAddsUp", 2, "single-player", all],
      ["gpt-6-luna@medium/moneyAddsUpB", 2, "single-player", "round-money-lemonade-t3,round-money-lemonade-t4"],
      ["gpt-6-luna@medium/moneyAddsUpB", 1, "single-player", "round-money-lemonade-t11,round-money-lemonade-t2,round-money-lemonade-t6,round-money-lemonade-t8"],
    ]);
    expect(armsFor("money-adds-up", "thread")).toEqual([]);
    expect(stageChecksTurns("money-adds-up")).toBe(false);
    expect(stageInterleavesArms("money-adds-up")).toBe(true);
  });
});

describe("the stage's own cases", () => {
  it("names each lemonade turn once, as the stage plans them, and each only from the stage on", () => {
    const ids = MONEY_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...MONEY_ADDS_UP_CASES].sort());
    for (const id of ids) {
      expect(stagePlansCase("kids-turns", id)).toBe(false);
      expect(stagePlansCase("money-adds-up", id)).toBe(true);
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

describe("moneyAddsUpCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every case, each request the one production sent, each a learning story's turn that takes the variant's block", () => {
    const { cases, problems } = moneyAddsUpCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(MONEY_CASE_SPECS.map((s) => s.id));
    const kinds = cases.map((c) => {
      const story = caseStory(c);
      expect([c.id, story.getCategory(), takesMoneyRule(story), c.tags.players]).toEqual([c.id, "learn-something", true, 1]);
      expect(moneyAddsUpRequest(story).prompt).not.toBe(beatStep.request(story).prompt);
      return [c.id, story.getCurrentBeatType(), c.fixedAnalysis?.kind ?? "none"];
    });
    expect(kinds).toEqual([
      ["round-money-lemonade-t2", "thread", "thread"],
      ["round-money-lemonade-t3", "thread", "none"],
      ["round-money-lemonade-t4", "switch", "switch"],
      ["round-money-lemonade-t6", "thread", "none"],
      ["round-money-lemonade-t8", "switch", "switch"],
      ["round-money-lemonade-t11", "ending", "none"],
    ]);
  });
});
