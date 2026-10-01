import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { KidsBand, StoryState } from "core/types/index.js";
import { FULL_TEXT_COUNT, beatReplyProblem } from "../../../../src/game/services/beatChecks.js";
import { KIDS_BAND_TURNS, beatCheckOptions, kidsBand, kidsListener, kidsTurnText, takesKidsRules } from "../../../../src/game/services/kidsTurnRules.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";
import { requestFor } from "../../../../src/evals/textModelEval/variants.js";
import { endingBeat, laterSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, PARAGRAPH } from "../../../helpers/textFixtures.js";

/*
 * A turn in a story read with a child, by the children's age band (adopted
 * from the kids-ages stage, 2026-10-01; the single player's 6-8 text from the
 * kids-turns stage): which turns take the kids rules, the band and who
 * listens, the band's text, and the length a retry of a one-paragraph reply
 * asks for.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

/** A story saved before the setting: its premise's age as readingAge. */
const KIDS = { category: "read-with-kids" as const, readingAge: "5" };
const kids = (min: number, max = min): Partial<StoryState> => ({ category: "read-with-kids", kidAges: { min, max } });
const BANDS: [KidsBand, number][] = [
  ["3-5", 4],
  ["6-8", 7],
  ["9-12", 10],
];

describe("takesKidsRules", () => {
  it("a story read with a child, every player count; never another category", () => {
    expect(takesKidsRules(threadBeat(1, KIDS))).toBe(true);
    expect(takesKidsRules(threadBeat(1, { category: "read-with-kids" }))).toBe(true);
    expect(takesKidsRules(threadBeat(2, KIDS))).toBe(true);
    expect(takesKidsRules(threadBeat(3, kids(10)))).toBe(true);
    expect(takesKidsRules(threadBeat(1))).toBe(false);
    expect(takesKidsRules(threadBeat(2))).toBe(false);
    expect(takesKidsRules(threadBeat(1, { category: "enjoy-fiction" }))).toBe(false);
  });
});

describe("kidsBand: the band a story's turns are written for", () => {
  it("is the youngest child's: 3-5, 6-8 or 9-12", () => {
    expect(kidsBand(threadBeat(1, kids(3)))).toBe("3-5");
    expect(kidsBand(threadBeat(1, kids(5, 9)))).toBe("3-5");
    expect(kidsBand(threadBeat(1, kids(6)))).toBe("6-8");
    expect(kidsBand(threadBeat(2, kids(8, 12)))).toBe("6-8");
    expect(kidsBand(threadBeat(1, kids(9)))).toBe("9-12");
    expect(kidsBand(threadBeat(3, kids(12, 14)))).toBe("9-12");
    expect(kidsBand(threadBeat(1, KIDS))).toBe("3-5");
  });

  it("is 6-8, the measured kids turn, where the story records no age (a template tagged Kids without one)", () => {
    expect(kidsBand(threadBeat(1, { category: "read-with-kids" }))).toBe("6-8");
    expect(kidsTurnText(threadBeat(2, { category: "read-with-kids" }))).toBe(KIDS_BAND_TURNS["6-8"]);
  });
});

describe("kidsListener", () => {
  it("the recorded age, or a young child", () => {
    expect(kidsListener(threadBeat(1, KIDS))).toBe("a child aged 5");
    expect(kidsListener(threadBeat(1, { category: "read-with-kids", readingAge: "8-10" }))).toBe("a child aged 8-10");
    expect(kidsListener(threadBeat(1, { category: "read-with-kids" }))).toBe("a young child");
  });

  it("the ages the story records as the read-with-kids setting (2026-10-01), named as the recorded age was", () => {
    expect(kidsListener(threadBeat(1, kids(5)))).toBe("a child aged 5");
    expect(kidsListener(threadBeat(2, kids(8, 10)))).toBe("a child aged 8-10");
  });
});

