import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import type { ThreadAnalysis } from "core/types/index.js";
import { CONTEST_SETTLED_CASE_SPECS } from "../../../../src/evals/textModelEval/contestSettledCases.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import {
  CONTEST_SETTLED_ARMS,
  blindCodeOf,
  contestBlindKey,
  contestPlanRows,
  decidesComparison,
  deferralWords,
  renderContestBlind,
  withHand,
  type ContestPlanRow,
} from "../../../../src/evals/textModelEval/contestSettledPrep.js";
import { contestPlanning } from "../../../helpers/contestStories.js";
import { thread } from "../../../helpers/textFixtures.js";

/*
 * The contest-settled stage's report (decision A's seal fix, the evening of
 * 2026-10-01): each chapter plan of the stage's arms read after the game's
 * plan check, at the contest it decides; a blind hand reading of each plan's
 * thread on that contest (does each possible milestone decide the contest in
 * its own direction?), unblinded through a key; the variant against production
 * under the stop rule.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

/** A plan with one thread on the sale, its possible milestones these. */
function salePlan(milestones: Record<string, string>, kind: "contest" | "challenge" = "contest", sideA = ["player1"], sideB = ["player2"]): ThreadAnalysis {
  const t = thread(kind, 3, 4, sideA, sideB);
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 3,
    firstBeatIndex: 4,
    threads: [{ ...t, outcomeId: "shared_sale", id: "the_last_viewing", question: "Who wins the buyer at the last viewing?", typeOfMilestone: "who sells the house", possibleMilestones: milestones, outcomeStages: ["First viewing", "Second viewing", "Who sells the house"] } as unknown as ThreadAnalysis["threads"][number]],
  };
}

const SETTLES = { sideAWins: "The buyer signs with Rory, who sells the house.", mixed: "The owner splits the sale between Rory and Nia.", sideBWins: "The buyer signs with Nia, who sells the house." };
const PUTS_OFF = {
  sideAWins: "The buyer gives Rory the right to shape the next discussion of the sale, without assigning it.",
  mixed: "Both agents keep equal standing for a later decision on the sale.",
  sideBWins: "The buyer gives Nia the right to shape the next discussion of the sale, without assigning it.",
};

const base = { armKey: CONTEST_SETTLED_ARMS[0], caseId: "round-contest-r9-sale-t5", sample: 1, outputId: "out1", latencyMs: 20_000, reasoningTokens: 300, outputTokens: 1_500, costUsd: 0.003 };

describe("deferralWords: a milestone that puts the decision off (a heuristic beside the hand)", () => {
  it("flags a later discussion or decision, shaping or framing one, or a decision left unassigned", () => {
    for (const text of [
      "The crew gives the Route-Readers' Claim confidence to shape the next custody discussion.",
      "The crew gives both camps equal standing to shape the next command-seal custody discussion, with questions recorded before any agreement.",
      "the finalists' service limits on the revised route inform the final Festival Circuit contract decision",
      "The Route-Reader's Claim gains momentum for the next custody discussion, without taking the seal now.",
      "Ves keeps custody unresolved and the seal unassigned.",
    ]) {
      expect([text, deferralWords(text)]).toEqual([text, true]);
    }
  });

  it("passes a milestone that decides, a mixed resolution that names its compromise included", () => {
    for (const text of [
      "The Crown awards the Black Star Commission to Ari's camp, trusting its verified route.",
      "The camps persuade the Crown to name them joint contractors, with divided authority and a public accounting of their quotas.",
      "The camps agree to place the command-seal in Captain Ves's custody under a shared-use pact, leaving its ultimate buyer or purpose unsettled.",
      "The judges award both trucks a shorter shared pilot route instead of the full contract.",
    ]) {
      expect([text, deferralWords(text)]).toEqual([text, false]);
    }
  });
});

