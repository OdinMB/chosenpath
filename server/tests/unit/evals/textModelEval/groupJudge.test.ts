import { describe, expect, it } from "@jest/globals";
import {
  GROUP_CHECKS,
  GROUP_JUDGE_CALIBRATION,
  groupJudgeCaseId,
  groupJudgeJobs,
  groupJudgeRequest,
  groupReadings,
  groupVerdictsFrom,
  renderGroupJudge,
  scoreGroupCalibration,
  type JudgedReply,
} from "../../../../src/evals/textModelEval/groupJudge.js";
import { keyOf } from "../../../../src/evals/textModelEval/runner.js";
import { firstSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions } from "../../../helpers/textFixtures.js";
import { LUNA } from "./fixtures.js";

/*
 * The group turn round's judged check (B10; turn round 3's hand read): one
 * call per group reply reads every player's turn and asks whether the moments
 * the players share are told the same way (the same lines, the same speakers)
 * and whether the turns agree on their facts.
 */

const P1 = ['[image id=grove source=story desc="The grove"]You step into the grove.', '"The forest is calling," you say. Russet answers, "It calls to both of us."'].join("\n\n");
const P2 = ["You follow Vern into the grove.", '"The forest is calling," Vern says. You answer, "It calls to both of us."'].join("\n\n");

function groupReply(players = 2) {
  const texts = [P1, P2, "You wait at the edge of the grove."];
  return beatSet(players, Object.fromEntries(Array.from({ length: players }, (_, i) => [`player${i + 1}`, { ...beatGeneration({ title: "The Grove", text: texts[i] }), options: challengeOptions() }])));
}

describe("groupJudgeRequest", () => {
  it("shows every player's turn as they read it, who shares the turn, and both questions", () => {
    const story = firstSwitchBeat(2);
    const request = groupJudgeRequest(story, groupReply());
    const prompt = request?.prompt ?? "";
    const [one, two] = ["player1", "player2"].map((slot) => story.getPlayer(slot)?.name ?? slot);
    expect(prompt).toContain(`${one} and ${two} share one switch: A Switch`);
    expect(prompt).toContain(`======= ${one.toUpperCase()}'S TURN =======`);
    expect(prompt).toContain("[1] You step into the grove.");
    expect(prompt).toContain('[2] "The forest is calling," Vern says.');
    expect(prompt).not.toContain("[image");
    expect(prompt).toContain("Options:\n1. Option 1");
    for (const check of GROUP_CHECKS) expect(prompt).toContain(`${check}: `);
    const schema = request?.schema;
    expect(schema?.safeParse({ sharedMomentsMatch: { evidence: "e", answer: "yes" }, sharedFactsAgree: { evidence: "e", answer: "no" } }).success).toBe(true);
    expect(schema?.safeParse({ sharedMomentsMatch: { evidence: "e", answer: "maybe" } }).success).toBe(false);
  });

  it("names a chapter's sides and three players", () => {
    const story = threadBeat(3);
    const prompt = groupJudgeRequest(story, groupReply(3))?.prompt ?? "";
    expect(prompt).toMatch(/share one chapter: A Thread/);
    expect(prompt.match(/'S TURN =======/g)).toHaveLength(3);
  });

  it("has nothing to judge for one player, or a reply with a single turn", () => {
    expect(groupJudgeRequest(firstSwitchBeat(1), groupReply(1))).toBeUndefined();
    const { player2, ...one } = groupReply(2) as unknown as Record<string, unknown>;
    void player2;
    expect(groupJudgeRequest(firstSwitchBeat(2), one as never)).toBeUndefined();
  });
});

describe("the group judge's verdicts and jobs", () => {
  it("reads yes as a pass, and skips an answer it cannot read", () => {
    expect(groupVerdictsFrom({ sharedMomentsMatch: { answer: "no" }, sharedFactsAgree: { answer: "yes" } })).toEqual({ sharedMomentsMatch: false, sharedFactsAgree: true });
    expect(groupVerdictsFrom({ sharedMomentsMatch: { answer: "perhaps" } })).toEqual({});
  });

  it("keys each call by the reply it reads and the prompt version, in the stage given", () => {
    const request = groupJudgeRequest(firstSwitchBeat(2), groupReply()) as NonNullable<ReturnType<typeof groupJudgeRequest>>;
    const jobs = groupJudgeJobs([{ outputId: "abc", request, samples: 2 }], LUNA, "round0", "groups");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.group, j.armKey])).toEqual([
      [groupJudgeCaseId("abc"), 1, "groups", "prep", `judge>${LUNA.key}`],
      [groupJudgeCaseId("abc"), 2, "groups", "prep", `judge>${LUNA.key}`],
    ]);
    expect(new Set(jobs.map(keyOf)).size).toBe(2);
  });
});

