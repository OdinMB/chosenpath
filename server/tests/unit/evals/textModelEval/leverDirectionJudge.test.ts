import { describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import {
  LEVER_CALIBRATION,
  LEVER_CHECK,
  leverEvidenceFrom,
  leverJudgeCaseId,
  leverJudgeJobs,
  leverJudgeRequest,
  leverJudgeSchema,
  leverLabelsFrom,
  leverTally,
  leverVerdictFrom,
  scoreLeverCalibration,
} from "../../../../src/evals/textModelEval/leverDirectionJudge.js";
import { JUDGE_ARMS } from "../../../../src/evals/textModelEval/judgedChecks.js";

/*
 * The lever-direction stage's judged check (2026-09-30, fix 3 of the second
 * playthroughs' review): one cheap GPT-6 call per setup asks leversRunRightWay:
 * every sacrifice leaves the player worse off in its stat and every reward
 * better off, whichever way the stat runs. The judge reads each stat that has
 * a lever (its name, whose it is, type, values, tooltip, effects, thresholds,
 * changes after chapters, sacrifice and reward), says for each which way is
 * better for the player and what each lever does, then answers; never the
 * prompt, so production's setup and the variant read alike.
 */

const stat = (name: string, sacrifice: string, reward: string, extra: Record<string, unknown> = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, "_"),
  name,
  type: "percentage",
  possibleValues: "",
  initialValue: 50,
  tooltip: `${name} tooltip.`,
  effectOnPoints: [`Above 70%: ${name} effect.`],
  narrativeImplications: [`At 70%: ${name} threshold.`],
  adjustmentsAfterThreads: [`+10% after ${name} thread.`],
  optionsToSacrifice: sacrifice,
  optionsToGainAsReward: reward,
  ...extra,
});

const SETUP = {
  title: "The Mouse and the Secret House",
  sharedStats: [
    stat("Cat's Nearness", "Give up 10% Cat's Nearness by making a noisy distraction.", "Gain 10% Cat's Nearness by pausing to hide."),
    stat("Scoreboard", "None", "None"),
  ],
  playerStats: [stat("Mouse Smarts", "Give up one step of Mouse Smarts.", "None", { type: "string", possibleValues: "Quick Thinker, Clever Planner, Passage Expert", initialValue: "Clever Planner" })],
};

describe("the judge's request", () => {
  it("lists every stat with a lever, shared then player, with what shows which way it runs, and asks the question", () => {
    const request = leverJudgeRequest(SETUP);
    const prompt = request?.prompt ?? "";
    expect(prompt).toContain("The Mouse and the Secret House");
    expect(prompt).toContain("Stat 1: Cat's Nearness (a shared stat");
    expect(prompt).toContain("Stat 2: Mouse Smarts (a player stat");
    expect(prompt).not.toContain("Scoreboard");
    for (const passage of [
      "Cat's Nearness tooltip.",
      "Above 70%: Cat's Nearness effect.",
      "At 70%: Cat's Nearness threshold.",
      "+10% after Cat's Nearness thread.",
      "Sacrifice: Give up 10% Cat's Nearness by making a noisy distraction.",
      "Reward: Gain 10% Cat's Nearness by pausing to hide.",
      "Quick Thinker, Clever Planner, Passage Expert",
      "Reward: None",
    ]) {
      expect(prompt).toContain(passage);
    }
    expect(prompt).toContain(LEVER_CHECK);
    expect(prompt.indexOf("Stat 1:")).toBeLessThan(prompt.indexOf("Stat 2:"));
  });

  it("asks nothing of a setup without a lever", () => {
    expect(leverJudgeRequest({ sharedStats: [stat("A", "None", "None")], playerStats: [] })).toBeUndefined();
    expect(leverJudgeRequest({})).toBeUndefined();
  });
});

