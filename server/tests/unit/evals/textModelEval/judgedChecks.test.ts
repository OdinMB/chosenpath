import { jest } from "@jest/globals";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import {
  DEFAULT_JUDGE_ARM,
  JUDGED_CHECKS,
  JUDGE_CALIBRATION,
  JUDGE_PROMPT_VERSION,
  isReliable,
  judgeCaseId,
  judgeJobs,
  judgeRequest,
  judgedChecksFor,
  outputIdOf,
  renderCalibration,
  scoreCalibration,
  verdictsFrom,
  type CalibrationItem,
  type JudgedItem,
} from "../../../../src/evals/textModelEval/judgedChecks.js";
import { keyOf } from "../../../../src/evals/textModelEval/runner.js";
import { firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions } from "../../../helpers/textFixtures.js";
import { LUNA } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const TEXT = [
  "[image id=vault source=story desc=\"The vault door\"]You slip past the guard as the lamps gutter.",
  "The ledger lies open on the desk, its last page torn out.",
  "Mira holds up the torn page. \"Tell me why I shouldn't burn it,\" she says.",
].join("\n\n");

function reply(): SetOfBeatGenerationSchema {
  return beatSet(1, { player1: { ...beatGeneration({ title: "The Ledger (2/3)", text: TEXT }), options: challengeOptions() } });
}

describe("judgedChecksFor", () => {
  it("asks the step checks of a chapter step, and the first-paragraph check of every turn after the first", () => {
    expect(judgedChecksFor(threadBeat(1))).toEqual(["stepLeftOpen", "concreteProgress", "firstParagraphNarratesChoice"]);
    expect(judgedChecksFor(laterSwitchBeat(1))).toEqual(["firstParagraphNarratesChoice"]);
    expect(judgedChecksFor(firstSwitchBeat(1))).toEqual([]);
  });
});

describe("judgeRequest", () => {
  const story = threadBeat(1);

  it("shows the judge the last choice, the chapter step and the turn as the player reads it", () => {
    const judged = judgeRequest(story, reply(), "player1");
    expect(judged?.checks).toEqual(["stepLeftOpen", "concreteProgress", "firstParagraphNarratesChoice"]);
    const prompt = judged?.request.prompt ?? "";
    // The last beat's first option was chosen, and went well
    expect(prompt).toContain(`The player's last choice: "${story.getCurrentBeat("player1")?.options[0].text}"`);
    expect(prompt).toContain("How it turned out: It went well.");
    expect(prompt).toContain("This turn plays step 2 of 3: Step 2: Q");
    expect(prompt).toContain("Chapter question: none written; the outcome's question stands in.");
    expect(prompt).toContain("[1] You slip past the guard as the lamps gutter.");
    expect(prompt).toContain("[3] Mira holds up the torn page.");
    expect(prompt).not.toContain("[image");
    expect(prompt).toContain("Options:\n1. Option 1");
    const schema = judged?.request.schema;
    expect(schema?.safeParse({ stepLeftOpen: { evidence: "e", answer: "yes" }, concreteProgress: { evidence: "e", answer: "no" }, firstParagraphNarratesChoice: { evidence: "e", answer: "yes" } }).success).toBe(true);
    expect(schema?.safeParse({ stepLeftOpen: { evidence: "e", answer: "maybe" } }).success).toBe(false);
  });

  it("reads the chapter's backfilled question and plan when the case has them", () => {
    const frames = { a_thread: { question: "Will Mira hand over the ledger?", plan: "One night in the counting house.", chapterKey: "k" } };
    const prompt = judgeRequest(story, reply(), "player1", frames)?.request.prompt ?? "";
    expect(prompt).toContain("Chapter question: Will Mira hand over the ledger?");
    expect(prompt).toContain("Chapter plan: One night in the counting house.");
  });

  it("asks nothing of a first turn, or of a reply without the player's turn", () => {
    expect(judgeRequest(firstSwitchBeat(1), beatSet(1), "player1")).toBeUndefined();
    expect(judgeRequest(story, beatSet(1), "player2")).toBeUndefined();
  });
});

