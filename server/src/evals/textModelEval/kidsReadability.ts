import { paragraphsOf, sentenceCount } from "./textChecks.js";

/*
 * The kids-turns stage's deterministic check (2026-10-01, fix 6 of the second
 * playthroughs' review): how long and how hard a turn read with a young child
 * is, on the text the player sees (paragraphs split as the game splits them,
 * image tags out). Sentences are split as the eval's other checks split them
 * (sentenceCount: a closing quote after "!" or "?" ends one, so a quoted
 * exclamation and its tag count as two). Syllables are a vowel-group count
 * (a common heuristic: a final silent "e", "es" or "ed" dropped, a leading
 * "y" a consonant; "squeaky" reads 3, "wanted" 1), and the Flesch-Kincaid
 * grade is 0.39 × words per sentence + 11.8 × syllables per word − 15.59.
 * Long words are words of three syllables or more, a capitalised word (a name
 * or a sentence's first word) left out, over every word. The check reads
 * length and plainness; it does not see an idiom made of short words
 * ("reckoned with"), which the hand reading does.
 */

export type Readability = {
  words: number;
  paragraphs: number;
  sentences: number;
  wordsPerSentence: number;
  syllablesPerWord: number;
  /** Words of three syllables or more, capitalised words left out, over every word */
  longWordShare: number;
  /** Flesch-Kincaid grade level */
  grade: number;
};

/**
 * The limits a turn read aloud to a young child passes (set before the run,
 * from the variant's own ask and read-aloud picture books): at most 160 words
 * (the variant asks for about 80 to 140; the stored mouse story's turns ran
 * about 300), at most 12 words per sentence (its ask), and a Flesch-Kincaid
 * grade of at most 4 (picture books read aloud run about grade 2 to 4).
 */
export const KIDS_LIMITS = { words: 160, wordsPerSentence: 12, grade: 4 };

/** A word's syllables by vowel groups; at least one. */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) ?? []).length);
}

const isCapitalised = (word: string) => /^\P{L}*\p{Lu}/u.test(word);

/** A text's length and plainness as a young listener hears it. */
export function readabilityOf(text: string): Readability {
  const paragraphs = paragraphsOf(text);
  const words = paragraphs.flatMap((p) => p.split(/\s+/).filter((w) => /\p{L}/u.test(w)));
  const sentences = paragraphs.reduce((sum, p) => sum + sentenceCount(p), 0);
  if (words.length === 0 || sentences === 0) {
    return { words: words.length, paragraphs: paragraphs.length, sentences, wordsPerSentence: 0, syllablesPerWord: 0, longWordShare: 0, grade: 0 };
  }
  const counts = words.map(syllables);
  const syllableTotal = counts.reduce((a, b) => a + b, 0);
  const long = words.filter((w, i) => counts[i] >= 3 && !isCapitalised(w)).length;
  const wordsPerSentence = words.length / sentences;
  const syllablesPerWord = syllableTotal / words.length;
  return {
    words: words.length,
    paragraphs: paragraphs.length,
    sentences,
    wordsPerSentence,
    syllablesPerWord,
    longWordShare: long / words.length,
    grade: 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59,
  };
}

/** A turn short and plain enough to read aloud to a young child (KIDS_LIMITS); an empty text never is. */
export function readsForYoungChild(r: Readability): boolean {
  return r.words > 0 && r.words <= KIDS_LIMITS.words && r.wordsPerSentence <= KIDS_LIMITS.wordsPerSentence && r.grade <= KIDS_LIMITS.grade;
}

/** The mean number of words per item (options, interludes); 0 for none. */
export function meanWords(items: string[]): number {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + item.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length, 0) / items.length;
}
