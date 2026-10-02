/*
 * The result-words stage's blind hand reading (decision A's result-words fix,
 * 2026-10-02): every sentence of the stage's kept turns that holds a word that
 * can name a result's kind, read in result-words-blind.md under its code before
 * the key (keys/result-words-blind.json) was opened. true: the sentence tells
 * the game's label for a result as story text ("The mixed result remains plain
 * in the room", "the favorable hearing"); false: ordinary words of the story
 * ("a favorable wind", "mixed feelings", "the outcome of the vote").
 * resultWordsPrep.ts unblinds them through the key for result-words.md.
 */

export type WordsHandEntry = { hand: boolean; note: string };

const yes = (note: string): WordsHandEntry => ({ hand: true, note });
const no = (note: string): WordsHandEntry => ({ hand: false, note });

export const RESULT_WORDS_HAND: Record<string, WordsHandEntry> = {
  // --- Read 2026-10-02 before the key was opened ---
  // Round 2's space pirates, the switch after the anchorage chapter's mixed resolution
  AB4DE: yes("'The mixed result is plain in the ship's silence': the label as story text"),
  EA8B1: yes("'the mixed approach leaves the crew with a worse leak': the previous result named by its kind"),
  // Round 2's space pirates, the claim contest's last step
  "1042F": yes("'The favorable hearing from the last exchange': the previous result named by its kind"),
  "52EF9": yes("'the proposal that received a mixed hearing': borderline, an idiom, but it names the previous result by its kind"),
  // Round 3's food trucks, Omar after his unfavorable roll
  "45B2C": yes("'the unfavorable timing remains': the previous result named by its kind"),
  // Round 3's space pirates, the switch after the seal chapter's mixed resolution
  "53132": no("'each side a place': 'side a' matched, no kind named"),
  "9CE3F": yes("'when the crew's mixed ruling comes': the thread's resolution named by its kind"),
  // Round 3's space pirates, three parallel challenges' second step
  "0D2B8": yes("'the mixed response hangs in the chart-table light': the label as story text"),
  // Round 3's space pirates, the first chapter's second step
  "05CDB": yes("'Your favorable live reference': the previous roll named by its kind"),
};