describe("verdictsFrom", () => {
  it("passes a check on yes, fails it on no, and leaves out an answer it cannot read", () => {
    expect(verdictsFrom({ stepLeftOpen: { answer: "no" }, concreteProgress: { answer: "yes" }, firstParagraphNarratesChoice: { answer: "perhaps" } }, [...JUDGED_CHECKS])).toEqual({
      stepLeftOpen: false,
      concreteProgress: true,
    });
    expect(verdictsFrom(undefined, ["stepLeftOpen"])).toEqual({});
  });
});

describe("the calibration set", () => {
  it("holds each hand-read turn once, each with at least one verdict", () => {
    expect(new Set(JUDGE_CALIBRATION.map((c) => c.id)).size).toBe(JUDGE_CALIBRATION.length);
    expect(new Set(JUDGE_CALIBRATION.map((c) => `${c.outputId}|${c.slot}`)).size).toBe(JUDGE_CALIBRATION.length);
    expect(JUDGE_CALIBRATION.every((c) => Object.keys(c.hand).length > 0)).toBe(true);
  });

  it("carries the notes' tallies: gpt-4.1-mini settles 8 of 9 steps, Luna none; Luna narrates the choice 12 of 12", () => {
    const verdicts = (arm: string, check: (typeof JUDGED_CHECKS)[number]) => JUDGE_CALIBRATION.filter((c) => c.id.endsWith(arm)).map((c) => c.hand[check]).filter((v) => v !== undefined);
    // M3's "settles" is the next step played early, so it reads partial for this step's own question
    expect(verdicts("-mini", "stepLeftOpen").filter((v) => v === false)).toHaveLength(7);
    expect(verdicts("-mini", "stepLeftOpen").filter((v) => v === "partial")).toHaveLength(1);
    expect(verdicts("-mini", "stepLeftOpen")).toHaveLength(9);
    expect(verdicts("-luna", "stepLeftOpen").every((v) => v === true)).toBe(true);
    const lunaSingle = JUDGE_CALIBRATION.filter((c) => /^S\d+-luna$/.test(c.id)).map((c) => c.hand.firstParagraphNarratesChoice);
    expect(lunaSingle.filter((v) => v === true)).toHaveLength(12);
    const miniSingle = JUDGE_CALIBRATION.filter((c) => /^S\d+-mini$/.test(c.id)).map((c) => c.hand.firstParagraphNarratesChoice);
    expect([miniSingle.filter((v) => v === true).length, miniSingle.filter((v) => v === "partial").length, miniSingle.filter((v) => v === false).length]).toEqual([6, 3, 3]);
  });

  it("keys a judge call by the turn it reads, per sample, in the turn rounds' stage", () => {
    const jobs = judgeJobs([{ outputId: "abc", slot: "player1", request: { prompt: "p", schema: judgeRequest(threadBeat(1), reply(), "player1")?.request.schema as never } }], LUNA, 2, "round0");
    const v = JUDGE_PROMPT_VERSION;
    expect(jobs.map(keyOf)).toEqual([`judge-v${v}-abc-player1|judge>${LUNA.key}|round0|s1`, `judge-v${v}-abc-player1|judge>${LUNA.key}|round0|s2`]);
    expect(jobs[0]).toMatchObject({ stage: "turn-rounds", group: "prep" });
    // A prompt change is judged afresh; the first version's ids carried no version
    expect(judgeCaseId(outputIdOf("outputs\\abc.json"), "player2", 1)).toBe("judge-abc-player2");
    expect(judgeCaseId("abc", "player2", 2)).toBe("judge-v2-abc-player2");
    expect(outputIdOf("outputs/abc.json")).toBe("abc");
    expect(DEFAULT_JUDGE_ARM).toBe("gpt-6-luna@low/prod");
  });
});

