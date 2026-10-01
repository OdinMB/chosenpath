import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { RECORDED_RESULT_CASES, armsFor, stagePlansCase } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { RECORDED_RESULT_CASE_SPECS, recordedResultCases, recordedResultCasesToFreeze } from "../../../../src/evals/textModelEval/recordedResultCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestText } from "../../../../src/evals/textModelEval/variants.js";
import { recordedExplorationThreads } from "../../../../src/game/services/storyTextRounds/recordedResult.js";
import { beforeShortReplies } from "../../../helpers/adoptedDeltas.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The recorded-result stage's cases (2026-09-30, fix 2 of the second
 * playthroughs' review): turns of the second round's stored runs that narrate
 * an exploration step's recorded result where it changed direction from the
 * step before, rebuilt by replaying each run (playthroughReplay.ts) and frozen
 * as round cases, each only where its request is the one production sent
 * there, byte for byte. Production's turn is unchanged since that run.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("recordedResultCases on a played fake story", () => {
  it("freezes a turn as its input, with its plan as the fixed analysis where it had one, category recorded-result", async () => {
    const { call, calls } = fakeCall(1);
    const { run } = await playStory(PLAYTHROUGHS[0], input(1), call, { sample: 1 });
    // The fake run plays through today's production; the stored playthroughs sent each turn before the short-replies
    // adoption of 2026-10-01, so the run's requests are read as production sent them then
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(beforeShortReplies(requestText(c.request)))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const switchTurn = run.turns.find((t) => t.turn > 1 && t.plan?.kind === "switch plan");
    expect(switchTurn).toBeDefined();
    const specs = [{ id: "round-recorded-fake", story: "play-lemonade", turn: switchTurn?.turn ?? 0, role: "beat" as const, purpose: "A switch turn." }];
    const { cases, problems } = recordedResultCases([run], hashOf, specs);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis?.kind, c.tags.source, c.tags.category])).toEqual([["round-recorded-fake", "beat", "switch", "round", "recorded-result"]]);
    expect(recordedResultCasesToFreeze(cases, [run], hashOf, false, specs).skipped).toEqual(["round-recorded-fake"]);
  });
});

describe("the stage's arms", () => {
  it("run production and the variant twice on every case, each player count on its own turn model", () => {
    const plans = armsFor("recorded-result", "beat").map((p) => [p.arm.key, p.samples, [...(p.caseIds ?? [])].sort().join(",")]);
    const all = (ids: readonly string[]) => [...ids].sort().join(",");
    expect(plans).toEqual([
      ["gpt-6-luna@medium/adopted", 2, all(RECORDED_RESULT_CASES.single)],
      ["gpt-6-luna@medium/recordedResult", 2, all(RECORDED_RESULT_CASES.single)],
      ["gpt-6-luna@low/adopted", 2, all(RECORDED_RESULT_CASES.groups)],
      ["gpt-6-luna@low/recordedResult", 2, all(RECORDED_RESULT_CASES.groups)],
    ]);
    expect([RECORDED_RESULT_CASES.single.length, RECORDED_RESULT_CASES.groups.length]).toEqual([4, 4]);
    expect(armsFor("recorded-result", "thread")).toEqual([]);
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, and each only from the stage on", () => {
    const ids = RECORDED_RESULT_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...RECORDED_RESULT_CASES.single, ...RECORDED_RESULT_CASES.groups].sort());
    for (const id of ids) {
      expect(id.startsWith("round-recorded-")).toBe(true);
      expect(stagePlansCase("outcome-settled", id)).toBe(false);
      expect(stagePlansCase("recorded-result", id)).toBe(true);
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

describe("recordedResultCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every case, each request the one production sent; each narrates an exploration result that changed direction from the step before", () => {
    const { cases, problems } = recordedResultCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(RECORDED_RESULT_CASE_SPECS.map((s) => s.id));
    for (const c of cases) {
      const story = caseStory(c);
      const single = (RECORDED_RESULT_CASES.single as readonly string[]).includes(c.id);
      expect([c.id, c.tags.players === 1]).toEqual([c.id, single]);
      const threads = recordedExplorationThreads(story);
      expect([c.id, threads.length > 0]).toEqual([c.id, true]);
      // Every case changes direction on at least one exploration thread: the recorded result differs from the step before's
      const changes = threads.some((thread) => {
        const played = thread.progression.filter((step) => step.resolution !== null);
        return played.length >= 2 && played[played.length - 1].resolution !== played[played.length - 2].resolution;
      });
      expect([c.id, changes]).toEqual([c.id, true]);
    }
  });
});
