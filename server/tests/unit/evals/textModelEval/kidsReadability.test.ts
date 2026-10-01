import { describe, expect, it } from "@jest/globals";
import {
  KIDS_LIMITS,
  meanWords,
  readabilityOf,
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

describe("meanWords: options and interludes", () => {
  it("is the mean number of words per item, and 0 for none", () => {
    expect(meanWords(["Hide under the leaf.", "Run to the door now."])).toBeCloseTo(4.5);
    expect(meanWords([])).toBe(0);
  });
});
