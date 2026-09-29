import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  STORED_CHAPTERS,
  calibrationKey,
  calibrationTargets,
  chaptersToJudge,
  mergedTargets,
  planVerdict,
  plansToJudge,
  smokeTargets,
} from "../../../../src/evals/textModelEval/stagePrep.js";
import type { StageCalibrationItem } from "../../../../src/evals/textModelEval/stageJudge.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { evalCase, record } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const EXPOSE = "player1_expose_waste_ring";
const V2C = "gpt-6-luna@low/planV2c";

/** A chapter-planning case on the Waste Ring outcome with `recorded` of its 3 milestones. */
const planningState = (recorded: number) =>
  roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: { player1: [outcome(EXPOSE, { intendedNumberOfMilestones: 3, milestones: ["m1", "m2"].slice(0, recorded) })] },
    phases: [flavorSwitch(EXPOSE, "q", 4)],
  }).getState();

const RESULTS = { favorable: "f", mixed: "m", unfavorable: "u" };
const plan = (outcomeId = EXPOSE) => ({
  coordinationPatternSummary: "",
  duration: 2,
  threads: [
    {
      outcomeId,
      playersSideA: ["player1"],
      playersSideB: [],
      previousThreadTypesToBeAvoided: [],
      relevantSuggestedThreadTypes: [],
      typeOfThread: "Investigation",
      typeOfMilestone: "whether the proof holds",
      title: "The Archive",
      id: "the_archive",
      possibleMilestones: RESULTS,
      progression: [
        { title: "Search", question: "How does Arielle search?", possibleResolutions: RESULTS },
        { title: "Escape", question: "How does Arielle get out?", possibleResolutions: RESULTS },
      ],
    },
  ],
});

const planRecord = (overrides: Partial<CallRecord>): CallRecord =>
  record({ role: "thread", group: "thread", armKey: V2C, callArmKey: V2C, baseline: false, promptState: "round0", caseId: "thread-a", outputFile: "outputs\\o1.json", ...overrides });

const cases = [evalCase("thread-a", "thread", { state: planningState(1) }), evalCase("thread-last", "thread", { state: planningState(2) })];
const records = [
  planRecord({}),
  planRecord({ sample: 2, outputFile: "outputs\\o2.json" }),
  // Its last stage: nothing later to reach into, so no judge call
  planRecord({ caseId: "thread-last", outputFile: "outputs\\o3.json" }),
  // Another arm, another state, a failed call: not read
  planRecord({ armKey: "gpt-6-luna@low/prod", callArmKey: "gpt-6-luna@low/prod", outputFile: "outputs\\o4.json" }),
  planRecord({ promptState: "adopted1", outputFile: "outputs\\o5.json" }),
  planRecord({ outcome: "schema-mismatch", outputFile: "outputs\\o6.json" }),
];
const lookup = { records, cases, load: () => plan() };

describe("the plans to judge", () => {
  it("reads every final usable isolated chapter plan of the arms in the state, one judge call per thread the check applies to", () => {
    const plans = plansToJudge([V2C], "round0", lookup);
    expect(plans.map((p) => [p.caseId, p.sample, p.outputId, p.targets.map((t) => [t.key, t.samples])])).toEqual([
      ["thread-a", 1, "o1", [["o1-t0", 1]]],
      ["thread-a", 2, "o2", [["o2-t0", 1]]],
    ]);
    expect(plans[0].targets[0].request.prompt).toContain("it settles stage 2 of 3");
  });

  it("reads the stored chapters the cases read, as one pseudo-arm", () => {
    const state = roundStory({
      turns: 2,
      maxTurns: 20,
      playerOutcomes: { player1: [outcome(EXPOSE, { intendedNumberOfMilestones: 3 })] },
      phases: [topicSwitch([["Investigate", EXPOSE]], 0), endedChapter(EXPOSE, 3, 1, "m")],
    }).getState();
    const chapters = chaptersToJudge([evalCase("cont-a-t2", "beat", { state })]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ armKey: STORED_CHAPTERS, sample: 1 });
    expect(chapters[0].targets[0].key).toMatch(/^chapter-[0-9a-f]{12}-t0$/);
    // At the chapter's start its own milestone is not yet recorded: stage 1 of 3
    expect(chapters[0].targets[0].request.prompt).toContain("it settles stage 1 of 3");
  });
});