describe("contestPlanRows: a plan read after the game's plan check, at the contest it decides", () => {
  it("reads the thread on the decided contest: its kind, sides, question, stages and milestones, and how many milestones the heuristic flags", () => {
    const story = contestPlanning([0, 0]);
    const [row] = contestPlanRows(story, salePlan(PUTS_OFF, "contest", ["player1"], ["player2"]), base);
    expect(row).toMatchObject({ ...base, outcomeId: "shared_sale", found: true, kind: "contest", sideA: ["player1"], sideB: ["player2"], question: "Who wins the buyer at the last viewing?", typeOfMilestone: "who sells the house", deferring: 3, usable: true });
    expect(row.stages).toEqual(["First viewing", "Second viewing", "Who sells the house"]);
    expect(row.milestones).toEqual(PUTS_OFF);
    expect(contestPlanRows(story, salePlan(SETTLES), base)[0].deferring).toBe(0);
  });

  it("reads a one-sided contest as the plan check keeps it, that side's challenge", () => {
    const story = contestPlanning([1, 0]);
    const [row] = contestPlanRows(story, salePlan(SETTLES, "contest", [], ["player2"]), base);
    expect(row).toMatchObject({ found: true, kind: "challenge", favorableSide: "sideB", sideA: ["player2"], sideB: [] });
    expect(row.milestones).toEqual({ favorable: SETTLES.sideBWins, mixed: SETTLES.mixed, unfavorable: SETTLES.sideAWins });
  });

  it("reads the scoreboard side of a one-sided challenge the planner wrote itself, as the plan check stores it since 2026-10-02", () => {
    const story = contestPlanning([1, 0]);
    const challenge = { favorable: SETTLES.sideBWins, mixed: SETTLES.mixed, unfavorable: SETTLES.sideAWins };
    const [row] = contestPlanRows(story, salePlan(challenge, "challenge", ["player2"], []), base);
    expect(row).toMatchObject({ found: true, kind: "challenge", favorableSide: "sideB", sideA: ["player2"], sideB: [] });
  });

  it("marks a plan with no thread on the decided contest, and reads nothing where no contest is decided", () => {
    const story = contestPlanning([0, 0]);
    const elsewhere = salePlan(SETTLES);
    elsewhere.threads = [{ ...elsewhere.threads[0], outcomeId: "player1_own" }];
    expect(contestPlanRows(story, elsewhere, base)[0]).toMatchObject({ outcomeId: "shared_sale", found: false, deferring: 0 });
    expect(contestPlanRows(contestPlanning([1, 1]), salePlan(SETTLES), base)).toEqual([]);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const read = (file: string): PlayRun[] => (fs.existsSync(path.join(DIR, file)) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, file), "utf-8"))) : []);
const stored = { 1: read("playthroughs.json"), 2: read("playthroughs-2.json"), 3: read("playthroughs-3.json") };

describe("the stored plans of the stage's cases (skipped where the output folder is absent)", () => {
  // The food trucks' contract (round 3, turn 17) is put off by being about something else (a brace check), which no word
  // heuristic reads: the hand reading is the stage's reading, the heuristic only beside it
  (stored[3].length ? it : it.skip)("read as the hand read them where words show it: the heuristic flags every milestone of the seal's, none of the six that settled their contest", () => {
    const flagged = CONTEST_SETTLED_CASE_SPECS.map((spec) => {
      const { played, beforePlan } = replayedTurn(stored[spec.round], spec.story, spec.turn);
      const rows = contestPlanRows(beforePlan, played.plan?.plan as ThreadAnalysis, base);
      return [spec.id, rows.map((r) => [r.outcomeId, r.found, r.deferring])];
    });
    expect(flagged).toEqual(
      CONTEST_SETTLED_CASE_SPECS.map((spec) => [spec.id, [[spec.outcomeId, true, spec.id === "round-contest-r3-space-pirates-t11" ? 3 : 0]]])
    );
  });
});

