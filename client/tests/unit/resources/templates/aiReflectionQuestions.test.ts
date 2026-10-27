import type { Outcome, PlayerOptionsGeneration, StoryTemplate } from "core/types";
import {
  lostReflectionQuestions,
  outcomesAfterAccepting,
  reflectionQuestionCount,
  reflectionQuestionsHeldBy,
  templateOutcomes,
} from "../../../../src/resources/templates/utils/aiReflectionQuestions";

/*
 * An AI change that replaces outcomes (Improve Outcomes, Improve Players, AI
 * Draft) and their reflection questions: an outcome whose id the change keeps
 * keeps its questions; one it drops takes its questions with it, and the
 * author is told which before accepting.
 */

const outcome = (id: string, question: string): Outcome => ({
  id,
  question,
  possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" },
  resonance: "",
  intendedNumberOfMilestones: 2,
  milestones: [],
});
const seat = (...outcomes: Outcome[]) => ({ outcomes }) as unknown as PlayerOptionsGeneration;

const HARBOUR = outcome("shared_harbour", "Does the harbour reopen?");
const BELL = outcome("shared_bell", "Does the bell ring again?");
const NAME = outcome("player1_name", "Does the keeper clear the name?");
const HIDEOUT = outcome("player2_hideout", "Does the hideout hold?");

const WORLD = {
  sharedOutcomes: [HARBOUR, BELL],
  player1: seat(NAME),
  player2: seat(HIDEOUT),
  reflectionQuestions: {
    shared_harbour: ["Who paid for it?", "Would you sail home?"],
    shared_bell: ["Who rang it?"],
    player2_hideout: ["Whom did it keep safe?"],
  },
} as unknown as StoryTemplate;

describe("templateOutcomes", () => {
  it("lists the shared outcomes, then each seat's own", () => {
    expect(templateOutcomes(WORLD).map(({ id }) => id)).toEqual([
      "shared_harbour",
      "shared_bell",
      "player1_name",
      "player2_hideout",
    ]);
  });
});

describe("outcomesAfterAccepting", () => {
  it("puts accepted shared outcomes in place of the World's, keeping the seats' own", () => {
    const reworded = { ...HARBOUR, question: "Does the harbour open by spring?" };
    const after = outcomesAfterAccepting(WORLD, "sharedOutcomes", { sharedOutcomes: [reworded] });

    expect(after.map(({ id }) => id)).toEqual(["shared_harbour", "player1_name", "player2_hideout"]);
  });

  it("puts accepted seats' options in place of those seats', keeping the shared outcomes and other seats", () => {
    const after = outcomesAfterAccepting(WORLD, "players", { player2: seat(outcome("player2_escape", "Does she get out?")) });

    expect(after.map(({ id }) => id)).toEqual(["shared_harbour", "shared_bell", "player1_name", "player2_escape"]);
  });

  it("changes no outcome for a section that holds none", () => {
    expect(outcomesAfterAccepting(WORLD, "guidelines", {})).toEqual(templateOutcomes(WORLD));
  });
});

describe("lostReflectionQuestions", () => {
  it("names each outcome with questions that the change drops, by its question, and how many it holds", () => {
    const after = outcomesAfterAccepting(WORLD, "sharedOutcomes", { sharedOutcomes: [HARBOUR] });

    expect(lostReflectionQuestions(WORLD.reflectionQuestions, templateOutcomes(WORLD), after)).toEqual([
      { outcomeId: "shared_bell", question: "Does the bell ring again?", count: 1 },
    ]);
  });

  it("loses nothing where the change keeps every id, however it rewords the questions", () => {
    const reworded = [HARBOUR, BELL].map((o) => ({ ...o, question: `${o.question} (reworded)` }));
    const after = outcomesAfterAccepting(WORLD, "sharedOutcomes", { sharedOutcomes: reworded });

    expect(lostReflectionQuestions(WORLD.reflectionQuestions, templateOutcomes(WORLD), after)).toEqual([]);
  });

  it("says nothing of a dropped outcome that had no questions", () => {
    const after = outcomesAfterAccepting(WORLD, "players", { player1: seat() });

    expect(lostReflectionQuestions(WORLD.reflectionQuestions, templateOutcomes(WORLD), after)).toEqual([]);
  });

  it("names every outcome with questions when all are replaced (AI Draft)", () => {
    expect(lostReflectionQuestions(WORLD.reflectionQuestions, templateOutcomes(WORLD), [])).toEqual([
      { outcomeId: "shared_harbour", question: "Does the harbour reopen?", count: 2 },
      { outcomeId: "shared_bell", question: "Does the bell ring again?", count: 1 },
      { outcomeId: "player2_hideout", question: "Does the hideout hold?", count: 1 },
    ]);
  });
});

describe("reflectionQuestionsHeldBy", () => {
  it("keeps the questions of the outcomes the World still holds, by id, and drops the rest", () => {
    const accepted = { ...WORLD, sharedOutcomes: [{ ...HARBOUR, question: "Reworded?" }] } as StoryTemplate;

    expect(reflectionQuestionsHeldBy(accepted)).toEqual({
      shared_harbour: ["Who paid for it?", "Would you sail home?"],
      player2_hideout: ["Whom did it keep safe?"],
    });
  });

  it("leaves {} once the World had questions and none is left, so saving it removes them", () => {
    const replaced = { ...WORLD, sharedOutcomes: [], player2: seat() } as unknown as StoryTemplate;

    expect(reflectionQuestionsHeldBy(replaced)).toEqual({});
  });

  it("leaves a World that had no questions without any", () => {
    expect(reflectionQuestionsHeldBy({ ...WORLD, reflectionQuestions: undefined })).toBeUndefined();
  });
});

describe("reflectionQuestionCount", () => {
  it("counts the questions lost, in the singular for one", () => {
    expect(reflectionQuestionCount([{ outcomeId: "a", question: "A?", count: 2 }, { outcomeId: "b", question: "B?", count: 1 }])).toBe(
      "3 reflection questions"
    );
    expect(reflectionQuestionCount([{ outcomeId: "a", question: "A?", count: 1 }])).toBe("1 reflection question");
  });
});