describe("reading the judge's reply (prompt v2: the judge says which way is better and which way each lever moves its stat; the game reads what each lever does)", () => {
  const reply = (levers: { stat: string; moreIs: string; sacrificeMoves: string; rewardMoves: string }[]) => ({ levers: levers.map((l) => ({ ...l, why: "because" })) });
  const LABELLED = reply([
    // A sacrifice that lowers a stat where more is worse helps the player, a reward that raises it costs them
    { stat: "Cat's Nearness", moreIs: "worse for the player", sacrificeMoves: "lowers it", rewardMoves: "raises it" },
    { stat: "Heat", moreIs: "worse for the player", sacrificeMoves: "raises it", rewardMoves: "none or unclear" },
    { stat: "Crumbs", moreIs: "better for the player", sacrificeMoves: "lowers it", rewardMoves: "raises it" },
    // Neither way better: no lever on it runs backwards
    { stat: "Mood", moreIs: "neither", sacrificeMoves: "raises it", rewardMoves: "lowers it" },
    { stat: "Fuel", moreIs: "better for the player", sacrificeMoves: "raises it", rewardMoves: "raises it" },
  ]);

  it("reads what each lever does to the player from which way is better and which way it moves", () => {
    expect(leverLabelsFrom(LABELLED)).toEqual([
      { stat: "Cat's Nearness", moreIs: "worse for the player", sacrifice: "helps the player", reward: "costs the player" },
      { stat: "Heat", moreIs: "worse for the player", sacrifice: "costs the player", reward: "none or unclear" },
      { stat: "Crumbs", moreIs: "better for the player", sacrifice: "costs the player", reward: "helps the player" },
      { stat: "Mood", moreIs: "neither", sacrifice: "neither way", reward: "neither way" },
      { stat: "Fuel", moreIs: "better for the player", sacrifice: "helps the player", reward: "helps the player" },
    ]);
  });

  it("passes a setup when no lever runs backwards; none where the judge labelled nothing", () => {
    expect(leverVerdictFrom(LABELLED)).toBe(false);
    expect(leverVerdictFrom(reply([{ stat: "Heat", moreIs: "worse for the player", sacrificeMoves: "raises it", rewardMoves: "lowers it" }]))).toBe(true);
    expect(leverVerdictFrom(reply([]))).toBeUndefined();
    expect(leverVerdictFrom({})).toBeUndefined();
  });

  it("counts the levers on stats where more is worse, and those that run backwards anywhere", () => {
    // Levers: every sacrifice and reward that moves its stat; on a stat where neither way is better none runs backwards
    expect(leverTally(leverLabelsFrom(LABELLED))).toEqual({ levers: 9, backwards: 3, onWorse: 3, backwardsOnWorse: 2, statsWorse: 2 });
    expect(leverEvidenceFrom(LABELLED).lines).toEqual([
      "Cat's Nearness (more is worse for the player): sacrifice lowers it, helps the player; reward raises it, costs the player",
      "Heat (more is worse for the player): sacrifice raises it, costs the player; reward none or unclear",
      "Crumbs (more is better for the player): sacrifice lowers it, costs the player; reward raises it, helps the player",
      "Mood (more is neither): sacrifice raises it, neither way; reward lowers it, neither way",
      "Fuel (more is better for the player): sacrifice raises it, helps the player; reward raises it, helps the player",
    ]);
    expect(leverEvidenceFrom(LABELLED).evidence).toBe("Cat's Nearness: sacrifice helps the player, reward costs the player; Fuel: sacrifice helps the player");
  });

  it("asks for which way each lever moves its stat, read from the lever's words, not whether its story action sounds good", () => {
    const prompt = leverJudgeRequest(SETUP)?.prompt ?? "";
    expect(prompt).toMatch(/never from whether its story action sounds good or bad/);
    expect(prompt).toMatch(/a step further along a stat's list of values/);
    expect(Object.keys(leverJudgeSchema().shape)).toEqual(["levers"]);
    expect(JSON.stringify(toJsonSchema(leverJudgeRequest(SETUP)?.schema ?? leverJudgeSchema()))).toContain("sacrificeMoves");
  });
});

describe("the judge calls", () => {
  it("send each target at its samples, keyed by the prompt version, booked to the stage under its tag", () => {
    const request = leverJudgeRequest(SETUP);
    if (!request) throw new Error("no request");
    const jobs = leverJudgeJobs([{ key: "abc", request, samples: 2 }], JUDGE_ARMS[0], "adopted10", "lever-direction");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.promptState, j.first.role])).toEqual([
      [leverJudgeCaseId("abc"), 1, "lever-direction", "adopted10", "setup"],
      [leverJudgeCaseId("abc"), 2, "lever-direction", "adopted10", "setup"],
    ]);
    // Prompt v2 (the calibration's one fix): v1's records stay under their own keys
    expect(leverJudgeCaseId("abc")).toBe("judge-levers-v2-abc");
    expect(leverJudgeCaseId("abc", 1)).toBe("judge-levers-v1-abc");
  });
});

describe("the calibration", () => {
  it("holds hand-read stored setups by output id, at least three on each side", () => {
    const ids = LEVER_CALIBRATION.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(LEVER_CALIBRATION.map((i) => i.output)).size).toBe(ids.length);
    for (const item of LEVER_CALIBRATION) expect(item.output).toMatch(/^[0-9a-f]{20}$/);
    expect(LEVER_CALIBRATION.filter((i) => i.hand === true).length).toBeGreaterThanOrEqual(3);
    expect(LEVER_CALIBRATION.filter((i) => i.hand === false).length).toBeGreaterThanOrEqual(3);
  });

  it("scores sample 1 against the hand, the two samples against each other, and leaves partial items out", () => {
    const items = [
      { id: "a", hand: true },
      { id: "b", hand: false },
      { id: "c", hand: "partial" as const },
    ];
    const scored = scoreLeverCalibration(items, [
      { itemId: "a", samples: [true, true] },
      { itemId: "b", samples: [true, false] },
      { itemId: "c", samples: [false, false] },
    ]);
    expect(scored).toMatchObject({ decided: 2, agree: 1, falsePasses: 1, falseFails: 0, pairs: 3, pairsAgree: 2, partial: { yes: 0, no: 1 }, reliable: false });
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const haveOutputs = fs.existsSync(path.join(DIR, "outputs"));

describe("the calibration's stored setups (skipped where the output folder is absent)", () => {
  (haveOutputs ? it : it.skip)("each is a stored setup with at least one lever, so the judge gets a request", () => {
    for (const item of LEVER_CALIBRATION) {
      const file = path.join(DIR, "outputs", `${item.output}.json`);
      expect([item.id, fs.existsSync(file)]).toEqual([item.id, true]);
      const parsed = (JSON.parse(fs.readFileSync(file, "utf-8")) as { parsed?: unknown }).parsed;
      expect([item.id, leverJudgeRequest(parsed) !== undefined]).toEqual([item.id, true]);
    }
  });
});
