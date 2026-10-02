import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { GameModes } from "core/types/index.js";
import {
  MONEY_2_SETUP_VARIANTS,
  MONEY_2_SPECS,
  amountSentences,
  money2BlindKey,
  money2Code,
  money2Comparisons,
  money2RunSpec,
  money2SetupInput,
  playMoney2,
  readMoney2Setup,
  readMoney2Turns,
  renderMoney2Blind,
  runArmOf,
  type Money2Hand,
} from "../../../../src/evals/textModelEval/money2Play.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { SETUP_PREMISES, buildMergedPrompt } from "../../../../src/evals/textModelEval/setupPremises.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { stat } from "../../../helpers/textFixtures.js";
import { DEFAULT, fakeCall, setupReply } from "./playFixtures.js";

/*
 * The money-2 stage (decision A's money fix, 2026-10-02): production's setup
 * and the variant (moneySetup) on learning premises, twice each, each setup
 * played on as the game plays it for the lemonade stand's first chapter;
 * readings of the counted stats each setup writes and of the money each played
 * turn moves, a blind hand reading by code, the variant against production
 * under the stop rule.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A one-player setup reply with a cash stat of a type, a margin stat where asked, and the levers and adjustments that type writes. */
function cashReply(type: "number" | "percentage", margin = false) {
  const cash = stat("player_stand_cash", {
    name: "Stand Cash",
    type,
    initialValue: type === "number" ? 12 : 50,
    optionsToSacrifice: type === "number" ? "Spend 3 coins on a faster courier." : "Spend 10% of Stand Cash on extra ingredients.",
    optionsToGainAsReward: type === "number" ? "Gain 2 coins by selling the spare crate." : "Gain 5% Stand Cash by skipping an upgrade.",
    adjustmentsAfterThreads: type === "number" ? ["None: it moves by what the story pays and earns."] : ["+10% after a favorable thread that earns sales; -10% after an unfavorable one."],
    canBeChangedInBeatResolutions: true,
  });
  const playerStats = [cash, ...(margin ? [stat("player_profit_margin", { name: "Profit Margin", initialValue: 25, adjustmentsAfterThreads: ["+5 percentage points after a favorable thread"] })] : [])];
  return {
    ...setupReply(1),
    storyElements: [{ id: "co_op", name: "The Co-op", role: "Sells lemons.", instructions: "Purchases affect the cashbox only when the thread resolves.", appearance: "Sunny.", facts: ["Cheap.", "Busy.", "Old."] }],
    sharedStats: [stat("shared_market_mood", { name: "Market Mood" })],
    playerStats,
  };
}

const lemonade = MONEY_2_SPECS.find((s) => s.spec.id === "money2-lemonade");
if (!lemonade) throw new Error("no lemonade spec");

describe("the stage's premises and arms", () => {
  it("measures five learning premises, the lemonade stand played for its first chapter, the others set up only; peer review is the control, about neither money nor counts", () => {
    expect(MONEY_2_SPECS.map((s) => [s.spec.id, s.spec.maxTurns, s.turns, s.counts])).toEqual([
      ["money2-lemonade", 10, 5, true],
      ["money2-president", 25, 0, true],
      ["money2-ranger", 25, 0, true],
      ["money2-eco-business", 25, 0, true],
      ["money2-peer-review", 25, 0, false],
    ]);
    expect(MONEY_2_SETUP_VARIANTS).toEqual(["adopted", "moneySetup"]);
  });

  it("sets each premise up as the client merges a learn-something suggestion, recorded as a learning story", () => {
    const frozen = (id: string) => SETUP_PREMISES.find((p) => p.id === id)?.premise;
    const inputs = Object.fromEntries(MONEY_2_SPECS.map((s) => [s.spec.id, money2SetupInput(s.spec)]));
    expect(inputs["money2-lemonade"]).toMatchObject({ premise: frozen("setup-learn-lemonade"), playerCount: 1, maxTurns: 10, learning: true });
    expect(inputs["money2-peer-review"]).toMatchObject({ premise: frozen("setup-learn-peer-review"), playerCount: 2, gameMode: GameModes.CooperativeCompetitive, learning: true });
    expect(inputs["money2-president"]).toMatchObject({
      premise: buildMergedPrompt(
        "learn-something",
        { learningGoals: "Campaign dynamics", targetAudience: "high school civics students" },
        "I'm running for student body president, learning about organizing rallies, voter outreach, and making budget allocation decisions..."
      ),
      playerCount: 1,
      learning: true,
    });
    expect(inputs["money2-ranger"].premise).toMatch(/^Create a story that teaches specific concepts.*\nWhat should the story teach\?: Predator-prey relationships\n/s);
    expect(inputs["money2-eco-business"]).toMatchObject({ playerCount: 2, gameMode: GameModes.Cooperative, learning: true });
    for (const input of Object.values(inputs)) expect(input.kids).toBeUndefined();
  });

  it("gives each arm's runs their own ids, so their calls and dice never mix, and reads the arm and premise back", () => {
    const run = money2RunSpec(lemonade.spec, "moneySetup");
    expect(run.id).toBe("money2-lemonade-moneySetup");
    expect(run.premiseId).toBe("setup-learn-lemonade");
    expect(runArmOf({ spec: run } as PlayRun)).toEqual({ premise: "money2-lemonade", variant: "moneySetup" });
    expect(runArmOf({ spec: money2RunSpec(lemonade.spec, "adopted") } as PlayRun)).toEqual({ premise: "money2-lemonade", variant: "adopted" });
  });
});