describe("the calibration's targets", () => {
  const items: StageCalibrationItem[] = [
    { id: "yes-item", source: { output: "o1" }, hand: true, writer: "w", note: "" },
    { id: "no-item", source: { constructed: { from: "o1", lastStepQuestion: "How does Arielle dismantle the ring?", milestones: { favorable: "The ring falls", mixed: "Half falls", unfavorable: "Nothing" } } }, hand: false, writer: "w", note: "" },
    { id: "last-item", source: { output: "o3" }, hand: true, writer: "w", note: "" },
    { id: "missing", source: { output: "nope" }, hand: false, writer: "w", note: "" },
  ];
  const { targets, problems } = calibrationTargets(items, lookup);

  it("builds each item's request at two samples, a stored plan's under the key its reading uses", () => {
    expect(targets.map((t) => [t.itemId, t.key, t.samples])).toEqual([
      ["yes-item", "o1-t0", 2],
      ["no-item", "hand-no-item", 2],
    ]);
    expect(calibrationKey(items[0])).toBe("o1-t0");
    expect(calibrationKey({ ...items[0], source: { chapter: "abc" }, thread: 1 })).toBe("chapter-abc-t1");
  });

  it("replaces a constructed item's last step and milestones, and says what it could not build", () => {
    const constructed = targets.find((t) => t.itemId === "no-item")?.request.prompt ?? "";
    expect(constructed).toContain("Step 2 (the last): Escape — How does Arielle dismantle the ring?\n  (its results are the possible milestones below)");
    expect(constructed).toContain("  favorable: The ring falls");
    expect(problems).toEqual(["last-item: the check does not apply (no later stage)", "missing: no stored plan or chapter to read"]);
  });

  it("merges a target read twice at its most samples, so the calibration's sample 1 is also its reading", () => {
    const plans = plansToJudge([V2C], "round0", lookup);
    const merged = mergedTargets([...targets, ...plans.flatMap((p) => p.targets)]);
    expect(merged.map((t) => [t.key, t.samples])).toEqual([
      ["o1-t0", 2],
      ["hand-no-item", 2],
      ["o2-t0", 1],
    ]);
  });
});

describe("a smoke's targets (--cases)", () => {
  it("keeps the calibration items and plans named, by item id or case id, and everything without a list", () => {
    const calibration = [{ itemId: "yes-item", key: "o1-t0", request: { prompt: "p", schema: undefined as never }, samples: 2 }];
    const plans = plansToJudge([V2C], "round0", lookup);
    expect(smokeTargets(calibration, plans, ["yes-item"]).map((t) => t.key)).toEqual(["o1-t0"]);
    expect(smokeTargets(calibration, plans, ["thread-a"]).map((t) => [t.key, t.samples])).toEqual([
      ["o1-t0", 1],
      ["o2-t0", 1],
    ]);
    expect(smokeTargets(calibration, plans, undefined).map((t) => [t.key, t.samples])).toEqual([
      ["o1-t0", 2],
      ["o2-t0", 1],
    ]);
  });
});

describe("planVerdict", () => {
  const [first] = plansToJudge([V2C], "round0", lookup);
  const twoThreads = { ...first, targets: [first.targets[0], { ...first.targets[0], key: "o1-t1" }] };

  it("passes a plan whose every judged thread passes, and waits while any is unanswered", () => {
    expect(planVerdict(twoThreads, () => true)).toMatchObject({ passes: true, threads: 2, caseId: "thread-a", sample: 1 });
    expect(planVerdict(twoThreads, (key) => key === "o1-t0")).toMatchObject({ passes: false });
    expect(planVerdict(twoThreads, (key) => (key === "o1-t0" ? true : undefined))).toBeUndefined();
  });
});
