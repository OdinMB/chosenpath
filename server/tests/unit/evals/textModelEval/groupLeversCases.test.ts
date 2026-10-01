import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { getThreadType } from "core/types/index.js";
import {
  GROUP_LEVERS_CASES,
  GROUP_LEVERS_PROMPT_STATE,
  KIDS_AGES_PROMPT_STATE,
  armsFor,
  referenceKey,
  secondReferenceKeys,
  stageChecksTurns,
  stageInterleavesArms,
  stagePlansCase,
} from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { GROUP_LEVERS_CASE_SPECS, groupLeversCases, groupLeversCasesToFreeze } from "../../../../src/evals/textModelEval/groupLeversCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { productionSends } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { sacrificeRewardLine } from "../../../../src/game/services/optionRules.js";
import { groupLeverSlots, groupLeversBase, groupLeversRequest, takesGroupLevers } from "../../../../src/game/services/storyTextRounds/groupLevers.js";
import { withShortRepliesLines } from "../../../../src/game/services/storyTextRounds/shortReplies.js";
import { fakeCall, input } from "./playFixtures.js";
import { beforeGroupOptions, beforeLateClues, withOwnersRollLevers } from "../../../helpers/adoptedDeltas.js";

/*
 * The group-levers stage's cases (2026-10-01, the coordinator's brief after the
 * second playthroughs' review): group chapter steps of the second round's
 * stored runs where a player is in a challenge or contest thread, rebuilt by
 * replaying each run (playthroughReplay.ts) and frozen as round cases, each
 * only where its request is the one production sent there, byte for byte.
 * Production's group turn on a chapter step is unchanged since that run.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("groupLeversCases on a played fake group story", () => {
  it("freezes a group's chapter step as its input, category group-levers, where the variant applies", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const step = run.turns.find((t) => t.kind === "chapter step");
    expect(step).toBeDefined();
    const specs = [{ id: "round-levers-fake", story: PLAYTHROUGHS[2].id, turn: step?.turn ?? 0, role: "beat" as const, purpose: "A chapter step." }];
    // A run played through today's code sent production's request as it is now
    const { cases, problems } = groupLeversCases([run], hashOf, specs, productionSends);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis, c.tags.source, c.tags.category, c.tags.players])).toEqual([["round-levers-fake", "beat", undefined, "round", "group-levers", 2]]);
    expect(takesGroupLevers(caseStory(cases[0]))).toBe(true);
    expect(groupLeversCasesToFreeze(cases, [run], hashOf, false, specs, productionSends).skipped).toEqual(["round-levers-fake"]);
    // The second round's runs sent production's group turn before the adoption
    expect(groupLeversCases([run], hashOf, specs).problems).toEqual(["round-levers-fake: its request is not the one the run sent at turn 3 of play-food-trucks"]);
  });
});

describe("the stage's arms", () => {
  it("run production's group turn and the variant twice on every case on the group turn model, interleaved, each turn with production's one checked retry, under a tag of their own; the fix-and-retest twice on every case too", () => {
    const all = [...GROUP_LEVERS_CASES].sort().join(",");
    expect(armsFor("group-levers", "beat").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])].sort().join(",")])).toEqual([
      ["gpt-6-luna@low/adopted", 2, "multiplayer", all],
      ["gpt-6-luna@low/groupLevers", 2, "multiplayer", all],
      ["gpt-6-luna@low/groupLeversB", 2, "multiplayer", all],
    ]);
    expect(referenceKey("gpt-6-luna@low/groupLeversB")).toBe("gpt-6-luna@low/adopted");
    expect(secondReferenceKeys("gpt-6-luna@low/groupLeversB")).toEqual(["gpt-6-luna@low/groupLevers"]);
    for (const role of ["setup", "switch", "thread", "iteration"] as const) expect(armsFor("group-levers", role)).toEqual([]);
    expect(stageInterleavesArms("group-levers")).toBe(true);
    expect(stageChecksTurns("group-levers")).toBe(true);
    expect(referenceKey("gpt-6-luna@low/groupLevers")).toBe("gpt-6-luna@low/adopted");
    expect(GROUP_LEVERS_PROMPT_STATE).toBe("adopted17");
    expect(GROUP_LEVERS_PROMPT_STATE).not.toBe(KIDS_AGES_PROMPT_STATE);
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, and each only from the stage on", () => {
    const ids = GROUP_LEVERS_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...GROUP_LEVERS_CASES].sort());
    expect(ids).toHaveLength(12);
    for (const spec of GROUP_LEVERS_CASE_SPECS) {
      expect(spec.id.startsWith("round-levers-")).toBe(true);
      expect(spec.role).toBe("beat");
      expect(["play-food-trucks", "play-estate-agents", "play-space-pirates"]).toContain(spec.story);
      expect(stagePlansCase("kids-ages", spec.id)).toBe(false);
      expect(stagePlansCase("group-levers", spec.id)).toBe(true);
    }
    // The estate agents' replay is production's story only up to turn 21 (the owner's roll since 2026-10-01)
    for (const spec of GROUP_LEVERS_CASE_SPECS.filter((s) => s.story === "play-estate-agents")) expect(spec.turn).toBeLessThanOrEqual(21);
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

/** The prompt hash the stored run's turn call sent for a case's turn. */
function sentHashOf(id: string): string | undefined {
  const spec = GROUP_LEVERS_CASE_SPECS.find((s) => s.id === id);
  const run = stored2.find((r) => r.spec.id === spec?.story && r.sample === 1);
  const file = run?.turns.find((t) => t.turn === spec?.turn)?.calls[0]?.outputFile;
  return file ? storedHashes.get(outputIdOf(file)) : undefined;
}

