import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { ARIELLE_FIRST_CHAPTER, lastChapterCases, stageCasesToFreeze, stageScopingCases } from "../../../../src/evals/textModelEval/stageCases.js";
import { STAGE_SCOPING_LAST_CHAPTER_CASES, STAGE_SCOPING_NEW_CASES } from "../../../../src/evals/textModelEval/arms.js";
import { foldsStages, isLastChapter, pickedOutcome, turnsLeft } from "../../../../src/game/services/storyTextRounds/pacing.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { evalCase } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const EXPOSE = "player1_expose_waste_ring";
const EXPOSE_MILESTONE = "The exposé successfully exposes key figures in the Clandestine Waste Ring.";

/** Novi Reg's shape at turn 2: the first switch chosen, then the first chapter's first step played. */
function secondTurnState() {
  return roundStory({
    turns: 2,
    maxTurns: 20,
    playerOutcomes: { player1: [outcome(EXPOSE, { intendedNumberOfMilestones: 3, milestones: [EXPOSE_MILESTONE] }), outcome("player1_redefine_identity")] },
    phases: [topicSwitch([["Investigate the Waste Ring to expose corruption", EXPOSE], ["Find yourself", "player1_redefine_identity"]], 0), endedChapter(EXPOSE, 3, 1, EXPOSE_MILESTONE)],
  }).getState();
}

describe("the stage scoping's built case: the Arielle story before its first chapter", () => {
  const base = evalCase(ARIELLE_FIRST_CHAPTER.base, "beat", { state: secondTurnState() });
  const { cases, problems } = stageScopingCases([base]);

  it("builds the one case the stage plans, a chapter-planning case marked as a round case", () => {
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(STAGE_SCOPING_NEW_CASES);
    const [built] = cases;
    expect(built).toMatchObject({ id: "round-thread-first-8988006e-t1", role: "thread" });
    expect(built.tags).toMatchObject({ source: "round", category: "first-chapter", hasStoredOutput: false });
    expect(built.note).toContain(ARIELLE_FIRST_CHAPTER.base);
    expect(built.note).toContain("before its first chapter");
  });

  it("cuts the state back to the first chapter's start: the switch chosen, no chapter plan, no milestone yet", () => {
    const story = caseStory(cases[0], false);
    expect(story.getCurrentTurn()).toBe(1);
    expect(story.getState().storyPhases).toHaveLength(1);
    expect(story.getCurrentSwitchAnalysis()).toBeDefined();
    expect(story.getOutcomeById(EXPOSE)?.milestones).toEqual([]);
    // The planner reads the chosen direction's outcome
    expect(pickedOutcome(story, "player1")?.outcomeId).toBe(EXPOSE);
    // The base is left as it was
    expect(base.state?.storyPhases).toHaveLength(2);
  });

  it("reports a missing base instead of building from nothing", () => {
    const missing = stageScopingCases([]);
    expect(missing.cases).toEqual([]);
    expect(missing.problems).toEqual([`${ARIELLE_FIRST_CHAPTER.id}: no frozen case ${ARIELLE_FIRST_CHAPTER.base}`]);
  });
});

describe("the climax arm's built cases: chapters in the story's last thread whose outcome still needs several milestones (2026-09-30)", () => {
  /** Novi Reg's second chapter plan: the first chapter ended with its milestone, the flavor switch on the Waste Ring chosen. */
  const noviRegT5 = () =>
    roundStory({
      turns: 5,
      maxTurns: 20,
      playerOutcomes: { player1: [outcome(EXPOSE, { intendedNumberOfMilestones: 3, milestones: [EXPOSE_MILESTONE] }), outcome("player1_redefine_identity")] },
      phases: [topicSwitch([["Investigate the Waste Ring", EXPOSE]], 0), endedChapter(EXPOSE, 3, 1, EXPOSE_MILESTONE), flavorSwitch(EXPOSE, "q", 4)],
    }).getState();
  const bandT5 = () =>
    roundStory({
      players: 3,
      turns: 5,
      maxTurns: 25,
      sharedOutcomes: [outcome("shared_group_chemistry")],
      playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_solo_success")], player3: [outcome("player3_social_impact")] },
      phases: [flavorSwitch("shared_group_chemistry", "q", 0, ["player1", "player2", "player3"]), endedChapter("shared_group_chemistry", 4, 1, "m", ["player1", "player2", "player3"]), flavorSwitch("shared_group_chemistry", "q", 4, ["player1", "player2", "player3"])],
    }).getState();
  const bases = [
    evalCase("thread-8988006e-t5-o0", "thread", { state: noviRegT5() }),
    evalCase("thread-8988006e-t5-o1", "thread", { state: noviRegT5() }),
    evalCase("round-thread-mp-965413e1-p3-t5", "thread", { state: bandT5() }),
  ];
  const { cases, problems } = lastChapterCases(bases);

  it("builds one chapter-planning case per last-chapter spec, each marked as a round case", () => {
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(STAGE_SCOPING_LAST_CHAPTER_CASES);
    for (const built of cases) {
      expect(built.role).toBe("thread");
      expect(built.tags).toMatchObject({ source: "round", category: "last-chapter", hasStoredOutput: false });
      expect(built.note).toContain("the story's last thread");
    }
    expect(cases.map((c) => c.note?.match(/Built from (\S+) by/)?.[1])).toEqual(bases.map((b) => b.id));
  });

  it("puts each chapter in the story's last thread with the turns it names, its outcome still needing several milestones", () => {
    expect(cases.map((c) => turnsLeft(caseStory(c, false)))).toEqual([4, 2, 4]);
    for (const built of cases) {
      const story = caseStory(built, false);
      expect(isLastChapter(turnsLeft(story))).toBe(true);
      expect(foldsStages(story)).toBe(true);
    }
    // The bases are left as they were
    expect(bases.map((b) => b.state?.maxTurns)).toEqual([20, 20, 25]);
  });

  it("freezes only the stage scoping's cases not frozen yet, unless rebuilding (--build-stage-cases)", () => {
    const arielleBase = evalCase(ARIELLE_FIRST_CHAPTER.base, "beat", { state: secondTurnState() });
    const [arielle] = stageScopingCases([arielleBase]).cases;
    const fresh = stageCasesToFreeze([arielleBase, ...bases, arielle], false);
    expect(fresh.problems).toEqual([]);
    expect(fresh.cases.map((c) => c.id)).toEqual(STAGE_SCOPING_LAST_CHAPTER_CASES);
    expect(fresh.skipped).toEqual([ARIELLE_FIRST_CHAPTER.id]);
    expect(stageCasesToFreeze([arielleBase, ...bases, arielle], true).cases.map((c) => c.id)).toEqual([...STAGE_SCOPING_NEW_CASES, ...STAGE_SCOPING_LAST_CHAPTER_CASES]);
    expect(stageCasesToFreeze([arielleBase], false).problems).toHaveLength(3);
  });

  it("reports a missing base instead of building from nothing", () => {
    const missing = lastChapterCases([]);
    expect(missing.cases).toEqual([]);
    expect(missing.problems).toHaveLength(3);
    expect(missing.problems[0]).toBe("round-thread-last4-8988006e-t5: no frozen case thread-8988006e-t5-o0");
  });
});
