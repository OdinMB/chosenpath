import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import {
  MONEY_CALIBRATION,
  MONEY_CHECK,
  moneyEvidenceFrom,
  moneyJudgeCaseId,
  moneyJudgeJobs,
  moneyJudgeRequests,
  moneyVerdictFrom,
  scoreMoneyCalibration,
} from "../../../../src/evals/textModelEval/moneyAddsUpJudge.js";
import { JUDGE_ARMS } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { withEdits } from "../../../../src/evals/textModelEval/outcomeSettledPrep.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { firstSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, challengeOptions, stat } from "../../../helpers/textFixtures.js";

/*
 * The money-adds-up stage's judged check (2026-10-01, fix 7 of the second
 * playthroughs' review): one cheap GPT-6 call per player's turn asks
 * figuresAddUp: every amount of a counted stat the text pays, spends, uses
 * up, sells or earns moves that stat by that amount in the turn's stat
 * changes; every change of a counted or worked-out stat is shown in the text
 * (the chosen sacrifice's or reward's payment aside); and every total stated
 * for a stat in the text, the interludes or the recorded facts is its value
 * after the turn. The judge reads the story's number and percentage stats
 * (before, the turn's changes, after, as the game applies them), the option
 * the player chose last, the text, the interludes and the facts; never the
 * prompt.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const TILL = stat("player_till", { name: "Bakery Till", type: "number", tooltip: "The coins in the bakery's till.", optionsToSacrifice: "Spend 2 coins on flour.", initialValue: 12 });
const MARGIN = stat("player_margin", { name: "Bakery Margin", tooltip: "Profit as a share of sales." });
const SKILLS = stat("player_skills", { name: "Baking Skills", type: "string[]", initialValue: ["Rolls"] });
const BUZZ = stat("shared_buzz", { name: "Street Buzz" });

/** Step 2 of a bakery chapter: Ada chose the till's sacrifice last turn; the till holds 12 coins, the margin 20%. */
function bakery(players = 1, overrides: Parameters<typeof threadBeat>[1] = {}): Story {
  const base = threadBeat(players, { title: "The Bakery", category: "learn-something", playerStats: [TILL, MARGIN, SKILLS], sharedStats: [BUZZ], ...overrides });
  const state = structuredClone(base.getState());
  state.sharedStatValues = [{ statId: "shared_buzz", value: 50 }];
  for (const player of Object.values(state.players)) {
    player.name = "Ada";
    player.statValues = [
      { statId: "player_till", value: 12 },
      { statId: "player_margin", value: 20 },
      { statId: "player_skills", value: ["Rolls"] },
    ];
    const last = player.beatHistory[player.beatHistory.length - 1];
    const options = challengeOptions();
    options[0] = { ...options[0], resourceType: "sacrifice", text: "Buy better flour from the miller (-2 coins from the till)." };
    player.beatHistory[player.beatHistory.length - 1] = { ...last, options, choice: 0 };
  }
  return Story.create(state);
}

function reply(changes: { stat: string; change: string; value: unknown; group?: string }[], text = "You pay the miller two coins.\n\nThe till holds ten coins now.", slots = ["player1"]): SetOfBeatGenerationSchema {
  const beats = Object.fromEntries(
    slots.map((slot) => {
      const beat = beatGeneration({ text, interludes: [{ imageId: "", imageSource: "none", text: "Ten coins, and the oven still to pay for." }] });
      beat.plan.establishedFacts = [{ type: "newFact", storyElementId: "world", fact: "The till holds ten coins after the flour." }];
      return [slot, beat];
    })
  );
  return { statChanges: changes.map((c) => ({ type: "statChange", group: c.group ?? "player1", ...c })), newMilestones: "", ...beats } as unknown as SetOfBeatGenerationSchema;
}