describe("groupLeversCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every case, each request the one production sent, the base the variant builds on; production since the adoption sends the measured fix-and-retest (with the group-options lines since that stage); each a group chapter step with a player in a rolled thread", () => {
    const { cases, problems } = groupLeversCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(GROUP_LEVERS_CASE_SPECS.map((s) => s.id));
    const players = new Set<number>();
    const kinds = new Set<string>();
    let exploringBeside = 0;
    let rateNone = 0;
    const ownersRollCases: string[] = [];
    for (const c of cases) {
      const story = caseStory(c);
      // The run sent the variant's base; production today sends groupLeversB (the group-levers adoption, 2026-10-01) with
      // the short-replies stage's lines, adopted later that day, and on a late turn the pacing-clues stage's, later again
      expect([c.id, sha256(beforeLateClues(groupLeversBase(story).prompt, story))]).toEqual([c.id, sentHashOf(c.id)]);
      // Since the review of that day, a player whose roll the step discards gets no lever (withOwnersRollLevers, logged);
      // since the group-options adoption that evening production prints that stage's lines on top (beforeGroupOptions)
      const measured = withShortRepliesLines(groupLeversRequest(story, { b: true })).prompt;
      const production = requestText(requestFor("adopted", requestInputFor(c)));
      expect([c.id, sha256(beforeGroupOptions(production, story))]).toEqual([c.id, sha256(withOwnersRollLevers(measured, story))]);
      expect([c.id, production === beforeGroupOptions(production, story)]).toEqual([c.id, false]);
      if (withOwnersRollLevers(measured, story) !== measured) ownersRollCases.push(c.id);
      const slots = groupLeverSlots(story);
      expect([c.id, slots.length > 0]).toEqual([c.id, true]);
      players.add(story.getNumberOfPlayers());
      const threads = story.getCurrentThreadAnalysis()?.threads ?? [];
      for (const t of threads) kinds.add(getThreadType(t));
      if (slots.length < story.getNumberOfPlayers()) exploringBeside++;
      rateNone += slots.filter((slot) => sacrificeRewardLine(story, slot).endsWith("none this turn.")).length;
    }
    expect([...players].sort()).toEqual([2, 3]);
    expect([...kinds].sort()).toEqual(["challenge", "contest", "exploration"]);
    expect(exploringBeside).toBeGreaterThanOrEqual(2);
    expect(rateNone).toBeGreaterThanOrEqual(1);
    // Both agents in a challenge on Nia's own protégé outcome: Rory's roll doesn't count there, so production gives him no lever
    expect(ownersRollCases).toContain("round-levers-estate-agents-t20");
  });
});
