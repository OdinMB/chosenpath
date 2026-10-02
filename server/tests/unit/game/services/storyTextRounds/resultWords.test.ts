import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import {
  RESULT_WORDS_TEXT,
  resultWordsBase,
  resultWordsRequest,
  takesResultWordsLine,
  withResultWordsLine,
  withoutResultWordsLine,
} from "../../../../../src/game/services/storyTextRounds/resultWords.js";
import { RESULT_LABELS_TEXT, takesResultLabels } from "../../../../../src/game/services/resultLabels.js";
import { beatCallLimits, beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { beatCheckOptions } from "../../../../../src/game/services/kidsTurnRules.js";
import { callLimitsOf, requestFor } from "../../../../../src/evals/textModelEval/variants.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";

/*
 * Result words in the story text (eval only; decision A's result-words fix,
 * 2026-10-02). Group turns of the second and third playthroughs told the game's
 * result kind as story text ("The mixed result remains plain in the room",
 * "The unfavorable outcome hangs between you"): the request shows each result
 * to narrate under its label ("RESOLUTION: MIXED. <what it means>") and tells
 * the turn to set its tone by whether the previous beat "was favorable / mixed
 * / unfavorable", while its fourth-wall rule names only 'NPC', 'player
 * character', 'stat' and 'story beat'. The variant is production's group turn
 * with one line under that rule, on a group turn that narrates a result (a
 * later chapter step, a switch after the story's first beat); production's
 * request byte for byte everywhere else.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

/** A group chapter's opening step: threadBeat with its first step not yet resolved. */
function threadOpening(players: number): Story {
  const state = structuredClone(threadBeat(players).getState());
  const thread = state.storyPhases[1] as ThreadAnalysis;
  thread.threads[0].progression[0].resolution = null;
  return Story.create(state);
}

describe("takesResultWordsLine: a group turn that narrates a result", () => {
  it("takes it on a group's later chapter step and on a group's switch after the story's first beat", () => {
    for (const players of [2, 3]) {
      expect(threadBeat(players).getCurrentThreadBeatsCompleted()).toBeGreaterThan(0);
      expect(takesResultWordsLine(threadBeat(players))).toBe(true);
      expect(laterSwitchBeat(players).getCurrentBeatType()).toBe("switch");
      expect(takesResultWordsLine(laterSwitchBeat(players))).toBe(true);
    }
  });

  it("leaves it out for a single player, on a group's first beat, a chapter's opening step and the ending", () => {
    for (const story of [threadBeat(1), laterSwitchBeat(1), endingBeat(1), firstSwitchBeat(2), threadOpening(2), endingBeat(2)]) {
      expect(takesResultWordsLine(story)).toBe(false);
    }
    expect(threadOpening(2).getCurrentBeatType()).toBe("thread");
    expect(threadOpening(2).getCurrentThreadBeatsCompleted()).toBe(0);
  });
});

describe("the line", () => {
  it("names every result kind the request labels, and asks for the story's own words in the text, options and interludes", () => {
    for (const kind of ["favorable", "mixed", "unfavorable", "Side A", "Side B"]) expect(RESULT_WORDS_TEXT.line).toContain(kind);
    expect(RESULT_WORDS_TEXT.line).toContain("in the story's own words");
    expect(RESULT_WORDS_TEXT.line).toContain("the text, the options and the interludes");
    expect(RESULT_WORDS_TEXT.line.startsWith("--- ")).toBe(true);
    expect(RESULT_WORDS_TEXT.line.endsWith("\n")).toBe(true);
  });

  it("goes right after the fourth-wall rule's terms, once", () => {
    const story = threadBeat(2);
    const prompt = resultWordsRequest(story).prompt;
    expect(occurrences(prompt, RESULT_WORDS_TEXT.line)).toBe(1);
    expect(prompt).toContain(`- Don't break the fourth wall\n${RESULT_WORDS_TEXT.anchor}${RESULT_WORDS_TEXT.line}`);
  });
});

describe("the variant's turn", () => {
  it("is production's turn with the line where a group turn narrates a result, prompt; the schema production's", () => {
    for (const story of [threadBeat(2), threadBeat(3), laterSwitchBeat(2), laterSwitchBeat(3)]) {
      const [variant, base] = [resultWordsRequest(story), resultWordsBase(story)];
      expect(occurrences(base.prompt, RESULT_WORDS_TEXT.line)).toBe(0);
      expect(variant.prompt).toBe(withResultWordsLine(base.prompt, story));
      expect(withoutResultWordsLine(variant.prompt, story)).toBe(base.prompt);
      expect(variant.prompt.replace(RESULT_WORDS_TEXT.line, "")).toBe(base.prompt);
      expect(json(variant.schema)).toBe(json(base.schema));
    }
  });

  it("adopted as measured (the result-words stage, 2026-10-02): production's turn is the variant byte for byte, prompt and schema, on every turn kind and player count", () => {
    for (const story of [threadBeat(1), threadBeat(2), threadBeat(3), laterSwitchBeat(1), laterSwitchBeat(2), laterSwitchBeat(3), firstSwitchBeat(2), threadOpening(2), endingBeat(2), endingBeat(3)]) {
      const [variant, production] = [resultWordsRequest(story), beatStep.request(story)];
      expect(production.prompt).toBe(variant.prompt);
      expect(json(production.schema)).toBe(json(variant.schema));
      expect(occurrences(production.prompt, RESULT_WORDS_TEXT.line)).toBe(takesResultWordsLine(story) ? 1 : 0);
    }
    // The production text and condition are the variant's: one copy, pinned here
    expect(RESULT_LABELS_TEXT).toBe(RESULT_WORDS_TEXT);
    expect(takesResultLabels).toBe(takesResultWordsLine);
  });

  it("is production's turn byte for byte elsewhere", () => {
    for (const story of [threadBeat(1), laterSwitchBeat(1), endingBeat(1), firstSwitchBeat(2), threadOpening(2), endingBeat(2)]) {
      const [variant, production] = [resultWordsRequest(story), beatStep.request(story)];
      expect(variant.prompt).toBe(production.prompt);
      expect(json(variant.schema)).toBe(json(production.schema));
    }
  });

  it("is the eval's resultWords variant on the turn, with production's turn limits and retry count", () => {
    const story = threadBeat(2);
    const request = requestFor("resultWords", { role: "beat", story });
    expect("prompt" in request ? request.prompt : "").toBe(resultWordsRequest(story).prompt);
    expect(callLimitsOf(request)).toEqual(beatCallLimits(story));
    const count = beatCheckOptions(story).textCount;
    expect("shortTextCount" in request ? request.shortTextCount : undefined).toBe(count);
    expect(() => requestFor("resultWords", { role: "thread", story })).toThrow("does not cover role thread");
  });
});