describe("scoreCalibration", () => {
  const items: CalibrationItem[] = [
    { id: "a", outputId: "a", slot: "player1", hand: { stepLeftOpen: true, concreteProgress: "partial" }, source: "" },
    { id: "b", outputId: "b", slot: "player1", hand: { stepLeftOpen: false }, source: "" },
    { id: "c", outputId: "c", slot: "player1", hand: { stepLeftOpen: true }, source: "" },
  ];
  const judged: JudgedItem[] = [
    { itemId: "a", armKey: "j", samples: [{ stepLeftOpen: true, concreteProgress: true }, { stepLeftOpen: true, concreteProgress: false }] },
    { itemId: "b", armKey: "j", samples: [{ stepLeftOpen: true }, { stepLeftOpen: true }] },
    { itemId: "c", armKey: "j", samples: [{ stepLeftOpen: false }] },
    { itemId: "a", armKey: "other", samples: [{ stepLeftOpen: false }] },
  ];

  it("counts agreement on sample 1, the two kinds of miss, the samples' agreement and the partial items apart", () => {
    const [open, progress] = scoreCalibration(items, judged, "j");
    expect(open).toMatchObject({ decided: 3, agree: 1, falsePasses: 1, falseFails: 1, handPasses: 2, handFails: 1, pairs: 2, pairsAgree: 2, reliable: false });
    expect(progress).toMatchObject({ decided: 0, partial: { yes: 1, no: 0 }, pairs: 1, pairsAgree: 0, reliable: false });
  });

  it("calls a check reliable at 85% agreement on the hand yes and on the hand no, at least 3 of each, and 90% between samples", () => {
    const allRight = { handPasses: 19, handFails: 3, falseFails: 0, falsePasses: 0, pairs: 22, pairsAgree: 22 };
    expect(isReliable(allRight)).toBe(true);
    // Always yes: 19 of 22 agree (86%) and the samples always agree, but no hand no is caught
    expect(isReliable({ ...allRight, falsePasses: 3 })).toBe(false);
    expect(isReliable({ ...allRight, falsePasses: 1 })).toBe(false);
    // Always no
    expect(isReliable({ ...allRight, falseFails: 19 })).toBe(false);
    // 9 of 10 yes and 6 of 7 no pass; 5 of 7 no does not
    expect(isReliable({ handPasses: 10, handFails: 7, falseFails: 1, falsePasses: 1, pairs: 17, pairsAgree: 17 })).toBe(true);
    expect(isReliable({ handPasses: 10, handFails: 7, falseFails: 1, falsePasses: 2, pairs: 17, pairsAgree: 17 })).toBe(false);
    // One hand no cannot show whether the judge fails a turn it should
    expect(isReliable({ handPasses: 9, handFails: 1, falseFails: 0, falsePasses: 0, pairs: 10, pairsAgree: 10 })).toBe(false);
    expect(isReliable({ ...allRight, pairsAgree: 19 })).toBe(false);
    expect(isReliable({ handPasses: 0, handFails: 0, falseFails: 0, falsePasses: 0, pairs: 0, pairsAgree: 0 })).toBe(false);
  });

  it("calls an always-yes judge reliable on no check of the hand-read set", () => {
    const allYes: JudgedItem[] = JUDGE_CALIBRATION.map((c) => ({
      itemId: c.id,
      armKey: "yes",
      samples: [1, 2].map(() => Object.fromEntries(JUDGED_CHECKS.map((check) => [check, true]))),
    }));
    expect(scoreCalibration(JUDGE_CALIBRATION, allYes, "yes").map((a) => a.reliable)).toEqual([false, false, false]);
  });

  it("renders a row per judge and check, the hand-no items per check, and every item with its hand and judged answers", () => {
    const md = renderCalibration({ items, judged, armKeys: ["j"], spentUsd: 0.01, generatedAt: new Date("2026-09-27T00:00:00Z"), problems: ["x: missing"] });
    expect(md).toContain("| j | stepLeftOpen | 1 of 3 (33%) | 2 / 1 | 1 | 1 | 2 of 2 | 0 / 0 | not reliable (too few hand yes and no) |");
    expect(md).toContain("- stepLeftOpen: 1 (b)");
    expect(md).toContain("- concreteProgress: none");
    expect(md).toContain("hand yes, judged yes/yes");
    expect(md).toContain("hand partial, judged yes/no");
    expect(md).toContain("- x: missing");
  });
});