describe("the calibration set", () => {
  it("holds today's twelve stored group turns with a verdict on each check: shared moments 3 yes, 6 no, 3 partial; facts all yes", () => {
    expect(GROUP_JUDGE_CALIBRATION).toHaveLength(12);
    const count = (value: unknown) => GROUP_JUDGE_CALIBRATION.filter((item) => item.hand.sharedMomentsMatch === value).length;
    expect([count(true), count(false), count("partial")]).toEqual([3, 6, 3]);
    expect(GROUP_JUDGE_CALIBRATION.every((item) => item.hand.sharedFactsAgree === true)).toBe(true);
    expect(new Set(GROUP_JUDGE_CALIBRATION.map((item) => item.outputId)).size).toBe(12);
  });

  it("calls a check reliable only with three hand verdicts on each side, agreement on each side and a steady second sample", () => {
    const items = [
      { id: "a", caseId: "a", outputId: "a", hand: { sharedMomentsMatch: true, sharedFactsAgree: true } },
      { id: "b", caseId: "b", outputId: "b", hand: { sharedMomentsMatch: true, sharedFactsAgree: true } },
      { id: "c", caseId: "c", outputId: "c", hand: { sharedMomentsMatch: true, sharedFactsAgree: true } },
      { id: "d", caseId: "d", outputId: "d", hand: { sharedMomentsMatch: false, sharedFactsAgree: true } },
      { id: "e", caseId: "e", outputId: "e", hand: { sharedMomentsMatch: false, sharedFactsAgree: true } },
      { id: "f", caseId: "f", outputId: "f", hand: { sharedMomentsMatch: false, sharedFactsAgree: true } },
      { id: "g", caseId: "g", outputId: "g", hand: { sharedMomentsMatch: "partial" as const, sharedFactsAgree: true } },
    ];
    const judged = items.map((item) => ({
      itemId: item.id,
      samples: [0, 1].map(() => ({ sharedMomentsMatch: item.hand.sharedMomentsMatch === true, sharedFactsAgree: true })),
    }));
    const [moments, facts] = scoreGroupCalibration(items, judged);
    expect(moments).toMatchObject({ check: "sharedMomentsMatch", handPasses: 3, handFails: 3, agree: 6, pairs: 7, pairsAgree: 7, partial: { yes: 0, no: 1 }, reliable: true });
    // Every fact verdict is a yes, so a judge that always says yes cannot be told from a good one
    expect(facts).toMatchObject({ check: "sharedFactsAgree", handPasses: 7, handFails: 0, reliable: false });
  });
});

describe("groupReadings", () => {
  const reply = (armKey: string, caseId: string, sample: number, moments: boolean): JudgedReply => ({
    armKey,
    caseId,
    sample,
    outputId: `${armKey}-${caseId}-${sample}`,
    verdicts: { sharedMomentsMatch: moments, sharedFactsAgree: true },
  });
  const REF = "gpt-6-luna@low/prod";
  const ARM = "gpt-6-luna@low/turnB10";
  const cases = Array.from({ length: 12 }, (_, i) => `c${i}`);
  // Today's form: 3 of 12 on sample 1, 4 of 12 on sample 2; the note: 11 of 12 on both
  const replies = [
    ...cases.map((c, i) => reply(REF, c, 1, i < 3)),
    ...cases.map((c, i) => reply(REF, c, 2, i < 4)),
    ...cases.map((c, i) => reply(ARM, c, 1, i < 11)),
    ...cases.map((c, i) => reply(ARM, c, 2, i < 11)),
  ];

  it("reads a candidate against its reference on the replies both have, with the reference's two-sample noise and the stop rule", () => {
    const readings = groupReadings(replies, (key) => (key === ARM ? REF : undefined));
    const candidate = readings.find((r) => r.armKey === ARM);
    const moments = candidate?.vsReference?.find((c) => c.check === "sharedMomentsMatch");
    expect(moments).toMatchObject({ reference: { hits: 7, n: 24 }, arm: { hits: 22, n: 24 }, moved: "higher" });
    expect(moments?.noise).toBeCloseTo(1 / 12);
    const facts = candidate?.vsReference?.find((c) => c.check === "sharedFactsAgree");
    expect(facts?.moved).toBeUndefined();
    expect(readings.find((r) => r.armKey === REF)?.vsReference).toBeUndefined();
  });

  it("renders the calibration and the readings", () => {
    const text = renderGroupJudge({
      items: GROUP_JUDGE_CALIBRATION,
      calibration: scoreGroupCalibration(GROUP_JUDGE_CALIBRATION, []),
      readings: groupReadings(replies, (key) => (key === ARM ? REF : undefined)),
      spentUsd: 0.0123,
      generatedAt: new Date("2026-09-28T22:00:00Z"),
      problems: ["x: no case"],
    });
    expect(text).toContain("# Judged checks on group turns");
    expect(text).toContain("| sharedMomentsMatch | 0 of 0");
    expect(text).toContain(`| ${ARM} | sharedMomentsMatch | 22 of 24 (92%) | 7 of 24 (29%) | 8 pts | moved higher`);
    expect(text).toContain("- x: no case");
    expect(text).toContain("$0.0123");
  });
});
