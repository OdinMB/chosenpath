import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import type { Beat, SetOfBeatGenerationSchema, StoryPhase, ThreadAnalysis } from "core/types/index.js";
import {
  RECORDED_CALIBRATION,
  RECORDED_CHECK,
  recordedEvidenceFrom,
  recordedJudgeCaseId,
  recordedJudgeJobs,
  recordedJudgeRequests,
  recordedVerdictFrom,
  scoreRecordedCalibration,
} from "../../../../src/evals/textModelEval/recordedResultJudge.js";
import { JUDGE_ARMS } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { withEdits } from "../../../../src/evals/textModelEval/outcomeSettledPrep.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { createMockMultiplayerStory, createMockStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, switchAnalysis, thread } from "../../../helpers/textFixtures.js";

/*
 * The recorded-result stage's judged check (2026-09-30, fix 2 of the second
 * playthroughs' review): one cheap GPT-6 call per player in an exploration
 * thread whose recorded result the turn narrates asks recordedResultTold: the
 * player's text shows the player doing the result the game recorded (their
 * choice, a change of course from an earlier step included), and nothing in
 * the text, the chapter's milestone or the facts the turn records tells
 * another of the step's results or blends two. The judge reads the step (its
 * question, its three results with the recorded one marked, the option picked),
 * the earlier steps' recorded results, the milestone the turn adds on the
 * thread's outcome, the facts and the player's text; never the prompt.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const RESULTS = {
  resolution1: "Mara keeps the recipe card locked in her tin.",
  resolution2: "Mara shares the recipe with Jonah.",
  resolution3: "Mara enters the recipe under her own name.",
};

function history(slot: string, length: number, picked: number): Beat[] {
  return Array.from({ length }, (_, i) => ({
    ...beatGeneration({ text: `${slot} text ${i}` }),
    options: [1, 2, 3].map((n) => ({ optionType: "exploration" as const, resourceType: "normal" as const, text: `${slot} option ${n}: ${Object.values(RESULTS)[n - 1]}` })),
    choice: i === length - 1 ? picked : 0,
    resolution: i === length - 1 ? null : ("resolution1" as const),
  }));
}

/** An exploration chapter on player1's recipe outcome, `done` of `duration` steps played (resolution1, then resolution2). */
function recipeChapter(duration: number, firstBeatIndex: number, done: number, players: string[]): ThreadAnalysis {
  const t = thread("exploration", duration, firstBeatIndex, players);
  const recorded = ["resolution1", "resolution2", "resolution2"] as const;
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration,
    firstBeatIndex,
    threads: [
      {
        ...t,
        id: "the_recipe",
        title: "The Recipe",
        outcomeId: "player1_recipe",
        possibleMilestones: RESULTS,
        progression: t.progression.map((step, k) => ({ ...step, question: `Step ${k + 1}: What does Mara do with the recipe?`, possibleResolutions: RESULTS, resolution: k < done ? recorded[k] : null })),
        ...(done === duration ? { resolution: recorded[done - 1], milestone: RESULTS.resolution2 } : {}),
      },
    ],
  };
}

function storyAt(players: number, turns: number, phases: StoryPhase[]): Story {
  const base = (players > 1 ? createMockMultiplayerStory(players) : createMockStory()).getState();
  const withHistory = Object.fromEntries(Object.entries(base.players).map(([slot, player]) => [slot, { ...player, beatHistory: history(slot, turns, 1) }]));
  return Story.create({ ...base, title: "The Bake-Off", players: withHistory, storyPhases: phases, maxTurns: 20 });
}

/** The switch turn after a two-step exploration chapter (step 1 resolution1, step 2 resolution2 picked and recorded). */
const switchAfter = (players = 1) => {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  return storyAt(players, 3, [switchAnalysis(slots, 0), recipeChapter(2, 1, 2, ["player1"]), switchAnalysis(slots, 3)]);
};
/** Step 2 of a three-step exploration chapter, step 1 played. */
const stepAfter = () => storyAt(1, 3, [switchAnalysis(["player1"], 1), recipeChapter(3, 2, 1, ["player1"])]);

function reply(slots: string[], milestone = "Mara hands Jonah the recipe card."): SetOfBeatGenerationSchema {
  const beats = Object.fromEntries(
    slots.map((slot) => {
      const beat = beatGeneration({ text: `[image id=kitchen source=story desc="Kitchen"] ${slot}: Mara slides the card across the counter to Jonah.\n\nJonah reads it twice.` });
      beat.plan.establishedFacts = [{ type: "newFact", storyElementId: "world", fact: `The recipe card now sits in Jonah's apron (${slot}).` }];
      return [slot, beat];
    })
  );
  return { statChanges: [], newMilestones: [{ type: "newMilestone", outcomeGroup: "player1", outcome: "player1_recipe", newMilestone: milestone }], ...beats } as unknown as SetOfBeatGenerationSchema;
}

