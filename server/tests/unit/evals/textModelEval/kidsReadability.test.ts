import { describe, expect, it } from "@jest/globals";
import {
  KIDS_BAND_LIMITS,
  KIDS_LIMITS,
  meanWords,
  readabilityOf,
  readsForBand,
  readsForYoungChild,
  syllables,
} from "../../../../src/evals/textModelEval/kidsReadability.js";

/*
 * The kids-turns stage's deterministic check (fix 6 of the second
 * playthroughs' review): how long and how hard a turn read with a young child
 * is. Words and paragraphs as the player sees them, sentences as the eval's
 * other checks split them, syllables by a vowel-group count, and the
 * Flesch-Kincaid grade from those.
 */

describe("syllables: a vowel-group count", () => {
  it.each([
    ["cat", 1],
    ["mouse", 1],
    ["little", 2],
    ["table", 2],
    ["cupboard", 2],
    ["reckoned", 2],
    ["evidence", 3],
    ["Marmalade", 3],
    ["irregular", 4],
    ["interpretation", 5],
    ["don't", 1],
    ["“Look!”", 1],
  ])("%s has %i", (word, count) => {
    expect(syllables(word)).toBe(count);
  });
});

describe("readabilityOf: a text as a young listener hears it", () => {
  it("counts a plain two-paragraph text", () => {
    const text = "Bran sees a big paw print. It is near the door.\n\n“Look!” says Pip. “The cat was here.”";
    const r = readabilityOf(text);
    expect(r.paragraphs).toBe(2);
    // The eval's sentence split: a closing quote after "!" ends a sentence, so "“Look!” says Pip." is two
    expect(r.sentences).toBe(5);
    expect(r.words).toBe(18);
    expect(r.wordsPerSentence).toBeCloseTo(3.6);
    expect(r.syllablesPerWord).toBeCloseTo(1);
    expect(r.longWordShare).toBe(0);
    // 0.39 × 3.6 + 11.8 × 1 − 15.59
    expect(r.grade).toBeCloseTo(-2.386);
    expect(readsForYoungChild(r)).toBe(true);
  });

  it("reads a long, abstract sentence as hard", () => {
    const r = readabilityOf("The irregular interpretation of the evidence remains uncertain.");
    expect(r.words).toBe(8);
    expect(r.sentences).toBe(1);
    // 1 + 4 + 5 + 1 + 1 + 3 + 2 + 3 syllables
    expect(r.syllablesPerWord).toBeCloseTo(2.5);
    // irregular, interpretation, evidence, uncertain
    expect(r.longWordShare).toBeCloseTo(0.5);
    // 0.39 × 8 + 11.8 × 2.5 − 15.59
    expect(r.grade).toBeCloseTo(17.03);
    expect(readsForYoungChild(r)).toBe(false);
  });

  it("leaves names out of the long words: a capitalised word is a name or a sentence's start", () => {
    expect(readabilityOf("Marmalade sleeps. Marmalade wakes.").longWordShare).toBe(0);
  });

  it("reads the text the player sees: image tags out", () => {
    const r = readabilityOf('[image id=pip source=story desc="Pip the mouse"]\nPip runs home.\n\nThe cat naps.');
    expect(r.words).toBe(6);
    expect(r.paragraphs).toBe(2);
  });

  it("gives an empty text zeros", () => {
    expect(readabilityOf("")).toEqual({ words: 0, paragraphs: 0, sentences: 0, wordsPerSentence: 0, syllablesPerWord: 0, longWordShare: 0, grade: 0 });
  });
});

describe("readsForYoungChild: short enough, and plain enough to be read aloud to a young child", () => {
  const at = (overrides: Partial<ReturnType<typeof readabilityOf>>) => ({ ...readabilityOf("A cat."), ...overrides });

  it("passes at the limits and fails beyond any one of them", () => {
    expect(KIDS_LIMITS).toEqual({ words: 160, wordsPerSentence: 12, grade: 4 });
    expect(readsForYoungChild(at({ words: 160, wordsPerSentence: 12, grade: 4 }))).toBe(true);
    expect(readsForYoungChild(at({ words: 161 }))).toBe(false);
    expect(readsForYoungChild(at({ wordsPerSentence: 12.1 }))).toBe(false);
    expect(readsForYoungChild(at({ grade: 4.1 }))).toBe(false);
  });

  it("fails an empty text", () => {
    expect(readsForYoungChild(readabilityOf(""))).toBe(false);
  });
});

/*
 * The kids-ages stage (2026-10-01): each band's limits, set before its run from
 * the band's ask and the children's books it follows (storyTextRounds/kidsAges.ts).
 */
describe("readsForBand: within the band's length, sentence length and grade", () => {
  const at = (overrides: Partial<ReturnType<typeof readabilityOf>>) => ({ ...readabilityOf("A cat."), ...overrides });

  it("has the limits set before the run, the 6-8 band's those of the kids-turns stage", () => {
    expect(KIDS_BAND_LIMITS).toEqual({
      "3-5": { minWords: 30, maxWords: 100, wordsPerSentence: 9, grade: 3 },
      "6-8": { minWords: 1, maxWords: 160, wordsPerSentence: 12, grade: 4 },
      "9-12": { minWords: 130, maxWords: 260, wordsPerSentence: 15, grade: 6 },
    });
    expect(KIDS_BAND_LIMITS["6-8"]).toMatchObject({ maxWords: KIDS_LIMITS.words, wordsPerSentence: KIDS_LIMITS.wordsPerSentence, grade: KIDS_LIMITS.grade });
  });

  it.each([
    ["3-5", { words: 80, wordsPerSentence: 8, grade: 2.5 }, true],
    ["3-5", { words: 120, wordsPerSentence: 8, grade: 2.5 }, false],
    ["3-5", { words: 80, wordsPerSentence: 11, grade: 2.5 }, false],
    ["3-5", { words: 80, wordsPerSentence: 8, grade: 3.5 }, false],
    ["3-5", { words: 20, wordsPerSentence: 6, grade: 1 }, false],
    ["6-8", { words: 160, wordsPerSentence: 12, grade: 4 }, true],
    ["6-8", { words: 161, wordsPerSentence: 12, grade: 4 }, false],
    ["9-12", { words: 200, wordsPerSentence: 13, grade: 5.5 }, true],
    ["9-12", { words: 100, wordsPerSentence: 13, grade: 5.5 }, false],
    ["9-12", { words: 270, wordsPerSentence: 13, grade: 5.5 }, false],
    ["9-12", { words: 200, wordsPerSentence: 16, grade: 5.5 }, false],
    ["9-12", { words: 200, wordsPerSentence: 13, grade: 6.5 }, false],
  ] as const)("%s, %j: %s", (band, overrides, passes) => {
    expect(readsForBand(at(overrides), band)).toBe(passes);
  });

  it("fails an empty text in every band", () => {
    for (const band of ["3-5", "6-8", "9-12"] as const) expect(readsForBand(readabilityOf(""), band)).toBe(false);
  });
});

describe("meanWords: options and interludes", () => {
  it("is the mean number of words per item, and 0 for none", () => {
    expect(meanWords(["Hide under the leaf.", "Run to the door now."])).toBeCloseTo(4.5);
    expect(meanWords([])).toBe(0);
  });
});
