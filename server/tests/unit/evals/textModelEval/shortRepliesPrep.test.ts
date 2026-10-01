import { describe, expect, it, jest } from "@jest/globals";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import {
  SHORT_REPLIES_ARMS,
  askedParagraphs,
  renderShortReplies,
  shortArmReadings,
  textReadings,
  type ShortRepliesReport,
  type ShortTurnReading,
} from "../../../../src/evals/textModelEval/shortRepliesPrep.js";
import { endingBeat, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet } from "../../../helpers/textFixtures.js";

/*
 * The short-replies stage's readings (2026-10-01): each turn read whole with
 * production's retry in the loop (checkedTurns.ts), each player's text by its
 * paragraphs as the client splits them and its words, in the first reply and
 * the reply kept; then production and the variant pooled over both turn models
 * and per model, the variant against production under the stop rule.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const paragraphs = (n: number, words = 12) => Array.from({ length: n }, (_, i) => `${"word ".repeat(words - 1)}end${i}.`).join("\n\n");
const reply = (...texts: string[]): SetOfBeatGenerationSchema =>
  beatSet(texts.length, Object.fromEntries(texts.map((text, i) => [`player${i + 1}`, beatGeneration({ text })])) as never);

describe("textReadings and askedParagraphs", () => {
  it("reads each player's paragraphs (as the client splits them) and words, in seat order", () => {
    expect(textReadings(reply(paragraphs(1, 60), paragraphs(5)))).toEqual([
      { slot: "player1", paragraphs: 1, words: 60 },
      { slot: "player2", paragraphs: 5, words: 60 },
    ]);
  });

  it("reads the count each form asks for: production's 5-6, a kids band's own", () => {
    expect(askedParagraphs(threadBeat(1))).toEqual({ min: 5, max: 6 });
    expect(askedParagraphs(endingBeat(2))).toEqual({ min: 5, max: 6 });
    expect(askedParagraphs(threadBeat(1, { category: "read-with-kids", kidAges: { min: 4, max: 4 } }))).toEqual({ min: 2, max: 3 });
    expect(askedParagraphs(threadBeat(1, { category: "read-with-kids" }))).toEqual({ min: 3, max: 4 });
    expect(askedParagraphs(threadBeat(2, { category: "read-with-kids", kidAges: { min: 10, max: 12 } }))).toEqual({ min: 4, max: 5 });
  });
});

const [prodMedium, variantMedium, prodLow, variantLow] = SHORT_REPLIES_ARMS;

const turn = (armKey: string, caseId: string, sample: number, first: number[], kept?: number[]): ShortTurnReading => {
  const texts = (counts: number[]) => counts.map((p, i) => ({ slot: `player${i + 1}`, paragraphs: p, words: p * 60 }));
  const short = (counts: number[]) => counts.some((p) => p < 2);
  return {
    armKey,
    variant: armKey.split("/")[1],
    caseId,
    sample,
    players: first.length,
    asked: { min: 5, max: 6 },
    first: texts(first),
    firstShort: short(first),
    ...(kept ? { retried: "short" as const, keptTexts: texts(kept), keptShort: short(kept) } : { keptTexts: texts(first), keptShort: short(first) }),
    kept: true,
  };
};

describe("shortArmReadings: production and the variant, pooled over both turn models and per model, under the stop rule", () => {
  const single = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const groups = ["p", "q", "r", "s"];
  const readings: ShortTurnReading[] = [
    ...single.flatMap((c) => [1, 2].map((s) => turn(prodMedium, c, s, [c === "a" || (c === "b" && s === 2) ? 1 : 5], c === "a" ? [5] : c === "b" && s === 2 ? [1] : undefined))),
    ...single.flatMap((c) => [1, 2].map((s) => turn(variantMedium, c, s, [c === "h" && s === 1 ? 6 : 5]))),
    ...groups.flatMap((c) => [1, 2].map((s) => turn(prodLow, c, s, c === "p" ? [1, 1] : [5, 5], c === "p" ? [5, 5] : undefined))),
    ...groups.flatMap((c) => [1, 2].map((s) => turn(variantLow, c, s, c === "q" && s === 2 ? [3, 5] : [5, 5]))),
  ];

  it("pools production's arms against the variant's on the pairs both have, production's two samples the noise", () => {
    const pooled = shortArmReadings(readings, "variant");
    expect(pooled.map((a) => a.key)).toEqual(["adopted", "shortReplies"]);
    const firstShort = pooled[1].measures.find((m) => m.name === "firstShort");
    // Production: a twice, b once, p twice; the variant none
    expect(firstShort?.reference).toEqual({ hits: 5, n: 24 });
    expect(firstShort?.arm).toEqual({ hits: 0, n: 24 });
    expect(firstShort?.move.moved).toBe("lower");
    expect(pooled[1].measures.find((m) => m.name === "keptShort")?.reference).toEqual({ hits: 1, n: 24 });
    // A text of two to four paragraphs, and one past the form's count, read apart
    expect(pooled[1].tallies.firstBelowAsked).toEqual({ hits: 1, n: 24 });
    expect(pooled[1].tallies.firstAboveAsked).toEqual({ hits: 0, n: 24 });
    expect(pooled[0].tallies.firstShortEveryPlayer).toEqual({ hits: 2, n: 2 });
    expect(pooled[0].distribution).toEqual({ 1: 7, 5: 25 });
  });

  it("reads each turn model's variant against its own production", () => {
    const byModel = shortArmReadings(readings, "armKey");
    expect(byModel.map((a) => a.key)).toEqual([prodLow, prodMedium, variantLow, variantMedium]);
    expect(byModel.find((a) => a.key === variantMedium)?.measures.find((m) => m.name === "firstShort")?.reference).toEqual({ hits: 3, n: 16 });
    expect(byModel.find((a) => a.key === variantLow)?.measures.find((m) => m.name === "firstShort")?.reference).toEqual({ hits: 2, n: 8 });
    expect(byModel.find((a) => a.key === variantMedium)?.tallies.firstAboveAsked).toEqual({ hits: 0, n: 16 });
  });

  it("renders the report", () => {
    const report: ShortRepliesReport = {
      generatedAt: new Date("2026-10-01T12:00:00Z"),
      tallies: [],
      pooled: shortArmReadings(readings, "variant"),
      byModel: shortArmReadings(readings, "armKey"),
      turns: readings,
      shortTexts: [],
      firstComparisons: [],
      keptComparisons: [],
      waits: { kept: [], keptBySample: [], first: [] },
      spendUsd: 0.4,
      problems: [],
    };
    const md = renderShortReplies(report);
    expect(md).toContain("# Turns that come back as one short paragraph (short-replies)");
    expect(md).toContain("First replies with a one-paragraph text");
    expect(md).toContain("moved lower");
    expect(md).toContain("$0.4000");
    // Per turn: each player's paragraphs in the first reply, and the reply kept after a retry
    expect(md).toContain("| a | 1 | 1 → 5 (retried) |");
  });
});
