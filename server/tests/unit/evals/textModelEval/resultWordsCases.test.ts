import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import {
  MONEY_2_PROMPT_STATE,
  RESULT_WORDS_CASES,
  RESULT_WORDS_PROMPT_STATE,
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
import { RESULT_WORDS_CASE_SPECS, resultWordsCases, resultWordsCasesToFreeze } from "../../../../src/evals/textModelEval/resultWordsCases.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { resultWordsBase, takesResultWordsLine, withResultWordsLine, withoutResultWordsLine } from "../../../../src/game/services/storyTextRounds/resultWords.js";
import { resultWordsOfBeat } from "../../../../src/game/services/beatRepairs.js";
import { replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import type { BeatGeneration } from "core/types/index.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The result-words stage's cases (decision A's result-words fix, 2026-10-02):
 * every group turn of the stored playthroughs whose text named a result's kind,
 * rebuilt by replaying each run (playthroughReplay.ts) and frozen as round
 * cases, each only where its request is the one its round's production sent
 * there, byte for byte.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("resultWordsCases on a played fake group story", () => {
  it("freezes a turn's input, category result-words, from the round the spec names", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const turn = run.turns.find((t) => t.turn > 2 && !t.plan && t.kind !== "ending");
    expect(turn).toBeDefined();
    const specs = [{ id: "round-words-fake", round: 3 as const, story: run.spec.id, turn: turn?.turn ?? 0, role: "beat" as const, purpose: "A group turn." }];
    // A run played through today's code sent today's requests
    const sent = { 1: productionSends, 2: productionSends, 3: productionSends };
    const { cases, problems } = resultWordsCases({ 1: [], 2: [], 3: [run] }, hashOf, specs, sent);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.tags.source, c.tags.category, c.tags.players])).toEqual([["round-words-fake", "beat", "round", "result-words", 2]]);
    expect(resultWordsCasesToFreeze(cases, { 1: [], 2: [], 3: [run] }, hashOf, false, specs, sent).skipped).toEqual(["round-words-fake"]);
    // A spec whose round holds no such story is a problem, not a case
    expect(resultWordsCases({ 1: [], 2: [], 3: [] }, hashOf, specs, sent).problems).toHaveLength(1);
  });
});

describe("the stage's arms", () => {
  it("run production's group turn and the variant twice on the stage's cases, interleaved, each with production's checked retry, under a tag of their own", () => {
    expect(armsFor("result-words", "beat").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])].join(",")])).toEqual([
      ["gpt-6-luna@low/adopted", 2, "multiplayer", RESULT_WORDS_CASES.join(",")],
      ["gpt-6-luna@low/resultWords", 2, "multiplayer", RESULT_WORDS_CASES.join(",")],
    ]);
    for (const role of ["setup", "thread", "switch", "iteration"] as const) expect(armsFor("result-words", role)).toEqual([]);
    expect(pipelinePlans("result-words")).toEqual([]);
    expect(referenceKey("gpt-6-luna@low/resultWords")).toBe("gpt-6-luna@low/adopted");
    expect(stageInterleavesArms("result-words")).toBe(true);
    expect(stageChecksTurns("result-words")).toBe(true);
    expect(RESULT_WORDS_PROMPT_STATE).toBe("adopted27");
    expect(RESULT_WORDS_PROMPT_STATE).not.toBe(MONEY_2_PROMPT_STATE);
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, each a turn of round 2 or 3, and each only from the stage on", () => {
    const ids = RESULT_WORDS_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...RESULT_WORDS_CASES]);
    for (const spec of RESULT_WORDS_CASE_SPECS) {
      expect(spec.id).toBe(`round-words-r${spec.round}-${spec.story.replace(/^play-/, "")}-t${spec.turn}`);
      expect(spec.role).toBe("beat");
      expect(stagePlansCase("money-2", spec.id)).toBe(false);
      expect(stagePlansCase("result-words", spec.id)).toBe(true);
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

describe("resultWordsCases on the stored playthroughs of rounds 2 and 3 (skipped where the output folder is absent)", () => {
  (stored[3].length ? it : it.skip)("builds every case, each request the one its round sent; each turn named a result's kind there and takes the line; production today is the variant (adopted after the run of 2026-10-02), the stage's production arm its base", () => {
    const { cases, problems } = resultWordsCases(stored, (file) => storedHashes.get(outputIdOf(file)));
    // The replay goes through production's contest resolution, which reads each side by its players' average since the
    // review of the fourth playthroughs (2026-10-02): round 3's space pirates' seal chapter (turns 11-13) ended on a step
    // (Tomas alone unfavorable, against Davi unfavorable and Oren mixed) the raw counts made mixed and the averages side
    // B's, so from turn 14 its replayed states are not the ones played, and its case at turn 14 can't be rebuilt. The
    // stage ran on the frozen case (cases/), built before; nothing is sent again.
    const diverged = "round-words-r3-space-pirates-t14";
    expect(problems).toEqual([`round 3: ${diverged}: its request is not the one the run sent at turn 14 of play-space-pirates`]);
    expect(cases.map((c) => c.id)).toEqual(RESULT_WORDS_CASE_SPECS.map((s) => s.id).filter((id) => id !== diverged));
    for (const c of cases) {
      const spec = RESULT_WORDS_CASE_SPECS.find((s) => s.id === c.id);
      const story = caseStory(c);
      expect([c.id, takesResultWordsLine(story)]).toEqual([c.id, true]);
      // The stored reply there named a result's kind for some player
      const played = replayedTurn(stored[spec?.round ?? 3], spec?.story ?? "", spec?.turn ?? 0).played;
      const named = story.getPlayerSlots().filter((slot) => resultWordsOfBeat((played.reply as unknown as Record<string, BeatGeneration | undefined>)[slot]).length > 0);
      expect([c.id, named.length > 0]).toEqual([c.id, true]);
      const today = requestText(requestFor("adopted", requestInputFor(c)));
      expect([c.id, requestText(requestFor("resultWords", requestInputFor(c)))]).toEqual([c.id, today]);
      // The stage's production arm (adopted under adopted27) sent production as it stood before the adoption, the variant's base
      expect([c.id, withResultWordsLine(resultWordsBase(story).prompt, story)]).toEqual([c.id, today]);
      expect([c.id, resultWordsBase(story).prompt]).toEqual([c.id, withoutResultWordsLine(today, story)]);
    }
  });
});
