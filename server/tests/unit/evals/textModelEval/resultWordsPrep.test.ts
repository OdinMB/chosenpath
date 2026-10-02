import { describe, expect, it, jest } from "@jest/globals";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import {
  RESULT_WORDS_ARMS,
  kindSentencesOf,
  renderWordsBlind,
  wordsBlindKey,
  wordsComparisons,
  wordsTurnReading,
  withWordsHand,
  type WordsTurn,
} from "../../../../src/evals/textModelEval/resultWordsPrep.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, challengeOptions } from "../../../helpers/textFixtures.js";

/*
 * The result-words stage's report (decision A's result-words fix, 2026-10-02;
 * no calls): each kept group turn read per player by production's note
 * (resultWordsOfBeat) and, for the blind hand reading, every sentence holding a
 * word that can name a result's kind, coded by a salted hash with no arm named.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const [PRODUCTION, VARIANT] = RESULT_WORDS_ARMS;

const reply = (texts: Record<string, string>): SetOfBeatGenerationSchema =>
  Object.fromEntries(Object.entries(texts).map(([slot, text]) => [slot, beatGeneration({ text, options: challengeOptions() })])) as unknown as SetOfBeatGenerationSchema;

const base = (armKey: string, caseId: string, sample: number) => ({ armKey, caseId, sample, reasoningTokens: 100 });

describe("kindSentencesOf: the sentences a hand reader takes", () => {
  it("finds every sentence of a player's title, text, options and interludes holding a word that can name a result's kind", () => {
    const beat = beatGeneration({
      title: "The Mixed Hearing (2/3)",
      text: "You speak first. The mixed result remains plain in the room! Ves nods.\n\nThe wind is favorable tonight. Side B's banner sways.",
      options: [{ ...challengeOptions()[0], text: "Press for a resolution of the dispute." }],
      interludes: [{ imageId: "player1", imageSource: "none", text: "An unfavourable rumour spreads." }],
    });
    expect(kindSentencesOf("player2", beat)).toEqual([
      { slot: "player2", where: "title", index: 0, sentence: "The Mixed Hearing (2/3)" },
      { slot: "player2", where: "text", index: 1, sentence: "The mixed result remains plain in the room!" },
      { slot: "player2", where: "text", index: 2, sentence: "The wind is favorable tonight." },
      { slot: "player2", where: "text", index: 3, sentence: "Side B's banner sways." },
      { slot: "player2", where: "option", index: 4, sentence: "Press for a resolution of the dispute." },
      { slot: "player2", where: "interlude", index: 5, sentence: "An unfavourable rumour spreads." },
    ]);
    expect(kindSentencesOf("player1", beatGeneration({ text: "Nothing to see. Mixing the paint takes time." }))).toEqual([]);
    expect(kindSentencesOf("player1", undefined)).toEqual([]);
  });
});

describe("wordsTurnReading", () => {
  it("reads each player's text by production's note and collects the sentences for the hand", () => {
    const story = threadBeat(2);
    const turn = wordsTurnReading(base(PRODUCTION, "c1", 1), story, reply({ player1: "The mixed result is plain. You go on.", player2: "Rain falls." }));
    expect(turn.kept).toBe(true);
    expect(turn.slots).toEqual(["player1", "player2"]);
    expect(turn.noted).toEqual([{ slot: "player1", words: ["mixed result"] }]);
    expect(turn.sentences.map((s) => [s.slot, s.sentence])).toEqual([["player1", "The mixed result is plain."]]);
    const failed = wordsTurnReading(base(PRODUCTION, "c1", 2), story, undefined);
    expect(failed).toMatchObject({ kept: false, noted: [], sentences: [] });
  });
});

const turnOf = (armKey: string, caseId: string, sample: number, noted: string[], sentences: string[] = noted): WordsTurn => ({
  ...base(armKey, caseId, sample),
  kept: true,
  slots: ["player1", "player2"],
  noted: noted.map((slot) => ({ slot, words: ["mixed result"] })),
  sentences: sentences.map((slot, index) => ({ slot, where: "text" as const, index, sentence: `The mixed result for ${slot}.` })),
});

describe("the blind reading", () => {
  it("codes every sentence with no arm or sample named, and unblinds the hand's verdicts through the key", () => {
    const turns = [turnOf(PRODUCTION, "c1", 1, ["player1"]), turnOf(VARIANT, "c1", 1, [], ["player2"])];
    const key = wordsBlindKey(turns, "salt");
    const codes = Object.keys(key.items);
    expect(codes).toHaveLength(2);
    const page = renderWordsBlind(turns, key.salt, new Map([["c1", "A turn."]]));
    for (const code of codes) expect(page).toContain(`### ${code}`);
    expect(page).not.toContain(PRODUCTION);
    expect(page).not.toContain(VARIANT);
    expect(page).not.toContain("resultWords");
    const [productionCode] = codes.filter((c) => key.items[c].armKey === PRODUCTION);
    const read = withWordsHand(turns, key, { [productionCode]: { hand: true, note: "the label" } });
    expect(read[0].verdicts).toEqual([{ code: productionCode, slot: "player1", hand: true, note: "the label" }]);
    expect(read[1].verdicts.map((v) => v.hand)).toEqual([undefined]);
  });
});

describe("wordsComparisons: the variant against production under the stop rule", () => {
  it("counts turns and player texts with production's note and with a hand-read label, lower is better, production's two samples the noise", () => {
    const turns = [
      turnOf(PRODUCTION, "c1", 1, ["player1", "player2"]),
      turnOf(PRODUCTION, "c2", 1, ["player1"]),
      turnOf(PRODUCTION, "c1", 2, ["player1"]),
      turnOf(PRODUCTION, "c2", 2, ["player2"]),
      turnOf(VARIANT, "c1", 1, []),
      turnOf(VARIANT, "c2", 1, []),
      turnOf(VARIANT, "c1", 2, []),
      turnOf(VARIANT, "c2", 2, [], ["player1"]),
    ];
    const key = wordsBlindKey(turns, "salt");
    const hand = Object.fromEntries(Object.entries(key.items).map(([code, item]) => [code, { hand: item.armKey === PRODUCTION, note: "" }]));
    const comparisons = wordsComparisons(withWordsHand(turns, key, hand));
    const byName = Object.fromEntries(comparisons.map((c) => [c.name, c]));
    expect(byName.turnsNoted.production).toEqual({ hits: 4, n: 4 });
    expect(byName.turnsNoted.variant).toEqual({ hits: 0, n: 4 });
    expect(byName.turnsNoted.noise).toBe(0);
    expect(byName.turnsNoted.move.beyondNoise).toBe("lower");
    expect(byName.textsNoted.production).toEqual({ hits: 5, n: 8 });
    expect(byName.textsNoted.variant).toEqual({ hits: 0, n: 8 });
    expect(byName.textsNoted.noise).toBe(0.25);
    expect(byName.turnsHand.production).toEqual({ hits: 4, n: 4 });
    // The variant's one sentence the hand read as ordinary words
    expect(byName.turnsHand.variant).toEqual({ hits: 0, n: 4 });
    expect(byName.textsHand.variant).toEqual({ hits: 0, n: 8 });
  });

  it("leaves a turn with an unread sentence out of the hand's counts", () => {
    const turns = [turnOf(PRODUCTION, "c1", 1, ["player1"]), turnOf(PRODUCTION, "c1", 2, []), turnOf(VARIANT, "c1", 1, ["player1"]), turnOf(VARIANT, "c1", 2, [])];
    const key = wordsBlindKey(turns, "salt");
    const byName = Object.fromEntries(wordsComparisons(withWordsHand(turns, key, {})).map((c) => [c.name, c]));
    expect(byName.turnsHand.production).toEqual({ hits: 0, n: 1 });
    expect(byName.turnsNoted.production).toEqual({ hits: 1, n: 2 });
  });
});
