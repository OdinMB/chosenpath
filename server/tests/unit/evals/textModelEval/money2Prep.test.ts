import { describe, expect, it } from "@jest/globals";
import { MONEY_2_SPECS, money2BlindKey, money2Code, money2RunSpec, money2SetupInput } from "../../../../src/evals/textModelEval/money2Play.js";
import {
  MONEY_2_TURN_ARMS,
  mergeMoney2Runs,
  money2Estimate,
  money2PlayVariants,
  money2ReplyCode,
  money2ReplyComparisons,
  money2ReplyKey,
  renderMoney2,
  renderMoney2Replies,
  renderMoney2RepliesBlind,
} from "../../../../src/evals/textModelEval/money2Prep.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { stat } from "../../../helpers/textFixtures.js";

/*
 * The money-2 stage's modes (decision A's money fix, 2026-10-02): the short
 * playthroughs' file, their estimate before they run, the arms a run may name,
 * and the report the hand reading is read into.
 */

const [lemonade, president] = MONEY_2_SPECS;

const run = (premise: (typeof MONEY_2_SPECS)[number], variant: "adopted" | "moneySetup", sample: number, extra: Partial<PlayRun> = {}): PlayRun => ({
  spec: money2RunSpec(premise.spec, variant),
  sample,
  input: money2SetupInput(premise.spec),
  turns: [],
  stopped: "after turn 0 (the turns asked for)",
  complete: false,
  ...extra,
});

describe("the stage's file", () => {
  it("keeps every run, a premise, arm and sample played again replacing its run, in the stage's premise order, production first", () => {
    const old = run(lemonade, "adopted", 1, { stopped: "old" });
    const merged = mergeMoney2Runs([run(president, "adopted", 1), old, run(lemonade, "moneySetup", 1)], [run(lemonade, "adopted", 1, { stopped: "new" }), run(lemonade, "adopted", 2)]);
    expect(merged.map((r) => [r.spec.id, r.sample, r.stopped])).toEqual([
      ["money2-lemonade-adopted", 1, "new"],
      ["money2-lemonade-adopted", 2, "after turn 0 (the turns asked for)"],
      ["money2-lemonade-moneySetup", 1, "after turn 0 (the turns asked for)"],
      ["money2-president-adopted", 1, "after turn 0 (the turns asked for)"],
    ]);
  });

  it("plays production's setup and the variant unless --arms names one of them", () => {
    expect(money2PlayVariants()).toEqual(["adopted", "moneySetup"]);
    expect(money2PlayVariants(["moneySetup"])).toEqual(["moneySetup"]);
    expect(() => money2PlayVariants(["leverDirection"])).toThrow(/adopted, moneySetup/);
  });
});

describe("the estimate before a run", () => {
  const costs = () => ({ setup: 0.006, beat: 0.004, switch: 0.001, thread: 0.0015 });

  it("prices a setup, and for a premise played on, its turns and a switch and a chapter plan for each chapter they reach", () => {
    expect(money2Estimate(president, costs)).toEqual({ calls: 1, usd: 0.006 });
    // Five turns of a ten-turn story: the opening's switch plan, a chapter plan, the switch plan after the first chapter
    // and the next chapter's plan
    const played = money2Estimate(lemonade, costs);
    expect(played.calls).toBe(1 + 5 + 4);
    expect(played.usd).toBeCloseTo(0.006 + 5 * 0.004 + 2 * 0.001 + 2 * 0.0015);
    expect(money2Estimate(lemonade, costs, 1)).toEqual({ calls: 1 + 1 + 1, usd: 0.006 + 0.004 + 0.001 });
  });
});

