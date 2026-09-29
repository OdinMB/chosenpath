import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { ARIELLE_FIRST_CHAPTER, stageScopingCases } from "../../../../src/evals/textModelEval/stageCases.js";
import { STAGE_SCOPING_NEW_CASES } from "../../../../src/evals/textModelEval/arms.js";
import { pickedOutcome } from "../../../../src/game/services/storyTextRounds/pacing.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
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
