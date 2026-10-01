import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { OUTCOME_SETTLED_CASES, OUTCOME_SETTLED_SWITCH_CASES, armsFor, stagePlansCase } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { OUTCOME_SETTLED_CASE_SPECS, outcomeSettledCases, outcomeSettledCasesToFreeze } from "../../../../src/evals/textModelEval/outcomeSettledCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestText } from "../../../../src/evals/textModelEval/variants.js";
import { outcomesCompletedThisBeat } from "../../../../src/game/services/storyTextRounds/outcomeSettled.js";
import { beforeShortReplies } from "../../../helpers/adoptedDeltas.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The outcome-settled stage's cases (2026-09-30, the second playthroughs'
 * review): switch turns of the second round's stored runs whose milestones
 * complete an outcome, and its endings, rebuilt by replaying each run
 * (playthroughReplay.ts) and frozen as round cases, each only where its request
 * is the one production sent there, byte for byte. Production's turn is
 * unchanged since that run (the review's fix changed a repair, not a request),
 * so what it sends today is what it sent.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("outcomeSettledCases on a played fake story", () => {
  it("freezes a switch turn after a chapter as its input with the switch plan as its fixed analysis, category outcome-settled", async () => {
    const { call, calls } = fakeCall(1);
    const { run } = await playStory(PLAYTHROUGHS[0], input(1), call, { sample: 1 });
    // The fake run plays through today's production; the stored playthroughs sent each turn before the short-replies
    // adoption of 2026-10-01, so the run's requests are read as production sent them then
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(beforeShortReplies(requestText(c.request)))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const switchTurn = run.turns.find((t) => t.turn > 1 && t.plan?.kind === "switch plan");
    expect(switchTurn).toBeDefined();
    const specs = [{ id: "round-settled-fake", story: "play-lemonade", turn: switchTurn?.turn ?? 0, role: "beat" as const, purpose: "A switch turn." }];
    const { cases, problems } = outcomeSettledCases([run], hashOf, specs);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis?.kind, c.tags.source, c.tags.category])).toEqual([["round-settled-fake", "beat", "switch", "round", "outcome-settled"]]);
    expect(caseStory(cases[0]).getCurrentBeatType()).toBe("switch");
    // Frozen once, unless rebuilding
    expect(outcomeSettledCasesToFreeze(cases, [run], hashOf, false, specs).skipped).toEqual(["round-settled-fake"]);
  });
});

describe("the stage's arms", () => {
  it("run production and the variant twice on every case, and the retest twice on the switch turns and once on the endings", () => {
    const plans = armsFor("outcome-settled", "beat").map((p) => [p.arm.key, p.samples, [...(p.caseIds ?? [])].sort().join(",")]);
    const all = (ids: readonly string[]) => [...ids].sort().join(",");
    const switches = OUTCOME_SETTLED_SWITCH_CASES;
    const endings = { single: OUTCOME_SETTLED_CASES.single.filter((id) => !switches.single.includes(id)), groups: OUTCOME_SETTLED_CASES.groups.filter((id) => !switches.groups.includes(id)) };
    expect(plans).toEqual([
      ["gpt-6-luna@medium/adopted", 2, all(OUTCOME_SETTLED_CASES.single)],
      ["gpt-6-luna@medium/outcomeSettled", 2, all(OUTCOME_SETTLED_CASES.single)],
      ["gpt-6-luna@low/adopted", 2, all(OUTCOME_SETTLED_CASES.groups)],
      ["gpt-6-luna@low/outcomeSettled", 2, all(OUTCOME_SETTLED_CASES.groups)],
      ["gpt-6-luna@medium/outcomeSettledB", 2, all(switches.single)],
      ["gpt-6-luna@low/outcomeSettledB", 2, all(switches.groups)],
      ["gpt-6-luna@medium/outcomeSettledB", 1, all(endings.single)],
      ["gpt-6-luna@low/outcomeSettledB", 1, all(endings.groups)],
    ]);
    expect([switches.single.length, switches.groups.length, endings.single.length, endings.groups.length]).toEqual([4, 3, 2, 3]);
    expect(armsFor("outcome-settled", "thread")).toEqual([]);
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, and each only from the stage on", () => {
    const ids = OUTCOME_SETTLED_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...OUTCOME_SETTLED_CASES.single, ...OUTCOME_SETTLED_CASES.groups].sort());
    for (const id of ids) {
      expect(id.startsWith("round-settled-")).toBe(true);
      expect(stagePlansCase("choice-line-sp", id)).toBe(false);
      expect(stagePlansCase("outcome-settled", id)).toBe(true);
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

describe("outcomeSettledCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every case, each request the one production sent; each switch turn completes an outcome, each ending is an ending", () => {
    const { cases, problems } = outcomeSettledCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(OUTCOME_SETTLED_CASE_SPECS.map((s) => s.id));
    for (const c of cases) {
      const story = caseStory(c);
      const single = (OUTCOME_SETTLED_CASES.single as readonly string[]).includes(c.id);
      expect([c.id, c.tags.players === 1]).toEqual([c.id, single]);
      if (c.tags.ending) expect([c.id, story.getCurrentBeatType()]).toEqual([c.id, "ending"]);
      else expect([c.id, story.getCurrentBeatType(), outcomesCompletedThisBeat(story).length > 0]).toEqual([c.id, "switch", true]);
    }
  });
});