describe("each band's text: what children's books of that age do", () => {
  it("3-5: a picture book's page or two, very short sentences in a small child's words", () => {
    const text = KIDS_BAND_TURNS["3-5"];
    expect(text.rules("a child aged 4")).toContain("2-3 very short paragraphs of 1-3 sentences each, about 40 to 90 words in all, like a page or two of a picture book.");
    expect(text.rules("a child aged 4")).toContain("about 4 to 8 words");
    expect(text.context).toContain("2-3 very short paragraphs of 1-3 short sentences each");
    expect(text.textCount).toBe("two or three very short paragraphs of one to three very short sentences each");
  });

  it("6-8: the kids-turns stage's measured turn", () => {
    const text = KIDS_BAND_TURNS["6-8"];
    expect(text.rules("a child aged 7")).toContain("3-4 short paragraphs of 2-3 sentences each, about 80 to 140 words in all.");
    expect(text.rules("a child aged 7")).toContain("about 5 to 12 words");
    expect(text.textCount).toBe("three or four short paragraphs of two or three short sentences each");
  });

  it("9-12: a chapter book's page, clear sentences, a new word where the sentence makes it clear", () => {
    const text = KIDS_BAND_TURNS["9-12"];
    expect(text.rules("a child aged 10")).toContain("4-5 paragraphs of 2-4 sentences each, about 150 to 230 words in all, like a page of a chapter book.");
    expect(text.rules("a child aged 10")).toContain("about 8 to 15 words");
    expect(text.textCount).toBe("four or five paragraphs of two to four sentences each");
  });

  it.each(BANDS)("%s: the options and interludes in the same words, a lever option still naming its stat and amount", (band) => {
    expect(KIDS_BAND_TURNS[band].rules("a young child")).toMatch(/The options and interludes follow the same rules: .*\(a sacrifice or reward option still names its stat and amount\)\./);
  });
});

describe("the prompt on a kids turn, every player count", () => {
  it.each(BANDS)("%s: the band's count in the context, its rules block and its repeat, once each, and no grown-up count", (band, age) => {
    const text = KIDS_BAND_TURNS[band];
    const who = `a child aged ${age}`;
    for (const story of [threadBeat(1, kids(age)), threadBeat(2, kids(age)), laterSwitchBeat(3, kids(age)), endingBeat(2, kids(age))]) {
      const { prompt } = beatStep.request(story);
      expect(prompt.split(text.context).length - 1).toBe(1);
      expect(prompt.split(text.rules(who)).length - 1).toBe(1);
      expect(prompt.split(text.repeat(who)).length - 1).toBe(1);
      expect(prompt).not.toContain("5-6 paragraphs");
    }
  });

  it("leaves a grown-up story's turn, a single player's and a group's, with production's count", () => {
    for (const story of [threadBeat(1), threadBeat(2), threadBeat(1, { category: "enjoy-fiction" })]) {
      expect(beatStep.request(story).prompt).toContain("You MUST write 5-6 paragraphs with 3-5 sentences each!");
    }
  });
});

describe("beatCheckOptions: production's check of a beat reply", () => {
  it("flags the ending, and asks a kids turn's retry for its band's count, every player count", () => {
    expect(beatCheckOptions(threadBeat(1))).toEqual({ ending: false });
    expect(beatCheckOptions(threadBeat(2))).toEqual({ ending: false });
    expect(beatCheckOptions(endingBeat(1))).toEqual({ ending: true });
    for (const [band, age] of BANDS) {
      expect(beatCheckOptions(threadBeat(1, kids(age)))).toEqual({ ending: false, textCount: KIDS_BAND_TURNS[band].textCount });
      expect(beatCheckOptions(threadBeat(2, kids(age)))).toEqual({ ending: false, textCount: KIDS_BAND_TURNS[band].textCount });
    }
    expect(beatCheckOptions(threadBeat(2, { category: "read-with-kids" }))).toEqual({ ending: false, textCount: KIDS_BAND_TURNS["6-8"].textCount });
    const short = beatSet(1, { player1: beatGeneration({ text: PARAGRAPH }) });
    expect(beatReplyProblem(short, beatCheckOptions(threadBeat(1, kids(10))))).toContain(`write every player's text as ${KIDS_BAND_TURNS["9-12"].textCount}`);
    expect(beatReplyProblem(short, beatCheckOptions(threadBeat(1)))).toContain(FULL_TEXT_COUNT);
  });
});

