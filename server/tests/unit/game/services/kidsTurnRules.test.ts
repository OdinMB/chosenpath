import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { FULL_TEXT_COUNT, beatReplyProblem } from "../../../../src/game/services/beatChecks.js";
import { KIDS_TEXT_COUNT, beatCheckOptions, kidsListener, takesKidsRules } from "../../../../src/game/services/kidsTurnRules.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";
import { requestFor } from "../../../../src/evals/textModelEval/variants.js";
import { endingBeat, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, PARAGRAPH } from "../../../helpers/textFixtures.js";

/*
 * A single player's turn in a story read with a child (adopted from the
 * kids-turns stage, 2026-10-01): which turns take the kids rules, who listens,
 * and the length a retry of a one-paragraph reply asks for.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const KIDS = { category: "read-with-kids" as const, readingAge: "5" };

describe("takesKidsRules", () => {
  it("a single player's story read with a child; never a group's, never another category", () => {
    expect(takesKidsRules(threadBeat(1, KIDS))).toBe(true);
    expect(takesKidsRules(threadBeat(1, { category: "read-with-kids" }))).toBe(true);
    expect(takesKidsRules(threadBeat(2, KIDS))).toBe(false);
    expect(takesKidsRules(threadBeat(1))).toBe(false);
    expect(takesKidsRules(threadBeat(1, { category: "enjoy-fiction" }))).toBe(false);
  });
});

describe("kidsListener", () => {
  it("the recorded age, or a young child", () => {
    expect(kidsListener(threadBeat(1, KIDS))).toBe("a child aged 5");
    expect(kidsListener(threadBeat(1, { category: "read-with-kids", readingAge: "8-10" }))).toBe("a child aged 8-10");
    expect(kidsListener(threadBeat(1, { category: "read-with-kids" }))).toBe("a young child");
  });
});

describe("beatCheckOptions: production's check of a beat reply", () => {
  it("flags the ending, and asks a kids turn's retry for its short count", () => {
    expect(beatCheckOptions(threadBeat(1))).toEqual({ ending: false });
    expect(beatCheckOptions(endingBeat(1))).toEqual({ ending: true });
    expect(beatCheckOptions(threadBeat(1, KIDS))).toEqual({ ending: false, textCount: KIDS_TEXT_COUNT });
    expect(beatCheckOptions(threadBeat(2, KIDS))).toEqual({ ending: false });
    const short = beatSet(1, { player1: beatGeneration({ text: PARAGRAPH }) });
    expect(beatReplyProblem(short, beatCheckOptions(threadBeat(1, KIDS)))).toContain(`write every player's text as ${KIDS_TEXT_COUNT}`);
    expect(beatReplyProblem(short, beatCheckOptions(threadBeat(1)))).toContain(FULL_TEXT_COUNT);
  });
});

describe("the eval's adopted request carries production's retry count", () => {
  it("on a single player's kids turn only", () => {
    const kids = requestFor("adopted", { role: "beat", story: threadBeat(1, KIDS) });
    expect("shortTextCount" in kids && kids.shortTextCount).toBe(KIDS_TEXT_COUNT);
    expect("shortTextCount" in requestFor("adopted", { role: "beat", story: threadBeat(1) })).toBe(false);
  });
});

describe("the text field on a kids turn", () => {
  it("asks for the short count in the child's words, one shared instance as production shares it", () => {
    const schema = toJsonSchema(beatStep.request(threadBeat(1, KIDS)).schema) as { properties: { player1: { properties: { text: { description: string } } } } };
    const text = schema.properties.player1.properties.text.description;
    expect(text).toContain("- Write 3-4 short paragraphs.\n- Each paragraph must have 2-3 short sentences, in everyday words a child aged 5 knows.\n");
    expect(text).not.toContain("5-6 paragraphs");
  });
});
