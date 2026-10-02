import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, type GameMode, type PlayerCount } from "core/types/index.js";
import { MONEY_SETUP_TEXT, moneySetupRequest } from "../../../../../src/game/services/storyTextRounds/moneySetup.js";
import { setupStep } from "../../../../../src/game/services/storyTextSteps.js";
import { callLimitsOf, requestFor } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";

/*
 * Money and counts in a learning story's setup (eval only; decision A's money
 * fix, the money-2 stage of 2026-10-02). The third playthroughs' lemonade
 * stand never sold a cup: its setup typed Stand Cash as a percentage (50%,
 * "Spend 10% of Stand Cash", "+10% after a favorable thread that earns
 * sales"), so no sum had anywhere to land, and the prose never named one. On
 * production's setup form, 2 of the 5 stored lemonade setups typed the cash as
 * a percentage, and every one of the 5 moved its money by a fixed step after a
 * favorable or unfavorable thread or by a "recorded profit" no text records.
 * The variant is production's setup request with one line at the end of the
 * "This setup" block on a learning story (the setup form's learn-something
 * category): money and counted things in number stats in their own units,
 * moving by what the story pays and earns in the beat where it happens, no
 * fixed step for how a thread went, no payment put off, no worked-out figure
 * as a stat. Every other setup gets production's request byte for byte.
 */

const PREMISE = "We run a bike repair stall at the weekend market";
const INPUTS: [PlayerCount, GameMode][] = [
  [1, GameModes.SinglePlayer],
  ...([2, 3] as PlayerCount[]).flatMap((players) =>
    [GameModes.Cooperative, GameModes.Competitive, GameModes.CooperativeCompetitive].map((mode): [PlayerCount, GameMode] => [players, mode])
  ),
];

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

describe("the money setup", () => {
  it.each(INPUTS)("%i players, %s: a learning story's setup is production's with the line at the end of the This setup block, every length", (players, mode) => {
    const { anchor, line } = MONEY_SETUP_TEXT;
    for (const maxTurns of [10, 25]) {
      const production = setupStep.request(PREMISE, players, mode, maxTurns, "story");
      const variant = moneySetupRequest(PREMISE, players, mode, maxTurns, "story", { learning: true });
      expect(occurrences(production.prompt, anchor)).toBe(1);
      expect(production.prompt).not.toContain(line);
      expect(variant.prompt).toBe(production.prompt.replace(anchor, `\n${line}${anchor}`));
      // The block's last line, right before the premise
      expect(variant.prompt.indexOf(line)).toBeGreaterThan(variant.prompt.indexOf("This setup\n"));
      expect(variant.prompt.indexOf(line)).toBeLessThan(variant.prompt.indexOf("<premise>"));
      expect(json(variant.schema)).toBe(json(production.schema));
    }
  });

  it.each(INPUTS)("%i players, %s: every other setup is production's byte for byte", (players, mode) => {
    for (const options of [{}, { learning: false }, { kids: true }]) {
      const production = setupStep.request(PREMISE, players, mode, 25, "story", options);
      const variant = moneySetupRequest(PREMISE, players, mode, 25, "story", options);
      expect(variant.prompt).toBe(production.prompt);
      expect(json(variant.schema)).toBe(json(production.schema));
    }
  });

  it("says counted things are number stats in their own units, moving by what the story pays and earns, no fixed step for a thread, no payment put off, no worked-out figure as a stat", () => {
    const { line } = MONEY_SETUP_TEXT;
    expect(line).toMatch(/^- This story teaches with its figures\./);
    expect(line).toMatch(/money or other things that are counted/);
    expect(line).toMatch(/number stat, in its own units and never as a percentage/);
    expect(line).toMatch(/effects, thresholds, sacrifice and reward in those units/);
    expect(line).toMatch(/adjustable anytime/);
    expect(line).toMatch(/moves by exactly what the story pays, spends, uses up, sells or earns, in the beat where that happens/);
    expect(line).toMatch(/no fixed amount for a favorable or unfavorable thread/);
    expect(line).toMatch(/no story element or instruction puts a payment off to a thread's end/);
    expect(line).toMatch(/A figure worked out from other figures \(a profit margin, a price per item, an average\) is not a stat/);
    // Its examples come from no premise the stage measures
    expect(line).not.toMatch(/lemon|cup|vote|wolf|deer/i);
  });

  it("assembles the reply as production does", () => {
    const reply = { guidelines: { world: "w" }, threadDesign: { typesOfThreads: ["t"] }, playerOutcomes: { player1: [] }, sharedStats: [], playerStats: [] };
    const production = setupStep.request(PREMISE, 1, GameModes.SinglePlayer, 25, "story");
    const variant = moneySetupRequest(PREMISE, 1, GameModes.SinglePlayer, 25, "story", { learning: true });
    expect(variant.assemble(reply)).toEqual(production.assemble(reply));
  });

  /*
   * Since the stage's adoption (2026-10-02) production's setup on a learning story is this variant byte for byte
   * (adoptedSetup.test.ts), and the eval's adopted setup passes the learning flag as production's story creation does.
   */
  it("is the eval's moneySetup variant, with production's setup limits, for a custom story's setup only; production's adopted setup is it on a learning story", () => {
    const setup = { premise: PREMISE, playerCount: 2 as PlayerCount, gameMode: GameModes.Cooperative, maxTurns: 25, learning: true };
    const request = requestFor("moneySetup", { role: "setup", setup });
    expect("prompt" in request && request.prompt).toBe(moneySetupRequest(PREMISE, 2, GameModes.Cooperative, 25, "story", { learning: true }).prompt);
    expect(callLimitsOf(request)).toEqual(productionCallLimits("setup", 2));
    const adopted = requestFor("adopted", { role: "setup", setup });
    expect("prompt" in adopted && adopted.prompt).toBe(setupStep.request(PREMISE, 2, GameModes.Cooperative, 25, "story", { learning: true }).prompt);
    expect("prompt" in adopted && adopted.prompt).toBe("prompt" in request && request.prompt);
    expect(callLimitsOf(adopted)).toEqual(callLimitsOf(request));
    const unlearned = requestFor("moneySetup", { role: "setup", setup: { ...setup, learning: undefined } });
    const adoptedUnlearned = requestFor("adopted", { role: "setup", setup: { ...setup, learning: undefined } });
    expect("prompt" in unlearned && unlearned.prompt).toBe(setupStep.request(PREMISE, 2, GameModes.Cooperative, 25, "story").prompt);
    expect("prompt" in unlearned && unlearned.prompt).toBe("prompt" in adoptedUnlearned && adoptedUnlearned.prompt);
    expect(() =>
      requestFor("moneySetup", { role: "iteration", iteration: { template: {}, feedback: "f", sections: ["stats"], playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 10 } })
    ).toThrow(/does not cover/);
  });
});