describe("the eval's adopted request carries production's retry count", () => {
  it("on a kids turn of every player count, and on no other", () => {
    for (const [band, story] of [
      ["3-5", threadBeat(1, kids(4))],
      ["9-12", threadBeat(2, kids(10))],
      ["3-5", threadBeat(1, KIDS)],
    ] as const) {
      const request = requestFor("adopted", { role: "beat", story });
      expect("shortTextCount" in request && request.shortTextCount).toBe(KIDS_BAND_TURNS[band].textCount);
    }
    expect("shortTextCount" in requestFor("adopted", { role: "beat", story: threadBeat(1) })).toBe(false);
    expect("shortTextCount" in requestFor("adopted", { role: "beat", story: threadBeat(2) })).toBe(false);
  });
});

type BeatJson = { properties: { player1: { properties: { text: { description: string } } } } };
const textFieldOf = (story: Parameters<typeof beatStep.request>[0]) =>
  (toJsonSchema(beatStep.request(story).schema) as BeatJson).properties.player1.properties.text.description;

describe("the text field on a kids turn", () => {
  it.each(BANDS)("%s: the band's count in the child's words, a single player's and a group's, and no grown-up count anywhere", (band, age) => {
    const text = KIDS_BAND_TURNS[band];
    const who = `a child aged ${age}`;
    for (const story of [threadBeat(1, kids(age)), threadBeat(3, kids(age))]) {
      // A group's slots share one instance (the JSON schema points the others at player1's)
      const field = textFieldOf(story);
      expect(field).toContain(text.fieldCount(who));
      expect(field).toContain(text.repeat(who));
      expect(JSON.stringify(toJsonSchema(beatStep.request(story).schema))).not.toContain("5-6 paragraphs");
    }
  });
});

/*
 * Production's image lines place a second image on "the third or fourth paragraph" and none on the last; each band
 * names places its own paragraphs have before the last (3-5 the first, and the second only of three; 6-8 the second,
 * or the third of four; 9-12 the first and the third).
 */
describe("image tags on a kids turn: places each band's paragraphs have", () => {
  it.each(BANDS)("%s: the band's places in the prompt and the text field, a single player's and a group's", (band, age) => {
    const text = KIDS_BAND_TURNS[band];
    for (const players of [1, 2]) {
      const story = threadBeat(players, { ...kids(age), generateImages: true });
      const { prompt } = beatStep.request(story);
      expect(prompt).toContain(text.image.distribution);
      expect(prompt).toContain("--- No image tags for the last paragraph, and no image tags after the last paragraph.\n");
      expect(prompt).not.toContain("third or fourth");
      const field = textFieldOf(story);
      expect(field).toContain(text.image.fieldDistribution);
      expect(field).toContain(text.image.fieldLate);
      expect(field).not.toContain("third or fourth");
    }
  });

  it("a story with a library and no generated images: the distribution only, as production prints it", () => {
    const story = threadBeat(1, { ...kids(10), templateId: "tpl-kids" });
    expect(beatStep.request(story).prompt).toContain(KIDS_BAND_TURNS["9-12"].image.distribution);
    const field = textFieldOf(story);
    expect(field).toContain(KIDS_BAND_TURNS["9-12"].image.fieldDistribution);
    expect(field).not.toContain("relatively late");
    expect(field).not.toContain("third or fourth");
  });

  it("every place a band names is a paragraph before its last, never the last", () => {
    expect(KIDS_BAND_TURNS["3-5"].image.fieldDistribution).toContain("one on the second paragraph only if there are three. Never put an image tag on the last paragraph.");
    expect(KIDS_BAND_TURNS["6-8"].image.fieldDistribution).toContain("one on the second paragraph (or the third, if there are four). Never put an image tag on the last paragraph.");
    expect(KIDS_BAND_TURNS["9-12"].image.fieldDistribution).toContain("one on the third paragraph. Never put an image tag on the last paragraph.");
    for (const [band] of BANDS) expect(KIDS_BAND_TURNS[band].image.distribution).not.toMatch(/fourth paragraph|fifth/);
  });

  it("leaves a grown-up story's turn with production's image lines, a single player's and a group's", () => {
    for (const story of [threadBeat(1, { generateImages: true }), threadBeat(2, { generateImages: true })]) {
      expect(beatStep.request(story).prompt).toContain("one for the third or fourth paragraph");
    }
  });
});
