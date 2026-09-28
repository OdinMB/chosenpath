import { describe, expect, it, jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { checkThreadPlan } from "../../../../src/game/services/planChecks.js";
import { threadStep } from "../../../../src/game/services/storyTextSteps.js";
import { outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";

/*
 * A single player's chapter reply writes no outcome: the player's pick sets
 * it. When the pick names no outcome the story knows (a third option the
 * switch turn invented beside two directions, or a switch planned before
 * planner v2 whose chosen direction names no id), the chapter takes a
 * fallback, the outcome that still needs the most milestones, and the
 * planner's prompt names it; without it the plan could never pass the check,
 * whatever the planner wrote, and the story would stop at that switch.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";

const REPLY = {
  thread: {
    kind: "challenge",
    typeOfThread: "Negotiation",
    title: "The Enclave Gate",
    question: "Will Gruk open the gate?",
    possibleMilestones: { favorable: "Gruk opens it", mixed: "Gruk hesitates", unfavorable: "Gruk bars it" },
    steps: [
      { title: "Knock", question: "Approach: How does Rikkit ask?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } },
      { title: "Push", question: "Leverage: How does Rikkit press?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } },
    ],
    finalStep: { title: "The ask", question: "How does Rikkit settle it?" },
    plan: "Rikkit stays at the gate.",
  },
};

/** A single player who picked the third option of a switch that planned two directions (GUILD needs 1 more, ENCLAVE 3). */
function pickedAnInventedOption(): Story {
  const plan = topicSwitch([["Meet Sir Bram", GUILD], ["Visit the enclave", ENCLAVE]], 4);
  return roundStory({
    turns: 5,
    maxTurns: 20,
    lastChoice: 2,
    playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 1 }), outcome(ENCLAVE, { intendedNumberOfMilestones: 3 })] },
    phases: [
      {
        ...plan,
        switches: plan.switches.map((sw) => ({
          ...sw,
          topicDirections: [
            { direction: "Meet Sir Bram", outcomeId: GUILD },
            { direction: "Visit the enclave", outcomeId: ENCLAVE },
          ],
        })),
      },
    ],
  });
}

const outcomeOf = (plan: ThreadAnalysis) => plan.threads[0].outcomeId;
const notes = (story: Story, plan: ThreadAnalysis) => checkThreadPlan(story, plan).repairs.filter((r) => r.note).map((r) => r.kind);

describe("a single player's chapter whose pick names no outcome", () => {
  it("takes the outcome that still needs the most milestones, and the plan passes the check", () => {
    const story = pickedAnInventedOption();

    const plan = threadStep.request(story).assemble(REPLY);

    expect(outcomeOf(plan)).toBe(ENCLAVE);
    expect(checkThreadPlan(story, plan, { lengths: true }).problem).toBeUndefined();
  });

  it("tells the planner that outcome, in PLAYER DECISIONS and PACING", () => {
    const prompt = threadStep.request(pickedAnInventedOption()).prompt;

    expect(prompt).toContain(`player1 chose direction 3 of 2: "player1 option 4.2"\nThis thread pushes: Question of ${ENCLAVE}? (${ENCLAVE}).`);
    expect(prompt).toContain(`The outcome this thread pushes: ${ENCLAVE}: 0 of 3 milestones; 3 still needed.`);
  });

  it("notes the fallback, so the log counts it", () => {
    const story = pickedAnInventedOption();

    expect(notes(story, threadStep.request(story).assemble(REPLY))).toEqual(["chapterOutcomeFallback"]);
  });

  it("takes the fallback when no switch was played at all", () => {
    const story = roundStory({ turns: 1, maxTurns: 20, playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 1 }), outcome(ENCLAVE, { intendedNumberOfMilestones: 3 })] } });

    const plan = threadStep.request(story).assemble(REPLY);

    expect(outcomeOf(plan)).toBe(ENCLAVE);
    expect(checkThreadPlan(story, plan).problem).toBeUndefined();
  });

  it("keeps the picked outcome, with no note, when the pick names one", () => {
    const plan = topicSwitch([["Meet Sir Bram", GUILD], ["Visit the enclave", ENCLAVE]], 4);
    const story = roundStory({
      turns: 5,
      maxTurns: 20,
      lastChoice: 0,
      playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 1 }), outcome(ENCLAVE, { intendedNumberOfMilestones: 3 })] },
      phases: [plan],
    });

    const assembled = threadStep.request(story).assemble(REPLY);

    expect(outcomeOf(assembled)).toBe(GUILD);
    expect(notes(story, assembled)).toEqual([]);
  });
});
