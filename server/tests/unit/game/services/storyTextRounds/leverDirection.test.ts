import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, type GameMode, type PlayerCount } from "core/types/index.js";
import { LEVER_DIRECTION_TEXT, leverDirectionRequest } from "../../../../../src/game/services/storyTextRounds/leverDirection.js";
import { setupStep } from "../../../../../src/game/services/storyTextSteps.js";
import { callLimitsOf, requestFor } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";

/*
 * A sacrifice runs the right way on a stat where more is worse (eval only; fix
 * 3 of the second playthroughs' review, 2026-09-30). Two of the second round's
 * six setups wrote a lever backwards: the mouse story's "Give up 10% Cat's
 * Nearness by making a noisy distraction" moved the cat away (a second benefit
 * beside the sacrifice's +30), and New Avalon's Heartwell Feedback spent a
 * volatility where more is worse. Production's stored setups do it on six of
 * nine premises that name a pressure (Family Pressure, Storm, Dust and Danger,
 * Eclipse Strain, Pursuit Pressure, Corporate Scrutiny). The cause: the lever
 * fields say "What the player gives up from this stat" and "What the player
 * gains of this stat", every example is a stat where more is better, and the
 * stat rules name pressures among the stats to track. The variant is
 * production's setup request with one line in the stat rules and the two lever
 * fields' first sentences worded by what the lever does to the player;
 * production's request byte for byte elsewhere.
 */

const PREMISE = "Two rival bakers share one oven in a floating market";
const INPUTS: [PlayerCount, GameMode][] = [
  [1, GameModes.SinglePlayer],
  ...([2, 3] as PlayerCount[]).flatMap((players) =>
    [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive].map((mode): [PlayerCount, GameMode] => [players, mode])
  ),
];

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
/** A description as it sits inside the JSON schema's text */
const inJson = (text: string) => JSON.stringify(text).slice(1, -1);

/*
 * Adopted on 2026-10-01 (the coordinator's call): production prints the line
 * and the reworded fields, so production is the variant byte for byte; the
 * variant takes production's copies out first (measuredBase), so it builds on
 * production's setup as the stage measured it.
 */
describe("the lever-direction setup", () => {
  it.each(INPUTS)("%i players, %s: production's prompt as measured with the line after the spend-or-earn rule, every length, with and without a child", (players, mode) => {
    const { anchor, line } = LEVER_DIRECTION_TEXT;
    for (const maxTurns of [10, 25]) {
      for (const kids of [false, true]) {
        const production = setupStep.request(PREMISE, players, mode, maxTurns, "story", { kids });
        const variant = leverDirectionRequest(PREMISE, players, mode, maxTurns, "story", { kids });
        // Production as the stage measured it: without the adopted line
        const measured = production.prompt.replace(`${anchor}\n${line}`, anchor);
        expect(occurrences(measured, anchor)).toBe(1);
        expect(occurrences(measured, line)).toBe(0);
        expect(variant.prompt).toBe(measured.replace(anchor, `${anchor}\n${line}`));
        expect(variant.prompt).toBe(production.prompt);
        // In the stat rules, before the rule on what player stats are about
        expect(variant.prompt.indexOf(line)).toBeLessThan(variant.prompt.indexOf("- Player stats are about the person"));
      }
    }
  });

  it.each(INPUTS)("%i players, %s: production's schema as measured with the two lever fields' first sentences reworded", (players, mode) => {
    const { sacrifice, reward } = LEVER_DIRECTION_TEXT;
    for (const kids of [false, true]) {
      const production = json(setupStep.request(PREMISE, players, mode, 25, "story", { kids }).schema);
      const variant = json(leverDirectionRequest(PREMISE, players, mode, 25, "story", { kids }).schema);
      const measured = production.split(inJson(sacrifice.to)).join(inJson(sacrifice.from)).split(inJson(reward.to)).join(inJson(reward.from));
      expect(measured).toContain(inJson(sacrifice.from));
      expect(measured).toContain(inJson(reward.from));
      expect(variant).not.toContain(inJson(sacrifice.from));
      expect(variant).not.toContain(inJson(reward.from));
      expect(variant).toBe(measured.split(inJson(sacrifice.from)).join(inJson(sacrifice.to)).split(inJson(reward.from)).join(inJson(reward.to)));
      expect(variant).toBe(production);
    }
  });

  it("keeps the rest of each lever field: the contest's scoreboard stays 'None' in contest games", () => {
    const contest = json(leverDirectionRequest(PREMISE, 2, GameModes.Competitive, 25, "story").schema);
    expect(contest).toContain("or a contested outcome's scoreboard");
    expect(contest).toContain("The bonus is always the same, so never state it");
    expect(contest).toContain("The gain is certain.");
  });

  it("says a sacrifice costs and a reward helps, and which way each runs on a stat where more is worse", () => {
    const { line, sacrifice, reward } = LEVER_DIRECTION_TEXT;
    expect(line).toMatch(/sacrifice always costs the player and a reward always helps/);
    expect(line).toMatch(/where more is worse for the player/);
    expect(sacrifice.to).toMatch(/worse off/);
    expect(sacrifice.to).toContain("'Spend 10% fuel'");
    expect(reward.to).toMatch(/better off/);
    expect(reward.to).toContain("'Regain 10% health by resting instead of pressing on'");
  });

  it("assembles the reply as production does", () => {
    const reply = { guidelines: { world: "w" }, threadDesign: { typesOfThreads: ["t"] }, playerOutcomes: { player1: [] }, sharedStats: [], playerStats: [] };
    const production = setupStep.request(PREMISE, 1, GameModes.SinglePlayer, 25, "story");
    const variant = leverDirectionRequest(PREMISE, 1, GameModes.SinglePlayer, 25, "story");
    expect(variant.assemble(reply)).toEqual(production.assemble(reply));
  });

  it("is the eval's leverDirection variant, with production's setup limits, for a custom story's setup only", () => {
    const setup = { premise: PREMISE, playerCount: 2 as PlayerCount, gameMode: GameModes.Competitive, maxTurns: 25, kids: true };
    const request = requestFor("leverDirection", { role: "setup", setup });
    const expected = leverDirectionRequest(PREMISE, 2, GameModes.Competitive, 25, "story", { kids: true });
    expect("prompt" in request && request.prompt).toBe(expected.prompt);
    expect(callLimitsOf(request)).toEqual(productionCallLimits("setup", 2));
    expect(callLimitsOf(requestFor("adopted", { role: "setup", setup }))).toEqual(callLimitsOf(request));
    expect(() => requestFor("leverDirection", { role: "iteration", iteration: { template: {}, feedback: "f", sections: ["stats"], playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 10 } })).toThrow(/does not cover/);
  });
});
