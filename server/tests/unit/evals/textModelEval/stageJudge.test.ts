import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { makeArm } from "../../../../src/evals/textModelEval/arms.js";
import {
  STAGE_CHECK,
  STAGE_JUDGE_CALIBRATION,
  judgedStage,
  judgedThread,
  renderStageJudge,
  scoreStageCalibration,
  stageEvidenceFrom,
  stageJudgeCaseId,
  stageJudgeJobs,
  stageJudgeRequest,
  stageReadings,
  stageVerdictFrom,
  type JudgedPlan,
} from "../../../../src/evals/textModelEval/stageJudge.js";
import { flavorSwitch, outcome, roundStory } from "../../../helpers/roundStories.js";

const EXPOSE = "player1_expose_waste_ring";
const EXPOSED = "The exposé exposes key figures in the Waste Ring.";

const story = (recorded: number, intended = 3) =>
  roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: {
      player1: [
        outcome(EXPOSE, {
          question: "Does the player expose and dismantle the Clandestine Waste Ring?",
          intendedNumberOfMilestones: intended,
          milestones: [EXPOSED, "Second"].slice(0, recorded),
        }),
      ],
    },
    phases: [flavorSwitch(EXPOSE, "q", 4)],
  });

const MILESTONES = { favorable: "Arielle unites the leaders", mixed: "A few leaders join", unfavorable: "The leaders withdraw" };
const stored = {
  outcomeId: EXPOSE,
  title: "Building a Coalition",
  playersSideA: ["player1"],
  playersSideB: [],
  typeOfMilestone: "whether the leaders keep pressure on the Waste Ring",
  question: "Can Arielle secure a coalition to keep pressure on the Waste Ring?",
  plan: "The plan's own text.",
  outcomeStages: ["expose the key figures", "SECRET STAGE LIST", "dismantle the ring"],
  possibleMilestones: MILESTONES,
  progression: [
    { title: "First meeting", question: "How does Arielle approach Maya?", possibleResolutions: { favorable: "Maya listens", mixed: "Maya hesitates", unfavorable: "Maya refuses" } },
    { title: "The commitment", question: "How does Arielle ask them to commit?", possibleResolutions: MILESTONES },
  ],
};

describe("the thread the judge reads", () => {
  it("keeps what every planner form writes and the chapter question, never a plan's own stage list or plan text", () => {
    const thread = judgedThread(stored);
    expect(Object.keys(thread).sort()).toEqual(["outcomeId", "playersSideA", "playersSideB", "possibleMilestones", "progression", "question", "title", "typeOfMilestone"]);
    expect(JSON.stringify(thread)).not.toContain("SECRET STAGE LIST");
    expect(JSON.stringify(thread)).not.toContain("The plan's own text.");
    expect(judgedThread({ ...stored, question: "  " }).question).toBeUndefined();
  });

  it("applies where the outcome has a later stage: stage k of n with k < n", () => {
    expect(judgedStage(story(0), stored)).toEqual({ stage: 1, of: 3 });
    expect(judgedStage(story(1), stored)).toEqual({ stage: 2, of: 3 });
    // The last stage settles the outcome itself, and a complete outcome's chapter is an aftermath: nothing later to reach into
    expect(judgedStage(story(2), stored)).toBeUndefined();
    expect(judgedStage(story(1, 1), stored)).toBeUndefined();
    expect(judgedStage(story(0), { outcomeId: "player1_unknown" })).toBeUndefined();
  });
});

describe("stageJudgeRequest", () => {
  const request = stageJudgeRequest(story(1), judgedThread(stored));

  it("shows the outcome, its milestones so far and the stage the chapter settles", () => {
    expect(request).toBeDefined();
    const prompt = request?.prompt ?? "";
    expect(prompt).toContain("Question: Does the player expose and dismantle the Clandestine Waste Ring?");
    expect(prompt).toContain(`Milestones so far:\n  1. ${EXPOSED}`);
    expect(prompt).toContain("This chapter adds milestone 2: it settles stage 2 of 3. Stage 3 comes in a later chapter.");
    expect(prompt).toContain(`${STAGE_CHECK}: Does this chapter stay within stage 2 of 3?`);
    expect(stageJudgeRequest(story(0), judgedThread(stored))?.prompt).toContain("Milestones so far: none.\nThis chapter adds milestone 1: it settles stage 1 of 3. Stages 2 and 3 come in later chapters.");
    expect(stageJudgeRequest(story(0, 5), judgedThread(stored))?.prompt).toContain("it settles stage 1 of 5. Stages 2 to 5 come in later chapters.");
  });

  it("shows the plan's steps with their results, the last one pointing at the milestones it repeats, and the chapter question", () => {
    const prompt = request?.prompt ?? "";
    expect(prompt).toContain("Step 1: First meeting — How does Arielle approach Maya?\n  favorable: Maya listens");
    expect(prompt).toContain("Step 2 (the last): The commitment — How does Arielle ask them to commit?\n  (its results are the possible milestones below)");
    expect(prompt).toContain("Possible milestones (one is added to the outcome when the chapter ends):\n  favorable: Arielle unites the leaders");
    expect(prompt).toContain("Chapter question: Can Arielle secure a coalition to keep pressure on the Waste Ring?");
    expect(prompt).toContain("Kind of milestone: whether the leaders keep pressure on the Waste Ring");
    // Today's form's last step has results of its own: they show
    const today = judgedThread({ ...stored, question: undefined, progression: [stored.progression[0], { ...stored.progression[1], possibleResolutions: { favorable: "An exposé", mixed: "A report", unfavorable: "Nothing" } }] });
    const own = stageJudgeRequest(story(1), today)?.prompt ?? "";
    expect(own).toContain("Step 2 (the last): The commitment — How does Arielle ask them to commit?\n  favorable: An exposé");
    expect(own).not.toContain("Chapter question:");
  });

  it("reads the same for every arm: no plan's own stage list, and its example is not the planner's", () => {
    const prompt = request?.prompt ?? "";
    expect(prompt).not.toContain("SECRET STAGE LIST");
    expect(prompt).not.toContain("Rikkit");
    expect(prompt).toContain("Mara");
    expect(JSON.stringify(toJsonSchema(request!.schema))).toContain(STAGE_CHECK);
  });

  it("is not built where the check does not apply", () => {
    expect(stageJudgeRequest(story(2), judgedThread(stored))).toBeUndefined();
    expect(stageJudgeRequest(story(1, 1), judgedThread(stored))).toBeUndefined();
  });
});

