import type { CreateStoryFromTemplateRequest, TemplateReflectionOutcome } from "core/types/api";
import {
  batchReflectionQuestions,
  outcomesForSeats,
  questionCount,
  worldDrafts,
} from "../../../src/page/hooks/useBatchReflectionQuestions";
import { multiStoryRequest } from "../../../src/page/hooks/useMultiStoryCreation";

/*
 * Reflection questions for several stories at once: they start as the
 * World's own, whoever starts the stories can change them for those stories,
 * and every start of the batch sends the questions of the outcomes its
 * stories play.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

const outcome = (
  id: string,
  owner: TemplateReflectionOutcome["owner"],
  reflectionQuestions: string[] = []
): TemplateReflectionOutcome => ({ id, owner, question: `Question of ${id}?`, reflectionQuestions });

const WORLD = [
  outcome("shared_harbour", "shared", ["Who paid for the storm wall?"]),
  outcome("player1_name", "player1"),
  outcome("player2_hideout", "player2", ["Whom did the hideout keep safe?"]),
  outcome("player3_vow", "player3", ["Was the vow worth it?"]),
];

const SETTINGS: CreateStoryFromTemplateRequest = {
  templateId: "template-1",
  playerCount: 2,
  maxTurns: 10,
  generateImages: true,
  pregenerateBeats: false,
  difficultyLevel: { modifier: 0, title: "Normal" },
};

describe("outcomesForSeats", () => {
  it("keeps the shared outcomes and the own outcomes of the seats the stories have", () => {
    expect(outcomesForSeats(WORLD, 2).map(({ id }) => id)).toEqual(["shared_harbour", "player1_name", "player2_hideout"]);
    expect(outcomesForSeats(WORLD, 1).map(({ id }) => id)).toEqual(["shared_harbour", "player1_name"]);
    expect(outcomesForSeats(WORLD, 3)).toEqual(WORLD);
  });
});

describe("worldDrafts", () => {
  it("starts every outcome with the World's questions, as copies", () => {
    const drafts = worldDrafts(WORLD);

    expect(drafts).toEqual({
      shared_harbour: ["Who paid for the storm wall?"],
      player1_name: [],
      player2_hideout: ["Whom did the hideout keep safe?"],
      player3_vow: ["Was the vow worth it?"],
    });
    drafts.shared_harbour?.push("And then?");
    expect(WORLD[0]?.reflectionQuestions).toEqual(["Who paid for the storm wall?"]);
  });
});

describe("batchReflectionQuestions", () => {
  it("sends the filled questions of the outcomes the stories play, and none of the others", () => {
    const drafts = { ...worldDrafts(WORLD), player1_name: [" What name now? ", ""] };

    expect(batchReflectionQuestions(drafts, outcomesForSeats(WORLD, 2))).toEqual({
      shared_harbour: ["Who paid for the storm wall?"],
      player1_name: ["What name now?"],
      player2_hideout: ["Whom did the hideout keep safe?"],
    });
  });

  it("sends an empty set when every question was taken away, so the stories show none", () => {
    expect(batchReflectionQuestions({ shared_harbour: ["  "] }, outcomesForSeats(WORLD, 1))).toEqual({});
  });
});

describe("questionCount", () => {
  it("counts the filled questions the stories will show", () => {
    const drafts = { ...worldDrafts(WORLD), player1_name: ["Why?", " "] };

    expect(questionCount(drafts, outcomesForSeats(WORLD, 2))).toBe(3);
    expect(questionCount({}, WORLD)).toBe(0);
  });
});

describe("multiStoryRequest with reflection questions", () => {
  it("sends the batch's questions with every start", () => {
    const questions = { shared_harbour: ["Who paid?"] };

    const { request, count } = multiStoryRequest(SETTINGS, 3, 2, questions);

    expect(request).toEqual({
      ...SETTINGS,
      generateImages: false,
      reflectionQuestions: questions,
    });
    expect(count).toBe(2);
  });

  it("sends no questions when the batch has none to send, so each story takes the World's", () => {
    expect(multiStoryRequest(SETTINGS, 3).request).not.toHaveProperty("reflectionQuestions");
  });
});
