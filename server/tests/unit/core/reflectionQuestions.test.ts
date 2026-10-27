import { describe, expect, it } from "@jest/globals";
import {
  REFLECTION_QUESTION_MAX_LENGTH,
  REFLECTION_QUESTIONS_PER_OUTCOME,
  REFLECTION_QUESTIONS_PROBLEM,
  filledReflectionQuestions,
  keptReflectionQuestions,
  readReflectionQuestions,
  withOutcomeReflectionQuestions,
} from "core/types/index.js";

/*
 * Reflection questions: what people write for the players to think about once
 * a story is over, by outcome id. The client and the server read them through
 * one schema: at most five for an outcome, each with text and at most 300
 * characters.
 */

const questions = (count: number, length = 20) =>
  Array.from({ length: count }, (_, i) => `${i + 1}`.padEnd(length, "?"));

describe("readReflectionQuestions", () => {
  it("reads none from a value that names none", () => {
    expect(readReflectionQuestions(undefined)).toEqual({ questions: null });
    expect(readReflectionQuestions(null)).toEqual({ questions: null });
  });

  it("reads questions by outcome id, each trimmed", () => {
    expect(
      readReflectionQuestions({
        shared_harbour: ["  What would you have risked?  ", "Who paid for it?"],
        player1_name: [],
      })
    ).toEqual({
      questions: { shared_harbour: ["What would you have risked?", "Who paid for it?"], player1_name: [] },
    });
  });

  it(`takes ${REFLECTION_QUESTIONS_PER_OUTCOME} questions for an outcome, each of up to ${REFLECTION_QUESTION_MAX_LENGTH} characters`, () => {
    const most = questions(REFLECTION_QUESTIONS_PER_OUTCOME, REFLECTION_QUESTION_MAX_LENGTH);

    expect(readReflectionQuestions({ shared_harbour: most })).toEqual({ questions: { shared_harbour: most } });
  });

  it.each([
    ["more questions for an outcome than it takes", { shared_harbour: questions(REFLECTION_QUESTIONS_PER_OUTCOME + 1) }],
    ["a question longer than it takes", { shared_harbour: [questions(1, REFLECTION_QUESTION_MAX_LENGTH + 1)[0]] }],
    ["a blank question", { shared_harbour: ["   "] }],
    ["a question that isn't text", { shared_harbour: [7] }],
    ["questions that aren't a list", { shared_harbour: "What now?" }],
    ["a list in place of the outcomes", [["What now?"]]],
    ["text in place of the outcomes", "What now?"],
    ["an empty outcome id", { "": ["What now?"] }],
    ["an outcome id longer than any outcome's", { ["x".repeat(201)]: ["What now?"] }],
    ["more outcomes than any World holds", Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`o${i}`, ["Why?"]]))],
  ])("refuses %s, saying what it takes", (_what, value) => {
    expect(readReflectionQuestions(value)).toEqual({ problem: REFLECTION_QUESTIONS_PROBLEM });
  });

  it("refuses an outcome id that would reach an object's prototype", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const value = JSON.parse(`{"${key}": ["What now?"]}`);

      expect(readReflectionQuestions(value)).toEqual({ problem: REFLECTION_QUESTIONS_PROBLEM });
    }
  });

  it("says what it takes in words its writer can act on", () => {
    expect(REFLECTION_QUESTIONS_PROBLEM).toBe(
      "Reflection questions: at most 5 for each outcome, each one with text and at most 300 characters."
    );
  });
});

describe("keptReflectionQuestions", () => {
  const written = { shared_harbour: ["Who paid for it?"], player2_hideout: ["Was it worth it?"], player1_name: [] };

  it("keeps the questions of the outcomes named, in their order, leaving out those with none", () => {
    expect(keptReflectionQuestions(written, ["player2_hideout", "player1_name", "shared_harbour"])).toEqual({
      player2_hideout: ["Was it worth it?"],
      shared_harbour: ["Who paid for it?"],
    });
  });

  it("keeps nothing where no named outcome has a question, or there are none", () => {
    expect(keptReflectionQuestions(written, ["player1_name", "player3_vow"])).toBeUndefined();
    expect(keptReflectionQuestions(undefined, ["shared_harbour"])).toBeUndefined();
    expect(keptReflectionQuestions(null, ["shared_harbour"])).toBeUndefined();
  });

  it("gives copies, so changing them changes nothing kept", () => {
    const kept = keptReflectionQuestions(written, ["shared_harbour"]);
    kept?.shared_harbour?.push("And then?");

    expect(written.shared_harbour).toEqual(["Who paid for it?"]);
  });
});

describe("filledReflectionQuestions", () => {
  it("keeps the questions with text, trimmed, in order", () => {
    expect(filledReflectionQuestions(["  Why? ", "", "   ", "Who?"])).toEqual(["Why?", "Who?"]);
  });
});

describe("withOutcomeReflectionQuestions", () => {
  const before = { shared_harbour: ["Who paid for it?"], player1_name: ["Was the name worth it?"] };

  it("sets an outcome's questions, trimmed and without blank ones, leaving the others", () => {
    expect(withOutcomeReflectionQuestions(before, "shared_harbour", [" What changed? ", "", "Who paid for it?"])).toEqual({
      shared_harbour: ["What changed?", "Who paid for it?"],
      player1_name: ["Was the name worth it?"],
    });
    expect(before.shared_harbour).toEqual(["Who paid for it?"]);
  });

  it("drops an outcome left with no question, down to an empty set", () => {
    const fewer = withOutcomeReflectionQuestions(before, "shared_harbour", ["  "]);

    expect(fewer).toEqual({ player1_name: ["Was the name worth it?"] });
    expect(withOutcomeReflectionQuestions(fewer, "player1_name", [])).toEqual({});
  });

  it("starts a set for a World that has none yet", () => {
    expect(withOutcomeReflectionQuestions(undefined, "shared_harbour", ["Why?"])).toEqual({ shared_harbour: ["Why?"] });
  });
});