describe("the judge's requests", () => {
  it("read the number and percentage stats with before, the turn's changes and after, the choice made last, the text, interludes and facts; never the prompt", () => {
    const requests = moneyJudgeRequests(bakery(), reply([{ stat: "player_till", change: "subtractNumber", value: 2 }]));
    expect(requests.map((r) => r.slot)).toEqual(["player1"]);
    const prompt = requests[0].request.prompt;
    expect(prompt).toContain("The Bakery");
    expect(prompt).toContain("Bakery Till (Ada's, number): The coins in the bakery's till.");
    expect(prompt).toContain("As a sacrifice: Spend 2 coins on flour.");
    expect(prompt).toContain("Before this turn: 12. This turn's changes: subtract 2. After this turn: 10.");
    expect(prompt).toContain("Bakery Margin (Ada's, percentage): Profit as a share of sales.");
    expect(prompt).toContain("Before this turn: 20. This turn's changes: none. After this turn: 20.");
    expect(prompt).toContain("Street Buzz (shared, percentage)");
    expect(prompt).not.toContain("Baking Skills");
    expect(prompt).toContain("A sacrifice: Buy better flour from the miller (-2 coins from the till).");
    expect(prompt).toContain("[1] You pay the miller two coins.");
    expect(prompt).toContain("[2] The till holds ten coins now.");
    expect(prompt).toContain("- Ten coins, and the oven still to pay for.");
    expect(prompt).toContain("The till holds ten coins after the flour.");
    expect(prompt).toContain(MONEY_CHECK);
    expect(prompt).not.toContain("STAT CHANGES");
  });

  it("read a stat set to a value, and a change the game drops as unknown", () => {
    const [request] = moneyJudgeRequests(bakery(), reply([
      { stat: "player_margin", change: "setNumber", value: 25 },
      { stat: "player_oven", change: "addNumber", value: 1 },
    ]));
    expect(request.request.prompt).toContain("Before this turn: 20. This turn's changes: set to 25. After this turn: 25.");
    expect(request.request.prompt).not.toContain("player_oven");
  });

  it("say so where the player chose no option last (the first turn), and read every player of a group with their own stats", () => {
    const [first] = moneyJudgeRequests(firstSwitchBeat(1, { playerStats: [TILL], category: "learn-something" }), reply([]));
    expect(first.request.prompt).toContain("none: this is the story's first turn");
    const group = moneyJudgeRequests(bakery(2), reply([{ stat: "player_till", change: "addNumber", value: 3, group: "player2" }], "You sell three rolls.", ["player1", "player2"]));
    expect(group.map((r) => r.slot)).toEqual(["player1", "player2"]);
    expect(group[0].request.prompt).toContain("This turn's changes: none. After this turn: 12.");
    expect(group[1].request.prompt).toContain("This turn's changes: add 3. After this turn: 15.");
  });
});

describe("the judge's answers and calls", () => {
  it("reads yes and no, and the judge's readings", () => {
    const parsed = {
      amounts: [{ quote: "pay the miller two coins", stat: "Bakery Till", amount: "2", kind: "paid or spent", inChanges: "no" }],
      unshown: [{ stat: "Bakery Margin", change: "20 -> 25" }],
      totals: [{ quote: "the till holds ten coins", stat: "Bakery Till", stated: "10", valueAfter: "12", matches: "no" }],
      [MONEY_CHECK]: { evidence: "the miller's two coins never left the till", answer: "no" },
    };
    expect(moneyVerdictFrom(parsed)).toBe(false);
    expect(moneyVerdictFrom({ [MONEY_CHECK]: { answer: "yes" } })).toBe(true);
    expect(moneyVerdictFrom({})).toBeUndefined();
    const said = moneyEvidenceFrom(parsed);
    expect(said.evidence).toBe("the miller's two coins never left the till");
    const lines = said.lines.join(" | ");
    expect(lines).toContain('paid or spent 2 Bakery Till ("pay the miller two coins"): in the changes no');
    expect(lines).toContain("unshown: Bakery Margin 20 -> 25");
    expect(lines).toContain('total Bakery Till 10, after 12 ("the till holds ten coins"): matches no');
  });

  it("keys each call by the prompt version and books it to the stage", () => {
    const [target] = moneyJudgeRequests(bakery(), reply([]));
    const jobs = moneyJudgeJobs([{ key: "abc", request: target.request, samples: 2 }], JUDGE_ARMS[0], "adopted14", "money-adds-up");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.promptState])).toEqual([
      [moneyJudgeCaseId("abc"), 1, "money-adds-up", "adopted14"],
      [moneyJudgeCaseId("abc"), 2, "money-adds-up", "adopted14"],
    ]);
    expect(moneyJudgeCaseId("abc")).toBe("judge-money-v1-abc");
  });
});