describe("the judge's reply and calls", () => {
  it("reads the verdict, the evidence and the stages it named", () => {
    const reply = { stages: ["expose", "pressure", "dismantle"], [STAGE_CHECK]: { evidence: "'plan to expose'", answer: "no" } };
    expect(stageVerdictFrom(reply)).toBe(false);
    expect(stageVerdictFrom({ [STAGE_CHECK]: { answer: "yes" } })).toBe(true);
    expect(stageVerdictFrom({})).toBeUndefined();
    expect(stageEvidenceFrom(reply)).toEqual({ evidence: "'plan to expose'", stages: ["expose", "pressure", "dismantle"] });
  });

  it("plans one prep call per target and sample, keyed by the prompt's version", () => {
    const arm = makeArm({ model: "gpt-6-luna", reasoningEffort: "low" });
    const jobs = stageJudgeJobs([{ key: "abc-t0", request: request(), samples: 2 }, { key: "def-t1", request: request(), samples: 1 }], arm, "round0", "stage-scoping");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.group, j.armKey])).toEqual([
      [stageJudgeCaseId("abc-t0"), 1, "stage-scoping", "prep", "judge>gpt-6-luna@low/prod"],
      [stageJudgeCaseId("abc-t0"), 2, "stage-scoping", "prep", "judge>gpt-6-luna@low/prod"],
      [stageJudgeCaseId("def-t1"), 1, "stage-scoping", "prep", "judge>gpt-6-luna@low/prod"],
    ]);
    expect(stageJudgeCaseId("abc-t0")).toBe("judge-stage-v1-abc-t0");
    function request() {
      return stageJudgeRequest(story(1), judgedThread(stored))!;
    }
  });
});

describe("the calibration", () => {
  it("holds enough hand yes and hand no to be read, from more than one writer on each side", () => {
    const yes = STAGE_JUDGE_CALIBRATION.filter((i) => i.hand === true);
    const no = STAGE_JUDGE_CALIBRATION.filter((i) => i.hand === false);
    // At least 7 per side, so one miss still reads as 85% or better
    expect(yes.length).toBeGreaterThanOrEqual(7);
    expect(no.length).toBeGreaterThanOrEqual(7);
    expect(new Set(STAGE_JUDGE_CALIBRATION.map((i) => i.id)).size).toBe(STAGE_JUDGE_CALIBRATION.length);
    expect(new Set(no.map((i) => i.writer.split(" ")[0])).size).toBeGreaterThan(1);
    expect(new Set(yes.map((i) => i.writer.split(" ")[0])).size).toBeGreaterThan(1);
    // The owner's example is a hand no
    expect(STAGE_JUDGE_CALIBRATION.find((i) => i.id === "owner-waste-ring")).toMatchObject({ hand: false, source: { chapter: "ca5b2055bfee" } });
    // Each constructed no is built from a plan read as a hand yes
    for (const item of STAGE_JUDGE_CALIBRATION) {
      if ("constructed" in item.source) {
        const from = item.source.constructed.from;
        expect(STAGE_JUDGE_CALIBRATION.some((other) => "output" in other.source && other.source.output === from && other.hand === true)).toBe(true);
      }
    }
  });

  it("scores sample 1 against the hand on each side, the samples' agreement, and partial items apart", () => {
    const items = [
      { id: "a", source: { output: "a" }, hand: true, writer: "w", note: "" },
      { id: "b", source: { output: "b" }, hand: true, writer: "w", note: "" },
      { id: "c", source: { output: "c" }, hand: true, writer: "w", note: "" },
      { id: "d", source: { output: "d" }, hand: false, writer: "w", note: "" },
      { id: "e", source: { output: "e" }, hand: false, writer: "w", note: "" },
      { id: "f", source: { output: "f" }, hand: false, writer: "w", note: "" },
      { id: "g", source: { output: "g" }, hand: "partial" as const, writer: "w", note: "" },
    ];
    const judged = (answers: Record<string, (boolean | undefined)[]>) => Object.entries(answers).map(([itemId, samples]) => ({ itemId, samples }));
    const all = scoreStageCalibration(items, judged({ a: [true, true], b: [true, true], c: [true, true], d: [false, false], e: [false, false], f: [false, false], g: [true, true] }));
    expect(all).toMatchObject({ decided: 6, agree: 6, handPasses: 3, handFails: 3, pairs: 7, pairsAgree: 7, partial: { yes: 1, no: 0 }, reliable: true });
    // The samples' agreement counts every item, partial ones too: 6 of 7 is under 90%
    const unsteady = scoreStageCalibration(items, judged({ a: [true, true], b: [true, true], c: [true, true], d: [false, false], e: [false, false], f: [false, false], g: [true, false] }));
    expect(unsteady).toMatchObject({ agree: 6, pairs: 7, pairsAgree: 6, reliable: false });
    // One false pass among three hand no is 67%: not reliable
    const miss = scoreStageCalibration(items, judged({ a: [true], b: [true], c: [true], d: [true], e: [false], f: [false] }));
    expect(miss).toMatchObject({ agree: 5, falsePasses: 1, falseFails: 0, reliable: false });
  });
});