/** A plan row with only what the comparison reads. */
function row(armKey: string, caseId: string, sample: number): ContestPlanRow {
  return { ...base, armKey, caseId, sample, outputId: `${armKey}|${caseId}|${sample}`, outcomeId: "shared_sale", found: true, kind: "contest", sideA: [], sideB: [], stages: [], milestones: {}, deferring: 0, usable: true };
}

describe("the blind reading", () => {
  const rows = [row(CONTEST_SETTLED_ARMS[0], "case-a", 1), row(CONTEST_SETTLED_ARMS[1], "case-a", 1), row(CONTEST_SETTLED_ARMS[0], "case-a", 2), row(CONTEST_SETTLED_ARMS[1], "case-a", 2)];

  it("codes each plan by a salted hash, one code each, so no code says its arm; the key unblinds them", () => {
    const key = contestBlindKey(rows, "salt");
    expect(Object.keys(key.plans)).toHaveLength(4);
    for (const r of rows) expect(key.plans[blindCodeOf("salt", r)]).toEqual({ armKey: r.armKey, caseId: r.caseId, sample: r.sample });
    expect(blindCodeOf("salt", rows[0])).toMatch(/^[0-9A-F]{5}$/);
    expect(blindCodeOf("other", rows[0])).not.toBe(blindCodeOf("salt", rows[0]));
  });

  it("lists each case's contest once and its plans by code, in code order, naming no arm or sample", () => {
    const story = contestPlanning([0, 0]);
    const text = renderContestBlind(rows, new Map([["case-a", story]]), "salt");
    expect(text).toContain('Who sells the house?');
    expect(text).toContain('Side A wins: "Rory sells it and earns the commission."');
    const codes = rows.map((r) => blindCodeOf("salt", r));
    const at = codes.map((c) => text.indexOf(`### ${c}`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...codes].sort().map((c) => text.indexOf(`### ${c}`))).toEqual([...at].sort((a, b) => a - b));
    for (const arm of ["adopted", "contestSettled", "sample", "production", "variant"]) expect(text).not.toContain(arm);
  });
});

describe("the comparison under the stop rule", () => {
  const p = CONTEST_SETTLED_ARMS[0];
  const v = CONTEST_SETTLED_ARMS[1];
  const all = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].flatMap((c) => [1, 2].flatMap((s) => [row(p, c, s), row(v, c, s)]));

  it("unblinds the hand verdicts by code; a plan without one stays unread", () => {
    const key = contestBlindKey(all, "salt");
    const hand = { [blindCodeOf("salt", all[0])]: { hand: false as const, note: "puts it off" }, [blindCodeOf("salt", all[1])]: { hand: "partial" as const, note: "one of three" } };
    const read = withHand(all, key, hand);
    expect(read[0]).toMatchObject({ decides: false, note: "puts it off" });
    expect(read[1]).toMatchObject({ partial: true, note: "one of three" });
    expect(read[1].decides).toBeUndefined();
    expect(read[2].decides).toBeUndefined();
  });

  it("reads plans that decide their contest, the variant against production on the pairs both have, production's two samples the noise", () => {
    // Production puts the contest off on c1 and c2 in both samples; the variant decides everywhere
    const read = all.map((r) => ({ ...r, decides: !(r.armKey === p && (r.caseId === "c1" || r.caseId === "c2")) }));
    const c = decidesComparison(read);
    expect(c.production).toEqual({ hits: 12, n: 16 });
    expect(c.variant).toEqual({ hits: 16, n: 16 });
    expect(c.noise).toBe(0);
    expect(c.move.moved).toBe("higher");
    expect(c.move.p).toBeLessThan(0.1);
    // One case put off in one production sample only: beyond the noise, not moved
    const thin = all.map((r) => ({ ...r, decides: !(r.armKey === p && r.caseId === "c1" && r.sample === 1) }));
    const t = decidesComparison(thin);
    expect(t.noise).toBeCloseTo(0.125);
    expect(t.move.moved).toBeUndefined();
  });
});