describe("playMoney2: each arm's setup, then production's planners and turns", () => {
  it.each(MONEY_2_SETUP_VARIANTS)("%s: its setup on its arm, the lemonade's first five turns on production's code", async (variant) => {
    const { call, calls } = fakeCall(1);
    const { run } = await playMoney2(lemonade, variant, call, 1);
    expect(calls[0].arm.key).toBe(`gpt-6-luna@low/${variant}`);
    expect(requestText(calls[0].request)).toBe(requestText(requestFor(variant, { role: "setup", setup: money2SetupInput(lemonade.spec) })));
    expect(calls.slice(1).every((c) => c.arm.variant === "adopted")).toBe(true);
    expect(run.turns).toHaveLength(5);
    expect(run.start?.category).toBe("learn-something");
    expect(calls[0].caseId).toBe(`money2-lemonade-${variant}-s1-000-setup`);
  });

  it("sets up a premise played for no turn, and plays fewer turns where a smoke asks", async () => {
    const president = MONEY_2_SPECS.find((s) => s.spec.id === "money2-president");
    if (!president) throw new Error("no president spec");
    const { call, calls } = fakeCall(1);
    const { run } = await playMoney2(president, "moneySetup", call, 2);
    expect(calls.map((c) => c.role)).toEqual(["setup"]);
    expect(run.turns).toEqual([]);
    const smoke = fakeCall(1);
    expect((await playMoney2(lemonade, "adopted", smoke.call, 1, 1)).run.turns).toHaveLength(1);
  });
});

