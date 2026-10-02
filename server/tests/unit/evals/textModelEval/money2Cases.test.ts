import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { MONEY_2_TURN_CASE_SPECS, money2Sent, money2TurnCases, readMoney2Reply } from "../../../../src/evals/textModelEval/money2Cases.js";
import { productionSends } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { withoutMoneyTurnLines } from "../../../../src/game/services/storyTextRounds/moneyAddsUp.js";
import { takesMoneyRule } from "../../../../src/game/services/moneyTurns.js";
import { firstSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { MONEY_2_SPECS, playMoney2 } from "../../../../src/evals/textModelEval/money2Play.js";
import {
  MONEY_2_PROMPT_STATE,
  MONEY_2_RETEST_CASES,
  MONEY_2_TURN_CASES,
  armsFor,
  referenceKey,
  stageChecksTurns,
  stageInterleavesArms,
  stagePlansCase,
} from "../../../../src/evals/textModelEval/arms.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { stat } from "../../../helpers/textFixtures.js";
import { fakeCall, setupReply } from "./playFixtures.js";

/*
 * The money-2 stage's turn cases (decision A's money fix, 2026-10-02): fix 7's
 * turn line where the stage found it still needed, measured on turns of the
 * stage's own lemonade runs, each request the one production sent there.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [lemonade] = MONEY_2_SPECS;

describe("the stage's turn cases", () => {
  it("takes eight turns of the lemonade runs: the money setup's two runs from the chapter's third turn to the switch turn after it, and production's setup's second run at its payment and its switch turn", () => {
    expect(MONEY_2_TURN_CASE_SPECS.map((s) => [s.id, s.story, s.sample, s.turn, s.role])).toEqual([
      ["round-money2-setup-s1-t3", "money2-lemonade-moneySetup", 1, 3, "beat"],
      ["round-money2-setup-s1-t4", "money2-lemonade-moneySetup", 1, 4, "beat"],
      ["round-money2-setup-s1-t5", "money2-lemonade-moneySetup", 1, 5, "beat"],
      ["round-money2-setup-s2-t3", "money2-lemonade-moneySetup", 2, 3, "beat"],
      ["round-money2-setup-s2-t4", "money2-lemonade-moneySetup", 2, 4, "beat"],
      ["round-money2-setup-s2-t5", "money2-lemonade-moneySetup", 2, 5, "beat"],
      ["round-money2-prod-s2-t4", "money2-lemonade-adopted", 2, 4, "beat"],
      ["round-money2-prod-s2-t5", "money2-lemonade-adopted", 2, 5, "beat"],
    ]);
    expect(MONEY_2_TURN_CASES).toEqual(MONEY_2_TURN_CASE_SPECS.map((s) => s.id));
    // Each only from the stage on
    for (const id of MONEY_2_TURN_CASES) {
      expect(stagePlansCase("money-2", id)).toBe(true);
      expect(stagePlansCase("contest-settled", id)).toBe(false);
    }
  });

  it("runs production's turn and moneyTurn twice on them, interleaved, each turn with production's checked retry, under adopted26", () => {
    expect(armsFor("money-2", "beat").map((p) => [p.arm.key, p.samples, p.scope, p.caseIds])).toEqual([
      ["gpt-6-luna@medium/adopted", 2, "single-player", [...MONEY_2_TURN_CASES]],
      ["gpt-6-luna@medium/moneyTurn", 2, "single-player", [...MONEY_2_TURN_CASES]],
      // The fix-and-retest (after the run of 2026-10-02), twice on the four cases where its cause showed
      ["gpt-6-luna@medium/moneyTurnB", 2, "single-player", ["round-money2-setup-s1-t4", "round-money2-setup-s2-t3", "round-money2-setup-s2-t5", "round-money2-prod-s2-t4"]],
      // The review of the adoption (2026-10-02): production's turn as the stage measured it, run fresh twice on the
      // retest's cases, whose first-run records chose one of them
      ["gpt-6-luna@medium/moneyTurnBase", 2, "single-player", ["round-money2-setup-s1-t4", "round-money2-setup-s2-t3", "round-money2-setup-s2-t5", "round-money2-prod-s2-t4"]],
    ]);
    expect(MONEY_2_RETEST_CASES).toEqual(["round-money2-setup-s1-t4", "round-money2-setup-s2-t3", "round-money2-setup-s2-t5", "round-money2-prod-s2-t4"]);
    expect(referenceKey("gpt-6-luna@medium/moneyTurnB")).toBe("gpt-6-luna@medium/adopted");
    expect(referenceKey("gpt-6-luna@medium/moneyTurnBase")).toBe("gpt-6-luna@medium/adopted");
    for (const role of ["setup", "switch", "thread", "iteration"] as const) expect(armsFor("money-2", role)).toEqual([]);
    expect(referenceKey("gpt-6-luna@medium/moneyTurn")).toBe("gpt-6-luna@medium/adopted");
    expect(stageInterleavesArms("money-2")).toBe(true);
    expect(stageChecksTurns("money-2")).toBe(true);
    expect(MONEY_2_PROMPT_STATE).toBe("adopted26");
  });

  it("builds a case from a stored run only where its request is the one production sent, recorded as a learning story", async () => {
    const { call, calls } = fakeCall(1);
    const { run } = await playMoney2(lemonade, "moneySetup", call, 2);
    const hashes = new Map(calls.map((c) => [`outputs/${c.caseId}.json`, sha256(requestText(c.request))]));
    const specs = [{ id: "round-money2-x-t3", story: run.spec.id, sample: 2, turn: 3, role: "beat" as const, purpose: "A chapter step." }];
    // A run played through today's code (the fake run) sent production's request today
    const { cases, problems } = money2TurnCases([run], (file) => hashes.get(file), specs, productionSends);
    expect(problems).toEqual([]);
    expect(cases.map((c) => [c.id, c.role, c.tags.category, c.tags.source])).toEqual([["round-money2-x-t3", "beat", "money-2", "round"]]);
    expect(cases[0].state?.category).toBe("learn-something");
    expect(cases[0].note).toMatch(/^A chapter step\. Built from the stored playthrough money2-lemonade-moneySetup \(sample 2\) at turn 3/);
    expect(money2TurnCases([run], () => "another", specs, productionSends).problems).toEqual([
      "round-money2-x-t3: its request is not the one the run sent at turn 3 of money2-lemonade-moneySetup",
    ]);
  });

  /*
   * The stage's own runs were played before its adoption (2026-10-02): their turns went out without the money lines
   * production prints since on a learning story's turn that counts, so the stored runs rebuild against production with
   * those lines taken out (money2Sent), the default.
   */
  it("rebuilds the stored runs' turns as production sent them before the adoption: the money lines taken out, nothing else", () => {
    const counts = { category: "learn-something" as const, sharedStats: [stat("shared_stand_cash", { name: "Stand Cash", type: "number", initialValue: 12 })] };
    const turn = threadBeat(1, counts);
    expect(takesMoneyRule(turn)).toBe(true);
    const input = { role: "beat" as const, story: turn };
    expect(money2Sent(input)).toBe(withoutMoneyTurnLines(productionSends(input)));
    expect(money2Sent(input)).not.toBe(productionSends(input));
    expect(money2Sent(input)).toBe(productionSends({ role: "beat", story: turn.clone({ category: undefined }) }));
    // A turn that takes no money lines, as production sends it
    const first = { role: "beat" as const, story: firstSwitchBeat(1, counts) };
    expect(money2Sent(first)).toBe(productionSends(first));
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const haveRecords = fs.existsSync(path.join(DIR, "calls.jsonl")) && fs.existsSync(path.join(DIR, "cases", "cases.json"));

/*
 * The review of the money-2 adoption (2026-10-02): the fix-and-retest's pass read moneyTurnB against production's records
 * of the stage's first run on four cases, one of them chosen because production failed it there. Production's turn as the
 * stage measured it (moneyTurnBase: today's turn without the money lines) runs fresh on those cases, so each request must
 * be the one production's arm sent there in the first run, byte for byte.
 */
describe("the fresh production arm on the retest's cases (skipped where the output folder is absent)", () => {
  (haveRecords ? it : it.skip)("sends on each retest case the very request production's turn sent there under adopted26", () => {
    const files = evalFiles(DIR);
    const cases = new Map(files.readCases().map((c) => [c.id, c]));
    const sent = files.readRecords().filter((r) => r.stage === "money-2" && r.promptState === MONEY_2_PROMPT_STATE && r.armKey === "gpt-6-luna@medium/adopted" && r.step === 1);
    const read = MONEY_2_RETEST_CASES.map((id) => {
      const evalCase = cases.get(id);
      if (!evalCase) return [id, "no case"];
      const hash = sha256(requestText(requestFor("moneyTurnBase", requestInputFor(evalCase))));
      const hashes = [...new Set(sent.filter((r) => r.caseId === id).map((r) => r.promptHash))];
      return [id, hashes.length === 1 && hashes[0] === hash ? "the same request" : `differs (${hashes.length} sent)`];
    });
    expect(read).toEqual(MONEY_2_RETEST_CASES.map((id) => [id, "the same request"]));
  });
});

describe("a reply read for its money", () => {
  it("reads the counted stats before and after the reply as the game applies it, its changes on them and the sentences naming an amount", async () => {
    const reply = { ...setupReply(1), sharedStats: [stat("shared_stand_cash", { name: "Stand Cash", type: "number", initialValue: 12 })], playerStats: [] };
    const { call } = fakeCall(1, { reply: (role) => (role === "setup" ? reply : undefined) });
    const { run } = await playMoney2(lemonade, "moneySetup", call, 1, 0);
    const start = Story.create(run.start as never);
    const beat = { statChanges: [{ type: "statChange", group: "shared", stat: "shared_stand_cash", change: "addNumber", value: 2 }], newMilestones: "", statsAffectingDecisionConsequences: [] };
    const read = readMoney2Reply(start, beat as never);
    expect(read.counted).toEqual([{ group: "shared", id: "shared_stand_cash", name: "Stand Cash", before: 12, after: 14 }]);
    expect(read.changes).toEqual(["shared shared_stand_cash addNumber 2"]);
    expect(read.text).toBe("");
    expect(read.amounts).toEqual([]);
  });
});