describe("the judge's requests", () => {
  it("read the step, its results with the recorded one marked, the option picked, the earlier step, the milestone, the facts and the text; never the prompt", () => {
    const requests = recordedJudgeRequests(switchAfter(), reply(["player1"]));
    expect(requests.map((r) => [r.slot, r.threadId])).toEqual([["player1", "the_recipe"]]);
    const prompt = requests[0].request.prompt;
    expect(prompt).toContain("The Bake-Off");
    expect(prompt).toContain("Step 2: What does Mara do with the recipe?");
    expect(prompt).toContain("result 2 (recorded: the player's choice): Mara shares the recipe with Jonah.");
    expect(prompt).toContain("result 1: Mara keeps the recipe card locked in her tin.");
    expect(prompt).toContain("player1 option 2: Mara shares the recipe with Jonah.");
    expect(prompt).toContain("Step 1 recorded result 1: Mara keeps the recipe card locked in her tin.");
    expect(prompt).toContain("Mara hands Jonah the recipe card.");
    expect(prompt).toContain("The recipe card now sits in Jonah's apron (player1).");
    expect(prompt).toContain("[1] player1: Mara slides the card across the counter to Jonah.");
    expect(prompt).not.toContain("[image");
    expect(prompt).toContain(RECORDED_CHECK);
    expect(prompt).not.toContain("NEW MILESTONES");
  });

  it("say on a chapter step that the chapter goes on, with no milestone", () => {
    const [request] = recordedJudgeRequests(stepAfter(), reply(["player1"]));
    expect(request.request.prompt).toContain("none: the chapter goes on");
    expect(request.request.prompt).not.toContain("Mara hands Jonah the recipe card.");
  });

  it("judge only the players of the exploration thread, and none where the turn narrates no exploration result", () => {
    const group = recordedJudgeRequests(switchAfter(2), reply(["player1", "player2"]));
    expect(group.map((r) => r.slot)).toEqual(["player1"]);
    expect(group[0].request.prompt).not.toContain("player2: Mara slides");
    const first = storyAt(1, 0, [switchAnalysis(["player1"], 0)]);
    expect(recordedJudgeRequests(first, reply(["player1"]))).toEqual([]);
  });
});

describe("the judge's answers and calls", () => {
  it("reads yes and no, and the judge's readings", () => {
    const parsed = {
      text: { result: "1", quote: "keeps the card in her tin" },
      milestone: { result: "a blend", quote: "shares it but keeps it locked" },
      facts: [{ fact: "the card stays in the tin", result: "1" }],
      [RECORDED_CHECK]: { evidence: "the text keeps the earlier course", answer: "no" },
    };
    expect(recordedVerdictFrom(parsed)).toBe(false);
    expect(recordedVerdictFrom({ [RECORDED_CHECK]: { answer: "yes" } })).toBe(true);
    expect(recordedVerdictFrom({})).toBeUndefined();
    const said = recordedEvidenceFrom(parsed);
    expect(said.evidence).toBe("the text keeps the earlier course");
    expect(said.lines.join(" | ")).toContain("text: result 1");
    expect(said.lines.join(" | ")).toContain("milestone: a blend");
    expect(said.lines.join(" | ")).toContain("the card stays in the tin");
  });

  it("keys each call by the prompt version and books it to the stage", () => {
    const [target] = recordedJudgeRequests(switchAfter(), reply(["player1"]));
    const jobs = recordedJudgeJobs([{ key: "abc", request: target.request, samples: 2 }], JUDGE_ARMS[0], "adopted9", "recorded-result");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.promptState])).toEqual([
      [recordedJudgeCaseId("abc"), 1, "recorded-result", "adopted9"],
      [recordedJudgeCaseId("abc"), 2, "recorded-result", "adopted9"],
    ]);
    expect(recordedJudgeCaseId("abc")).toBe("judge-recorded-v1-abc");
  });
});

describe("the calibration", () => {
  it("is reliable only with three hand yes and three hand no, 85% agreement on each and 90% between samples", () => {
    const items = [true, true, true, false, false, false, "partial" as const].map((hand, i) => ({ id: `i${i}`, hand }));
    const agreeing = items.map((item) => ({ itemId: item.id, samples: [item.hand === "partial" ? true : item.hand, item.hand === "partial" ? true : item.hand] as (boolean | undefined)[] }));
    const all = scoreRecordedCalibration(items, agreeing);
    expect([all.check, all.decided, all.agree, all.handPasses, all.handFails, all.pairs, all.pairsAgree, all.partial.yes, all.reliable]).toEqual([RECORDED_CHECK, 6, 6, 3, 3, 7, 7, 1, true]);
    const oneWrong = agreeing.map((j) => (j.itemId === "i3" ? { ...j, samples: [true, true] } : j));
    expect(scoreRecordedCalibration(items, oneWrong).reliable).toBe(false);
  });

  it("holds hand-read items, each id once, at least three yes and three no, each naming its player", () => {
    const ids = RECORDED_CALIBRATION.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RECORDED_CALIBRATION.filter((i) => i.hand === true).length).toBeGreaterThanOrEqual(3);
    expect(RECORDED_CALIBRATION.filter((i) => i.hand === false).length).toBeGreaterThanOrEqual(3);
    for (const item of RECORDED_CALIBRATION) expect(item.slot).toMatch(/^player[1-3]$/);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];

describe("the calibration's stored turns (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("each replays to a turn that narrates its player's recorded exploration result, and the judge can read it, a constructed version's edits applied", () => {
    for (const item of RECORDED_CALIBRATION) {
      if (!("story" in item)) continue;
      const { before, played } = replayedTurn(stored2, item.story, item.turn);
      const reply = withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []);
      const target = recordedJudgeRequests(before, reply).find((r) => r.slot === item.slot);
      expect([item.id, target !== undefined]).toEqual([item.id, true]);
      for (const [, to] of item.edits ?? []) expect([item.id, target?.request.prompt.includes(to)]).toEqual([item.id, true]);
    }
  });
});