describe("stageReadings", () => {
  const plan = (armKey: string, caseId: string, sample: number, passes: boolean): JudgedPlan => ({ armKey, caseId, sample, outputId: `${armKey}-${caseId}-${sample}`, passes, threads: 1 });
  const V2C = "gpt-6-luna@low/planV2c";
  const V2D = "gpt-6-luna@low/planV2d";
  const PROD = "gpt-6-luna@low/prod";

  it("reads a candidate against each reference on the plans both have, with the reference's two-sample noise and the stop rule", () => {
    const cases = ["a", "b", "c", "d", "e"];
    const plans = [
      ...cases.flatMap((c) => [plan(V2C, c, 1, c === "a" ? false : true), plan(V2C, c, 2, true)]),
      ...cases.flatMap((c) => [plan(V2D, c, 1, true), plan(V2D, c, 2, true)]),
      plan(PROD, "a", 1, false),
      plan(PROD, "a", 2, false),
    ];
    const readings = stageReadings(plans, (key) => (key === V2D ? [V2C, PROD] : []));
    const v2d = readings.filter((r) => r.armKey === V2D);
    expect(v2d.map((r) => r.referenceKey)).toEqual([V2C, PROD]);
    const [vsC, vsProd] = v2d;
    expect(vsC.vsReference).toMatchObject({ reference: { hits: 9, n: 10 }, arm: { hits: 10, n: 10 } });
    expect(vsC.vsReference?.noise).toBeCloseTo(0.2);
    // 90% → 100% is within a noise of 20 points
    expect(vsC.vsReference?.beyondNoise).toBeUndefined();
    // Against today's form only the pairs both have count: case a, both samples
    expect(vsProd.vsReference).toMatchObject({ reference: { hits: 0, n: 2 }, arm: { hits: 2, n: 2 }, noise: 0 });
    expect(vsProd.vsReference?.beyondNoise).toBe("higher");
    expect(readings.find((r) => r.armKey === V2C)).toEqual({ armKey: V2C, plans: { hits: 9, n: 10 } });
  });
});

describe("renderStageJudge", () => {
  it("renders the calibration, the readings, the items and where the judge disagreed", () => {
    const items = STAGE_JUDGE_CALIBRATION.slice(0, 2);
    const text = renderStageJudge({
      items,
      calibration: scoreStageCalibration(items, [{ itemId: items[0].id, samples: [true, true] }]),
      judged: [{ itemId: items[0].id, samples: [true, true], evidence: [{ evidence: "'plan to expose'", stages: ["gather", "expose", "dismantle"] }] }],
      readings: [{ armKey: "gpt-6-luna@low/planV2d", plans: { hits: 3, n: 4 } }],
      failures: [{ armKey: "gpt-6-luna@low/planV2d", caseId: "thread-x", sample: 1, outputId: "o1", evidence: "'exposes the ring'" }],
      spentUsd: 0.01,
      generatedAt: new Date("2026-09-29T00:00:00Z"),
      problems: [],
    });
    expect(text).toContain("# Judged check: the chapter stays within its stage");
    expect(text).toContain("| owner-waste-ring |");
    expect(text).toContain("- owner-waste-ring: hand no, judged yes. Stages: gather; expose; dismantle. Evidence: 'plan to expose'");
    expect(text).toContain("| gpt-6-luna@low/planV2d | 3 of 4 (75%) |");
    expect(text).toContain("- gpt-6-luna@low/planV2d thread-x s1 (o1): 'exposes the ring'");
  });
});
