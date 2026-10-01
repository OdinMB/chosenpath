import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import {
  LATE_PACING_CASES,
  LATE_PACING_PROMPT_STATE,
  OUTCOME_SETTLED_CASES,
  armsFor,
  pipelinePlans,
  stageChecksTurns,
  stageInterleavesArms,
  stagePlansCase,
} from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { continuationStart } from "../../../../src/evals/textModelEval/latePacingPlay.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { pacedLengths } from "../../../../src/game/services/storyTextRounds/latePacing.js";
import { LATE_PACING_STARTS, LATE_PACING_SWITCH_SPECS, latePacingCases, latePacingRetestCases } from "../../../../src/evals/textModelEval/latePacingCases.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { chaptersThatFit, outcomeNeeds, turnsLeft } from "../../../../src/game/services/pacing.js";

/*
 * The late-pacing stage's cases (2026-10-01, fix 8 of the second playthroughs'
 * review): the switch plans where a story instruction or a spare thread meets
 * pacing, from the second round's stored runs, rebuilt by replaying each run
 * and frozen as round cases, each only where its request is the one the run
 * sent; the starts of the short playthroughs (the stored story replayed to the
 * chapter plan where the lengths decided whether the last chapter kept a
 * milestone, then played on); and the stored endings the turn's payoff line is
 * read on (the outcome-settled stage's, frozen already).
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the stage's arms", () => {
  it("run production's and the variant's switch planners twice on the switch cases, and their turns twice on the stored endings", () => {
    expect(armsFor("late-pacing", "switch").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])]])).toEqual([
      ["gpt-6-luna@low/adopted", 2, "all", [...LATE_PACING_CASES.switches]],
      ["gpt-6-luna@low/latePacing", 2, "all", [...LATE_PACING_CASES.switches]],
      // The fix-and-retest: B twice on the stored switches, and production, the variant and B four times on the variant's
      // own switch where it gave the last thread to the complete contract
      ["gpt-6-luna@low/latePacingB", 2, "all", [...LATE_PACING_CASES.switches]],
      ["gpt-6-luna@low/adopted", 4, "all", [...LATE_PACING_CASES.retest]],
      ["gpt-6-luna@low/latePacing", 4, "all", [...LATE_PACING_CASES.retest]],
      ["gpt-6-luna@low/latePacingB", 4, "all", [...LATE_PACING_CASES.retest]],
    ]);
    expect(LATE_PACING_CASES.retest).toEqual(["round-late-switch-food-trucks-variant-t21"]);
    expect(stagePlansCase("money-adds-up", LATE_PACING_CASES.retest[0])).toBe(false);
    expect(stagePlansCase("late-pacing", LATE_PACING_CASES.retest[0])).toBe(true);
    expect(armsFor("late-pacing", "beat").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])]])).toEqual([
      ["gpt-6-luna@medium/adopted", 2, "single-player", [...LATE_PACING_CASES.endings]],
      ["gpt-6-luna@medium/latePacing", 2, "single-player", [...LATE_PACING_CASES.endings]],
      ["gpt-6-luna@low/adopted", 2, "multiplayer", [...LATE_PACING_CASES.endings]],
      ["gpt-6-luna@low/latePacing", 2, "multiplayer", [...LATE_PACING_CASES.endings]],
    ]);
    for (const role of ["setup", "thread", "iteration"] as const) expect(armsFor("late-pacing", role)).toEqual([]);
    expect(pipelinePlans("late-pacing")).toEqual([]);
    expect(stageInterleavesArms("late-pacing")).toBe(true);
    expect(stageChecksTurns("late-pacing")).toBe(false);
    expect(LATE_PACING_PROMPT_STATE).toBe("adopted15");
  });

  it("reads the stored endings of the outcome-settled stage", () => {
    expect([...LATE_PACING_CASES.endings].sort()).toEqual(
      [...OUTCOME_SETTLED_CASES.single, ...OUTCOME_SETTLED_CASES.groups].filter((id) => /-t(26|11)$/.test(id) && !id.includes("kids")).sort()
    );
    for (const id of LATE_PACING_CASES.endings) expect(stagePlansCase("late-pacing", id)).toBe(true);
  });
});

describe("the stage's own cases", () => {
  it("names each switch case once, as the stage plans them, each only from the stage on", () => {
    const ids = LATE_PACING_SWITCH_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...LATE_PACING_CASES.switches].sort());
    for (const spec of LATE_PACING_SWITCH_SPECS) {
      expect(spec.id.startsWith("round-late-switch-")).toBe(true);
      expect(spec.role).toBe("switch");
      expect(stagePlansCase("money-adds-up", spec.id)).toBe(false);
      expect(stagePlansCase("late-pacing", spec.id)).toBe(true);
    }
  });

  it("starts the short playthroughs at the chapter plans where the lengths decided the last chapter", () => {
    expect(LATE_PACING_STARTS.map((s) => [s.story, s.turn])).toEqual([
      ["play-avalon", 17],
      ["play-food-trucks", 17],
      ["play-estate-agents", 13],
    ]);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];
const playRuns: PlayRun[] = fs.existsSync(path.join(DIR, "late-pacing.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "late-pacing.json"), "utf-8"))) : [];
const storedHashes = (() => {
  const file = path.join(DIR, "prep-calls.jsonl");
  if (!fs.existsSync(file)) return new Map<string, string>();
  const records = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { outputFile?: string; promptHash?: string });
  return new Map(records.flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
})();

describe("latePacingCases on the second round's stored playthroughs (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("builds every switch case, each request the one production sent, each where pacing meets an instruction or a spare thread", () => {
    const { cases, problems } = latePacingCases(stored2, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(LATE_PACING_SWITCH_SPECS.map((s) => s.id));
    const most = (id: string) => {
      const story = caseStory(cases.find((c) => c.id === id) as never, false);
      return { fit: chaptersThatFit(turnsLeft(story)), needs: story.getPlayerSlots().map((slot) => outcomeNeeds(story, slot, true).reduce((sum, n) => sum + n.stillNeeded, 0)) };
    };
    // The space pirates' switches after the ship's integrity fell to its threshold: the scout needs 2, with 3 and 2 threads left
    expect(most("round-late-switch-space-pirates-t14")).toEqual({ fit: 3, needs: [1, 1, 2] });
    expect(most("round-late-switch-space-pirates-t18")).toEqual({ fit: 2, needs: [1, 1, 2] });
    // The spare threads where production's last chapter settled nothing: one milestone, two threads
    expect(most("round-late-switch-avalon-t20")).toEqual({ fit: 2, needs: [1] });
    expect(most("round-late-switch-food-trucks-t20")).toEqual({ fit: 2, needs: [1, 1] });
    expect(most("round-late-switch-estate-agents-t19")).toEqual({ fit: 2, needs: [0, 1] });
    expect(cases.map((c) => c.tags.category)).toEqual(LATE_PACING_SWITCH_SPECS.map(() => "late-pacing"));
  });

  (stored2.length && playRuns.length ? it : it.skip)("builds the retest's case from the variant's own food-trucks playthrough, its request the one the variant sent", () => {
    const { cases, problems } = latePacingRetestCases(playRuns, (file) => storedHashes.get(outputIdOf(file)));
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual([...LATE_PACING_CASES.retest]);
    const story = caseStory(cases[0] as never, false);
    expect(story.getCurrentTurn() + 1).toBe(21);
    // One thread fits; each player still needs one milestone; the contract is complete
    expect(chaptersThatFit(turnsLeft(story))).toBe(1);
    expect(story.getPlayerSlots().map((slot) => outcomeNeeds(story, slot, true).reduce((sum, n) => sum + n.stillNeeded, 0))).toEqual([1, 1]);
    expect(cases[0].note).toContain("the variant's own short playthrough");
  });

  (stored2.length ? it : it.skip)("starts each short playthrough at the state the stored chapter plan saw, where only the variant's lengths keep the last chapter a milestone", () => {
    const expected: Record<string, { stored: number; paced: number[] }> = {
      "play-avalon": { stored: 3, paced: [4] },
      "play-food-trucks": { stored: 3, paced: [4] },
      "play-estate-agents": { stored: 2, paced: [3, 4] },
    };
    for (const start of LATE_PACING_STARTS) {
      const run = stored2.find((r) => r.spec.id === start.story && r.sample === 1) as PlayRun;
      const { story, policies } = continuationStart(run, start.turn);
      const played = run.turns.find((t) => t.turn === start.turn);
      // The chapter planner's request the run sent there (planner v2f), byte for byte
      const sent = sha256(requestText(requestFor("planV2f", { role: "thread", story })));
      expect([start.story, sent]).toEqual([start.story, storedHashes.get(outputIdOf(played?.plan?.calls[0]?.outputFile ?? ""))]);
      expect((played?.plan?.plan as { duration: number }).duration).toBe(expected[start.story].stored);
      expect([start.story, pacedLengths(story).lengths]).toEqual([start.story, expected[start.story].paced]);
      expect(Object.keys(policies).sort()).toEqual(story.getPlayerSlots().sort());
    }
  });
});
