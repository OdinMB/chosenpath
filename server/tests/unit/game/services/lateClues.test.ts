import { describe, expect, it, jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import { LATE_CLUES_TEXT, takesLateClues } from "../../../../src/game/services/lateClues.js";
import { isLatePart } from "../../../../src/game/services/pacing.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";

/*
 * The late part's clue lines (adopted 2026-10-01, the pacing-clues stage: fix
 * 8's retest in whole short playthroughs). Every turn after the first was told
 * to "Plan a hint about a detail in the world that makes the player curious",
 * and nothing asked a later turn to pay one off; the second round's stories
 * each carried six to ten small mysteries their endings never explained. Past
 * two thirds of the story's turns a turn plants no new mystery, explains an
 * earlier one where it fits, and its interludes recall or explain what the
 * story already has. Read blind in the stage's short playthroughs: player turns
 * with no new unexplained detail, production 68 of 73, the variant 80 of 80
 * (moved); the clue judge (v2, reliable) 46 of 80 against 72 of 80 (moved).
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const promptOf = (story: Story) => beatStep.request(story).prompt;

describe("the story's late part", () => {
  it("is past two thirds of its turns, the turn being written counted", () => {
    expect(isLatePart(threadBeat(1, { maxTurns: 5 }))).toBe(true);
    expect(isLatePart(threadBeat(1, { maxTurns: 6 }))).toBe(false);
    expect(isLatePart(threadBeat(1, { maxTurns: 25 }))).toBe(false);
  });

  it("takes the clue lines on a turn after the first and before the ending only", () => {
    expect(takesLateClues(threadBeat(1, { maxTurns: 5 }))).toBe(true);
    expect(takesLateClues(laterSwitchBeat(2, { maxTurns: 5 }))).toBe(true);
    expect(takesLateClues(threadBeat(1, { maxTurns: 25 }))).toBe(false);
    expect(takesLateClues(endingBeat(1))).toBe(false);
    expect(takesLateClues(firstSwitchBeat(1, { maxTurns: 1 }))).toBe(false);
  });
});

describe("a turn's request", () => {
  it.each([1, 2, 3])("a late turn (%i players): the late hint in the hint's place, the interludes' line after their examples, each once", (players) => {
    const prompt = promptOf(threadBeat(players, { maxTurns: 5 }));
    expect(occurrences(prompt, LATE_CLUES_TEXT.hintLate)).toBe(1);
    expect(occurrences(prompt, LATE_CLUES_TEXT.hint)).toBe(0);
    expect(occurrences(prompt, `${LATE_CLUES_TEXT.interludeAnchor}${LATE_CLUES_TEXT.interludeLate}`)).toBe(1);
  });

  it("an earlier turn keeps the hint and no late line", () => {
    const prompt = promptOf(threadBeat(1, { maxTurns: 25 }));
    expect(occurrences(prompt, LATE_CLUES_TEXT.hint)).toBe(1);
    expect(prompt).not.toContain(LATE_CLUES_TEXT.hintLate);
    expect(prompt).not.toContain(LATE_CLUES_TEXT.interludeLate);
  });

  it("the ending and the first turn carry neither", () => {
    for (const story of [endingBeat(1), endingBeat(2), firstSwitchBeat(1, { maxTurns: 1 })]) {
      expect(promptOf(story)).not.toContain(LATE_CLUES_TEXT.hintLate);
      expect(promptOf(story)).not.toContain(LATE_CLUES_TEXT.interludeLate);
    }
  });

  it("a late turn read with a child carries them too (unmeasured for kids)", () => {
    const prompt = promptOf(threadBeat(1, { maxTurns: 5, category: "read-with-kids", kidAges: { min: 7, max: 7 } }));
    expect(occurrences(prompt, LATE_CLUES_TEXT.hintLate)).toBe(1);
    expect(occurrences(prompt, LATE_CLUES_TEXT.interludeLate)).toBe(1);
  });
});