describe("the report", () => {
  const setup = (cash: "number" | "percentage") => ({
    sharedStats: [],
    playerStats: [stat("player_cash", { name: "Stand Cash", type: cash, optionsToSacrifice: cash === "number" ? "Spend 3 coins" : "Spend 10% of Stand Cash" })],
    storyElements: [],
    guidelines: {},
  });
  const runs = [
    run(lemonade, "adopted", 1, { setup: { calls: [], output: setup("percentage") } }),
    run(lemonade, "adopted", 2, { setup: { calls: [], output: setup("number") } }),
    run(lemonade, "moneySetup", 1, { setup: { calls: [], output: setup("number") } }),
    run(lemonade, "moneySetup", 2, { setup: { calls: [], output: setup("number") } }),
  ];

  it("reads the hand verdicts against production under the stop rule, the flags beside them, and every setup's counted stats", () => {
    const key = money2BlindKey(runs, "salt");
    const hand = { setups: Object.fromEntries(runs.map((r, i) => [money2Code("salt", r), { hand: i > 0, note: i > 0 ? "number cash" : "percentage cash" }])), turns: {} };
    const md = renderMoney2(runs, key, hand, { spendUsd: 0.12, generatedAt: new Date("2026-10-02T10:00:00Z") });
    expect(md).toMatch(/^# Money and counts in learning stories \(the money-2 stage\)/);
    expect(md).toContain("| By hand (blind): the setup counts in number stats that move by what the story pays and earns | 1 of 2 (50%) | 2 of 2 (100%) | 100 pts | within the noise |");
    expect(md).toContain("| Flag: every stat named for money is a number | 1 of 2 (50%) | 2 of 2 (100%) | 100 pts | within the noise |");
    expect(md).toContain("Spent in the stage so far: $0.1200.");
    expect(md).toMatch(/money2-lemonade \| 1 \| production \| no: percentage cash/);
    expect(md).toContain('- **Stand Cash** (player, percentage');
  });

  it("reads the turn line's replies by code against production, no arm named in their blind reading", () => {
    const reply = (variant: "adopted" | "moneyTurn", sample: number) => ({
      armKey: variant === "adopted" ? MONEY_2_TURN_ARMS[0] : MONEY_2_TURN_ARMS[1],
      variant,
      caseId: "round-money2-setup-s2-t4",
      sample,
      retried: false,
      waitMs: 40_000,
      costUsd: 0.004,
      reasoningTokens: 900,
      chosenBefore: "Sell more cups (favorable)",
      counted: [{ group: "shared", id: "shared_stand_cash", name: "Stand Cash", before: 20, after: variant === "adopted" ? 20 : 22 }],
      changes: variant === "adopted" ? [] : ["shared shared_stand_cash addNumber 2"],
      text: "You sell two cups for a coin each.",
      amounts: ["You sell two cups for a coin each."],
      interludes: [],
    });
    const rows = [reply("adopted", 1), reply("adopted", 2), reply("moneyTurn", 1), reply("moneyTurn", 2)];
    const key = money2ReplyKey(rows, "salt");
    const blind = renderMoney2RepliesBlind(rows, "salt");
    expect(blind).not.toMatch(/adopted|moneyTurn/);
    expect(Object.keys(key.replies)).toHaveLength(4);
    const hand = Object.fromEntries(rows.map((r) => [money2ReplyCode("salt", r), { addsUp: r.variant === "moneyTurn", sum: true, note: "two coins" }]));
    const c = money2ReplyComparisons(rows, key, hand);
    expect(c.addsUp.production).toEqual({ hits: 0, n: 2 });
    expect(c.addsUp.variant).toEqual({ hits: 2, n: 2 });
    expect(c.addsUp.noise).toBe(0);
    expect(c.sums.variant).toEqual({ hits: 2, n: 2 });
    const section = renderMoney2Replies(rows, key, hand).join("\n");
    expect(section).toContain("| By hand (blind): the reply's money adds up | 0 of 2 (0%) | 2 of 2 (100%) | 0 pts |");
    expect(section).toContain("| round-money2-setup-s2-t4 | 1 | moneyTurn | Stand Cash 20 -> 22 | shared shared_stand_cash addNumber 2 | 1 | adds up, a sum: two coins |");
  });

  it("reads the fix-and-retest against production on the cases the retest ran only", () => {
    const row = (variant: "adopted" | "moneyTurn" | "moneyTurnB", caseId: string, sample: number) => ({
      armKey: `gpt-6-luna@medium/${variant}`,
      variant,
      caseId,
      sample,
      retried: false,
      waitMs: 1,
      costUsd: 0.004,
      reasoningTokens: 1,
      chosenBefore: "",
      counted: [],
      changes: [],
      text: "",
      amounts: [],
      interludes: [],
    });
    const rows = [
      row("adopted", "round-money2-setup-s2-t5", 1),
      row("adopted", "round-money2-setup-s2-t5", 2),
      row("adopted", "round-money2-setup-s1-t3", 1),
      row("adopted", "round-money2-setup-s1-t3", 2),
      row("moneyTurnB", "round-money2-setup-s2-t5", 1),
      row("moneyTurnB", "round-money2-setup-s2-t5", 2),
    ];
    expect(MONEY_2_TURN_ARMS).toEqual(["gpt-6-luna@medium/adopted", "gpt-6-luna@medium/moneyTurn", "gpt-6-luna@medium/moneyTurnB", "gpt-6-luna@medium/moneyTurnBase"]);
    const key = money2ReplyKey(rows, "salt");
    const hand = Object.fromEntries(rows.map((r) => [money2ReplyCode("salt", r), { addsUp: r.variant === "moneyTurnB" || r.caseId.endsWith("t3"), sum: false, note: "" }]));
    const c = money2ReplyComparisons(rows, key, hand, "moneyTurnB");
    // Production read on the retest's case only: 0 of 2, not 2 of 4
    expect(c.addsUp.production).toEqual({ hits: 0, n: 2 });
    expect(c.addsUp.variant).toEqual({ hits: 2, n: 2 });
  });

  /*
   * The review of the adoption (2026-10-02): the retest's cases were chosen from production's first-run records, one of
   * them because production failed it in both samples, and the pass was read against those same records. Production's
   * turn as the stage measured it (moneyTurnBase) runs fresh on the retest's cases, and the retest reads against it too.
   */
  it("reads the fix-and-retest against production run fresh on its cases, the fresh arm's two samples the noise", () => {
    const row = (variant: "adopted" | "moneyTurnB" | "moneyTurnBase", sample: number) => ({
      armKey: `gpt-6-luna@medium/${variant}`,
      variant,
      caseId: "round-money2-setup-s2-t5",
      sample,
      retried: false,
      waitMs: 1,
      costUsd: 0.004,
      reasoningTokens: 1,
      chosenBefore: "",
      counted: [],
      changes: [],
      text: "",
      amounts: [],
      interludes: [],
    });
    const rows = [row("adopted", 1), row("adopted", 2), row("moneyTurnB", 1), row("moneyTurnB", 2), row("moneyTurnBase", 1), row("moneyTurnBase", 2)];
    const key = money2ReplyKey(rows, "salt");
    expect(renderMoney2RepliesBlind(rows, "salt")).not.toMatch(/adopted|moneyTurn|fresh/);
    // The first run's production failed both; the fresh run adds up once
    const addsUp = (r: (typeof rows)[number]) => r.variant === "moneyTurnB" || (r.variant === "moneyTurnBase" && r.sample === 1);
    const hand = Object.fromEntries(rows.map((r) => [money2ReplyCode("salt", r), { addsUp: addsUp(r), sum: false, note: "" }]));
    const fresh = money2ReplyComparisons(rows, key, hand, "moneyTurnB", "moneyTurnBase");
    expect(fresh.addsUp.production).toEqual({ hits: 1, n: 2 });
    expect(fresh.addsUp.variant).toEqual({ hits: 2, n: 2 });
    expect(fresh.addsUp.noise).toBe(1);
    expect(money2ReplyComparisons(rows, key, hand, "moneyTurnB").addsUp.production).toEqual({ hits: 0, n: 2 });
    const section = renderMoney2Replies(rows, key, hand).join("\n");
    expect(section).toContain("Its fix-and-retest against production run fresh on the 1 cases it ran (the review of the adoption, 2026-10-02):");
    expect(section).toContain("| round-money2-setup-s2-t5 | 1 | production, fresh |");
  });

  it("says where the blind key is still missing", () => {
    expect(renderMoney2(runs, undefined, { setups: {}, turns: {} }, { spendUsd: 0, generatedAt: new Date("2026-10-02T10:00:00Z") })).toContain("no blind key yet: run --money-2-blind");
  });
});