describe("the readings", () => {
  const played = async (reply: unknown, statChanges?: unknown[]) => {
    const { call } = fakeCall(1, { reply: (role) => (role === "setup" ? reply : DEFAULT), ...(statChanges ? { statChanges } : {}) });
    return (await playMoney2(lemonade, "adopted", call, 1, 2)).run;
  };

  it("reads a percentage cash, its levers in percent, a fixed step after threads, a worked-out margin and a payment put off as failing", async () => {
    const run = await played(cashReply("percentage", true));
    const reading = readMoney2Setup(run);
    expect(reading).toMatchObject({ premise: "money2-lemonade", variant: "adopted", sample: 1, counts: true });
    expect(reading.counted.map((s) => [s.name, s.type])).toEqual([["Stand Cash", "percentage"]]);
    expect(reading.workedOut.map((s) => s.name)).toEqual(["Profit Margin"]);
    expect(reading.flags).toEqual({ moneyAsNumber: false, countedAsNumber: false, leversInUnits: false, noFixedSteps: false, noWorkedOut: false, adjustable: true });
    expect(reading.deferrals).toEqual(["The Co-op: Purchases affect the cashbox only when the thread resolves."]);
  });

  it("reads a number cash in coins, moved by what the story pays, no margin stat, as passing", async () => {
    const run = await played({ ...cashReply("number"), storyElements: setupReply(1).storyElements });
    const reading = readMoney2Setup(run);
    expect(reading.flags).toEqual({ moneyAsNumber: true, countedAsNumber: true, leversInUnits: true, noFixedSteps: true, noWorkedOut: true, adjustable: true });
    expect(reading.deferrals).toEqual([]);
    expect(reading.checksFailed).toEqual(expect.any(Array));
    expect(reading.costUsd).toBeCloseTo(0.001);
  });

  it("reads no counted stat on a setup that counts nothing", async () => {
    const run = await played(setupReply(1));
    const reading = readMoney2Setup(run);
    expect(reading.counted.map((s) => s.name)).toEqual(["Supplies"]);
    expect(reading.flags.moneyAsNumber).toBeUndefined();
  });

  it("reads each played turn's counted stats before and after, its changes on them and the sentences that name an amount", async () => {
    const change = { type: "statChange", group: "player1", stat: "player_stand_cash", change: "subtractNumber", value: 3 };
    const run = await played({ ...cashReply("number"), storyElements: setupReply(1).storyElements }, [change]);
    const turns = readMoney2Turns(run);
    expect(turns.map((t) => [t.turn, t.kind])).toEqual([
      [1, "first turn"],
      [2, "chapter opening"],
    ]);
    // Each turn subtracts 3, from where the turn before left it (12 at the start)
    const cash = (t: (typeof turns)[number]) => t.counted.find((c) => c.id === "player_stand_cash");
    expect(cash(turns[0])).toMatchObject({ name: "Stand Cash", group: "player1", before: 12 });
    expect(cash(turns[1])?.before).toBe(cash(turns[0])?.after);
    expect(cash(turns[1])?.after).toBe((cash(turns[1])?.before as number) - 3);
    expect(turns[1].changes).toEqual(["player1 player_stand_cash subtractNumber 3"]);
    expect(turns[1].text).toEqual(expect.any(String));
  });

  it("finds the sentences that name an amount: a sum in coins or dollars, a count of things, a price", () => {
    const text = "You count the coins. Three coins go to the co-op for lemons. The sign says $2 a cup! Nobody comes. You sell 4 cups by noon.";
    expect(amountSentences(text)).toEqual(["Three coins go to the co-op for lemons.", "The sign says $2 a cup!", "You sell 4 cups by noon."]);
    expect(amountSentences("A quiet morning at the stand.")).toEqual([]);
  });
});

describe("the blind reading and the comparison", () => {
  const runs = (): PlayRun[] =>
    MONEY_2_SETUP_VARIANTS.flatMap((variant) =>
      [1, 2].map((sample) => ({ spec: money2RunSpec(lemonade.spec, variant), sample, input: money2SetupInput(lemonade.spec), turns: [], stopped: "", complete: false }) as PlayRun)
    );

  it("codes each run by a salted hash, no arm named in the reading", () => {
    const all = runs();
    const key = money2BlindKey(all, "salt");
    expect(Object.keys(key.runs)).toHaveLength(4);
    expect(key.runs[money2Code("salt", all[0])]).toEqual({ id: "money2-lemonade-adopted", sample: 1 });
    const blind = renderMoney2Blind(all, "salt");
    expect(blind).not.toMatch(/adopted|moneySetup/);
    for (const code of Object.keys(key.runs)) expect(blind).toContain(`### ${code}`);
  });

  it("reads the variant against production on the hand verdicts, production's two samples the noise, unread ones counted apart", () => {
    const all = runs();
    const key = money2BlindKey(all, "salt");
    const code = (variant: string, sample: number) => money2Code("salt", all.find((r) => r.spec.id.endsWith(variant) && r.sample === sample) as PlayRun);
    const hand: Money2Hand = {
      setups: {
        [code("adopted", 1)]: { hand: false, note: "percentage cash" },
        [code("adopted", 2)]: { hand: true, note: "number cash" },
        [code("moneySetup", 1)]: { hand: true, note: "number cash" },
        [code("moneySetup", 2)]: { hand: true, note: "number cash" },
      },
      turns: {},
    };
    const c = money2Comparisons(all, key, hand);
    expect(c.setups.production).toEqual({ hits: 1, n: 2 });
    expect(c.setups.variant).toEqual({ hits: 2, n: 2 });
    expect(c.setups.noise).toBe(1);
    expect(c.setups.move).toEqual({});
    const unread = money2Comparisons(all, key, { setups: {}, turns: {} });
    expect(unread.setups.unread).toEqual({ production: 2, variant: 2 });
  });
});
