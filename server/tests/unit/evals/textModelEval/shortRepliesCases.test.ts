import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import {
  GROUP_LEVERS_PROMPT_STATE,
  SHORT_REPLIES_BUILT_CASES,
  SHORT_REPLIES_CASES,
  SHORT_REPLIES_PROMPT_STATE,
  armsFor,
  referenceKey,
  stageChecksTurns,
  stageInterleavesArms,
  stagePlansCase,
} from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { SHORT_REPLIES_CASE_SPECS, shortRepliesCases, shortRepliesCasesToFreeze } from "../../../../src/evals/textModelEval/shortRepliesCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { productionSends } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { SHORT_REPLIES_TEXT } from "../../../../src/game/services/storyTextRounds/shortReplies.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The short-replies stage's cases (2026-10-01, the coordinator's brief after
 * the second playthroughs: 13 of 126 first replies one short paragraph, 2 of
 * them short again after production's retry). The round's short turns not
 * frozen yet are rebuilt by replaying their stored runs (playthroughReplay.ts)
 * and frozen as round cases, each only where its request is the one production
 * sent there, byte for byte. Beside them run the round's short turns other
 * stages froze, the stored turns that came back short most often over the
 * eval's earlier stages, and ordinary ones.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("shortRepliesCases on a played fake story", () => {
  it("freezes a turn as its input, category short-replies: a first turn as the story before its plan with the plan fixed", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const first = run.turns.find((t) => t.kind === "first turn");
    const step = run.turns.find((t) => t.kind === "chapter step");
    expect(first).toBeDefined();
    expect(step).toBeDefined();
    const specs = [
      { id: "round-short-fake-t1", story: PLAYTHROUGHS[2].id, turn: first?.turn ?? 0, role: "beat" as const, purpose: "A first turn." },
      { id: "round-short-fake-step", story: PLAYTHROUGHS[2].id, turn: step?.turn ?? 0, role: "beat" as const, purpose: "A chapter step." },
    ];
    // A run played through today's code sent production's request as it is now
    const { cases, problems } = shortRepliesCases([run], hashOf, specs, productionSends);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis?.kind, c.tags.source, c.tags.category, c.tags.players])).toEqual([
      ["round-short-fake-t1", "beat", "switch", "round", "short-replies", 2],
      ["round-short-fake-step", "beat", undefined, "round", "short-replies", 2],
    ]);
    expect(caseStory(cases[0]).isFirstBeat()).toBe(true);
    expect(shortRepliesCasesToFreeze(cases, [run], hashOf, false, specs, productionSends).skipped).toEqual(["round-short-fake-t1", "round-short-fake-step"]);
    // The second round's runs sent production's group chapter step before the group levers' adoption
    expect(shortRepliesCases([run], hashOf, specs).problems).toEqual([`round-short-fake-step: its request is not the one the run sent at turn ${step?.turn} of play-food-trucks`]);
  });
});

describe("the stage's arms", () => {
  it("run production's turn and the variant twice on every case on each player count's turn model, interleaved, each turn with production's one checked retry, under a tag of their own", () => {
    const single = [...SHORT_REPLIES_CASES.single].sort().join(",");
    const groups = [...SHORT_REPLIES_CASES.groups].sort().join(",");
    expect(armsFor("short-replies", "beat").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])].sort().join(",")])).toEqual([
      ["gpt-6-luna@medium/adopted", 2, "single-player", single],
      ["gpt-6-luna@medium/shortReplies", 2, "single-player", single],
      ["gpt-6-luna@low/adopted", 2, "multiplayer", groups],
      ["gpt-6-luna@low/shortReplies", 2, "multiplayer", groups],
    ]);
    for (const role of ["setup", "switch", "thread", "iteration"] as const) expect(armsFor("short-replies", role)).toEqual([]);
    expect(referenceKey("gpt-6-luna@medium/shortReplies")).toBe("gpt-6-luna@medium/adopted");
    expect(referenceKey("gpt-6-luna@low/shortReplies")).toBe("gpt-6-luna@low/adopted");
    expect(stageInterleavesArms("short-replies")).toBe(true);
    expect(stageChecksTurns("short-replies")).toBe(true);
    expect(SHORT_REPLIES_PROMPT_STATE).toBe("adopted18");
    expect(SHORT_REPLIES_PROMPT_STATE).not.toBe(GROUP_LEVERS_PROMPT_STATE);
  });
});

describe("the stage's own cases", () => {
  it("names each once; the built ones are the specs, frozen for this stage on; the others were frozen by earlier stages and stay plannable", () => {
    const all = [...SHORT_REPLIES_CASES.single, ...SHORT_REPLIES_CASES.groups];
    expect(new Set(all).size).toBe(all.length);
    expect(SHORT_REPLIES_CASE_SPECS.map((s) => s.id)).toEqual([...SHORT_REPLIES_BUILT_CASES]);
    for (const id of SHORT_REPLIES_BUILT_CASES) {
      expect(all).toContain(id);
      expect(id.startsWith("round-short-")).toBe(true);
      expect(stagePlansCase("group-levers", id)).toBe(false);
    }
    for (const id of all) expect(stagePlansCase("short-replies", id)).toBe(true);
    for (const spec of SHORT_REPLIES_CASE_SPECS) {
      expect(spec.role).toBe("beat");
      // The estate agents' replay is production's story only up to turn 21 (the owner's roll since 2026-10-01)
      if (spec.story === "play-estate-agents") expect(spec.turn).toBeLessThanOrEqual(21);
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

describe("shortRepliesCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every case, each request the one production sent, each a turn whose first reply production retried as one short paragraph", () => {
    const { cases, problems } = shortRepliesCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(SHORT_REPLIES_CASE_SPECS.map((s) => s.id));
    for (const spec of SHORT_REPLIES_CASE_SPECS) {
      const played = stored2.find((r) => r.spec.id === spec.story && r.sample === 1)?.turns.find((t) => t.turn === spec.turn);
      const first = played?.calls.find((c) => !c.retry);
      expect([spec.id, first?.problem]).toEqual([spec.id, expect.stringMatching(/a single paragraph/)]);
      expect([spec.id, played?.calls.some((c) => c.retry)]).toEqual([spec.id, true]);
    }
    for (const c of cases) {
      // The variant is production's request today, built from the same state, with its line
      const variant = requestText(requestFor("shortReplies", requestInputFor(c)));
      expect(variant.split(`${SHORT_REPLIES_TEXT.promptLine}\n`).join("")).toBe(requestText(requestFor("adopted", requestInputFor(c))));
    }
  });
});
