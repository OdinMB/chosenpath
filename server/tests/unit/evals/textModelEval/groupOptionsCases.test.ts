import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import {
  GROUP_LEVERS_PROMPT_STATE,
  GROUP_OPTIONS_CASES,
  GROUP_OPTIONS_PROMPT_STATE,
  PLAYTHROUGHS_3_PROMPT_STATE,
  armsFor,
  referenceKey,
  stageChecksTurns,
  stageInterleavesArms,
  stagePlansCase,
} from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { GROUP_OPTIONS_CASE_SPECS, groupOptionsCases, groupOptionsCasesToFreeze, playthroughs3Sent } from "../../../../src/evals/textModelEval/groupOptionsCases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { productionSends } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { groupLeverSlots } from "../../../../src/game/services/optionRules.js";
import { chapterLevers } from "../../../../src/game/services/storyTextRounds/turnOptionsContinuity.js";
import { groupOptionsBase, groupOptionsRequest, groupOptionsRule, groupRateLine } from "../../../../src/game/services/storyTextRounds/groupOptions.js";
import { fakeCall, input } from "./playFixtures.js";
import { beforeResultWords, beforeSharedScenes } from "../../../helpers/adoptedDeltas.js";

/*
 * The group-options stage's cases (decision A, the evening of 2026-10-01): group
 * chapter steps of the third round's stored runs (playthroughs-3.json) where a
 * player is in a challenge or contest thread, chosen where earlier sacrifices
 * and rewards make the owner's rules read differently from B6's rate line,
 * rebuilt by replaying each run (playthroughReplay.ts) and frozen as round
 * cases, each only where its request is the one production sent there, byte
 * for byte (production's turn is unchanged since that run).
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("groupOptionsCases on a played fake group story", () => {
  it("freezes a group's chapter step as its input, category group-options", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    const byId = new Map(calls.map((c: PlayCallSpec) => [c.caseId, sha256(requestText(c.request))]));
    const hashOf = (outputFile: string) => byId.get(outputIdOf(outputFile));
    const step = run.turns.find((t) => t.kind === "chapter step");
    expect(step).toBeDefined();
    const specs = [{ id: "round-options-fake", story: PLAYTHROUGHS[2].id, turn: step?.turn ?? 0, role: "beat" as const, purpose: "A chapter step." }];
    // A run played through today's code sent production's request as it is now
    const { cases, problems } = groupOptionsCases([run], hashOf, specs, productionSends);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis, c.tags.source, c.tags.category, c.tags.players])).toEqual([["round-options-fake", "beat", undefined, "round", "group-options", 2]]);
    expect(groupLeverSlots(caseStory(cases[0])).length).toBeGreaterThan(0);
    expect(groupOptionsCasesToFreeze(cases, [run], hashOf, false, specs, productionSends).skipped).toEqual(["round-options-fake"]);
    // The third round's runs sent production's group turn before the group-options adoption
    expect(groupOptionsCases([run], hashOf, specs).problems).toEqual([`round-options-fake: its request is not the one the run sent at turn ${step?.turn} of play-food-trucks`]);
  });
});

describe("the stage's arms", () => {
  it("run production's group turn and the variant twice on every case on the group turn model, interleaved, each turn with production's one checked retry, under a tag of their own", () => {
    const all = [...GROUP_OPTIONS_CASES].sort().join(",");
    expect(armsFor("group-options", "beat").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])].sort().join(",")])).toEqual([
      ["gpt-6-luna@low/adopted", 2, "multiplayer", all],
      ["gpt-6-luna@low/groupOptions", 2, "multiplayer", all],
    ]);
    for (const role of ["setup", "switch", "thread", "iteration"] as const) expect(armsFor("group-options", role)).toEqual([]);
    expect(referenceKey("gpt-6-luna@low/groupOptions")).toBe("gpt-6-luna@low/adopted");
    expect(stageInterleavesArms("group-options")).toBe(true);
    expect(stageChecksTurns("group-options")).toBe(true);
    expect(GROUP_OPTIONS_PROMPT_STATE).toBe("adopted23");
    expect([GROUP_LEVERS_PROMPT_STATE, PLAYTHROUGHS_3_PROMPT_STATE]).not.toContain(GROUP_OPTIONS_PROMPT_STATE);
  });
});

describe("the stage's own cases", () => {
  it("names each once, as the stage plans them, and each only from the stage on", () => {
    const ids = GROUP_OPTIONS_CASE_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...GROUP_OPTIONS_CASES].sort());
    expect(ids).toHaveLength(12);
    for (const spec of GROUP_OPTIONS_CASE_SPECS) {
      expect(spec.id.startsWith("round-options-")).toBe(true);
      expect(spec.role).toBe("beat");
      expect(["play-food-trucks", "play-estate-agents", "play-space-pirates"]).toContain(spec.story);
      expect(stagePlansCase("group-levers", spec.id)).toBe(false);
      expect(stagePlansCase("playthroughs-3", spec.id)).toBe(false);
      expect(stagePlansCase("group-options", spec.id)).toBe(true);
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

describe("groupOptionsCases on the third round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored3.length ? it : it.skip)("builds every case, each request the one production sent, the base the variant builds on; production since the adoption sends the variant; the owner's rules and B6's rate read differently on most rolled sets", () => {
    const { cases, problems } = groupOptionsCases(stored3, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(GROUP_OPTIONS_CASE_SPECS.map((s) => s.id));
    const rules: string[] = [];
    let earlierSacrifice = 0;
    for (const c of cases) {
      const story = caseStory(c);
      // The run sent the variant's base (production before the adoption; since the scenes adoption after it, without that
      // stage's insertions on a step with several threads, and since the result-words adoption of 2026-10-02 without its
      // line on a later step); production today sends the measured variant
      expect([c.id, sha256(playthroughs3Sent(requestInputFor(c)))]).toEqual([c.id, sha256(beforeResultWords(beforeSharedScenes(groupOptionsBase(story).prompt, story), story))]);
      expect([c.id, sha256(requestText(requestFor("adopted", requestInputFor(c))))]).toEqual([c.id, sha256(groupOptionsRequest(story).prompt)]);
      for (const slot of groupLeverSlots(story)) {
        const rule = groupOptionsRule(story, slot);
        // B6's rate line, production's group line until the adoption (groupRateLine)
        const rate = groupRateLine(story, slot);
        rules.push(`${rule.ownersRoll ? "owner" : rule.reward ? "reward" : rule.sacrifice}|${rate.endsWith("none this turn.") ? "none" : /prefer a reward/.test(rate) ? "prefer reward" : /prefer a sacrifice/.test(rate) ? "prefer sacrifice" : "fits"}`);
        // A sacrifice the player was offered earlier: in this chapter, or in the story before it
        const history = story.getPlayer(slot)?.beatHistory ?? [];
        if (chapterLevers(story, slot).sacrifices > 0 || history.some((b) => (b.options ?? []).some((o) => o.resourceType === "sacrifice"))) earlierSacrifice++;
      }
    }
    const count = (pattern: RegExp) => rules.filter((r) => pattern.test(r)).length;
    // 24 rolled sets a sample: 8 reward turns (5 where B6's rate gives none), 12 where a sacrifice fits and no reward
    // (B6's rate invites a lever of either kind on all 12, a reward preferred on 5), one second-sacrifice set, two none, one
    // owner's roll
    expect(rules).toHaveLength(24);
    expect([count(/^reward\|/), count(/^reward\|none/), count(/^fits\|/), count(/^fits\|none/), count(/^fits\|prefer reward/), count(/^strongReason\|/), count(/^none\|/), count(/^owner\|/)]).toEqual([
      8, 5, 12, 0, 5, 1, 2, 1,
    ]);
    // Every rolled player in these cases was offered a sacrifice before (the cases the owner's rules were built for)
    expect(earlierSacrifice).toBe(24);
  });
});