describe("the calibration", () => {
  it("is reliable only with three hand yes and three hand no, 85% agreement on each and 90% between samples", () => {
    const items = [true, true, true, false, false, false, "partial" as const].map((hand, i) => ({ id: `i${i}`, hand }));
    const agreeing = items.map((item) => ({ itemId: item.id, samples: [item.hand === "partial" ? true : item.hand, item.hand === "partial" ? true : item.hand] as (boolean | undefined)[] }));
    const all = scoreMoneyCalibration(items, agreeing);
    expect([all.check, all.decided, all.agree, all.handPasses, all.handFails, all.pairs, all.pairsAgree, all.partial.yes, all.reliable]).toEqual([MONEY_CHECK, 6, 6, 3, 3, 7, 7, 1, true]);
    const oneWrong = agreeing.map((j) => (j.itemId === "i3" ? { ...j, samples: [true, true] } : j));
    expect(scoreMoneyCalibration(items, oneWrong).reliable).toBe(false);
  });

  it("holds hand-read items, each id once, at least three yes and three no, each naming its player", () => {
    const ids = MONEY_CALIBRATION.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MONEY_CALIBRATION.filter((i) => i.hand === true).length).toBeGreaterThanOrEqual(3);
    expect(MONEY_CALIBRATION.filter((i) => i.hand === false).length).toBeGreaterThanOrEqual(3);
    for (const item of MONEY_CALIBRATION) expect(item.slot).toMatch(/^player[1-3]$/);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const read = (file: string): PlayRun[] => (fs.existsSync(path.join(DIR, file)) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, file), "utf-8"))) : []);
const stored = { 1: read("playthroughs.json"), 2: read("playthroughs-2.json") };

describe("the calibration's stored turns (skipped where the output folder is absent)", () => {
  (stored[1].length && stored[2].length ? it : it.skip)("each replays to a turn the judge can read for its player, a constructed version's edits applied", () => {
    for (const item of MONEY_CALIBRATION) {
      if (!("story" in item)) continue;
      const { before, played } = replayedTurn(stored[item.round ?? 2], item.story, item.turn);
      const edited = withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []);
      const target = moneyJudgeRequests(before, edited).find((r) => r.slot === item.slot);
      expect([item.id, target !== undefined]).toEqual([item.id, true]);
    }
  });

  (stored[2].length ? it : it.skip)("reads the stored lemonade turn 3 as the game applied it: the sacrifice's five coins, 10 -> 5, and the margin unchanged", () => {
    const { before, played } = replayedTurn(stored[2], "play-lemonade", 3);
    const [request] = moneyJudgeRequests(before, played.reply as SetOfBeatGenerationSchema);
    expect(request.request.prompt).toContain("Stand Cashbox (Theo's, number)");
    expect(request.request.prompt).toContain("Before this turn: 10. This turn's changes: subtract 5. After this turn: 5.");
    expect(request.request.prompt).toContain("Profit Margin (Theo's, percentage)");
    expect(request.request.prompt).toContain("A sacrifice: Add a fruit flavor to the opening setup by spending 5 coins from your cashbox on extra fruit.");
  });
});
