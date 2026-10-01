import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import type { StoryState } from "core/types/index.js";
import { KIDS_TURN_TEXT, kidsTurnRequest, kidsShortTextCount, takesKidsTurn } from "../../../../../src/game/services/storyTextRounds/kidsTurn.js";
import { choiceResultRequest } from "../../../../../src/game/services/storyTextRounds/choiceResult.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { productionBeforeKidsAges, productionThen } from "../../../../helpers/adoptedDeltas.js";

/*
 * Read-with-kids turns, shorter and simpler for the reading age the setup
 * states (eval only; fix 6 of the second playthroughs' review, 2026-10-01).
 * The mouse story, read with a five-year-old, ran about 300 words a turn in
 * five or six paragraphs, the same as a grown-up story, with words above the
 * age ("irregular", "reckoned with"): production's kids setup changes the
 * stats only, and every turn is told three times over to write "5-6
 * paragraphs with 3-5 sentences each". The variant is production's turn with,
 * on a read-with-kids story, that count and its shouted repeat (in the prompt
 * and in the text field's description) made a short one, and one block of
 * rules for a child of the recorded age; production's request byte for byte on
 * every other story.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const KIDS: Partial<StoryState> = { category: "read-with-kids", readingAge: "5" };

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

type PlayerJson = { $ref?: string; properties?: { text?: { description?: string } } };

/** The text field's description, per player slot (a slot that shares player1's schema instance is a $ref to it). */
function textDescriptions(schema: Parameters<typeof toJsonSchema>[0]): string[] {
  const root = toJsonSchema(schema) as { properties: Record<string, PlayerJson> };
  const resolve = (value: PlayerJson): PlayerJson => (value.$ref ? resolve(root.properties[value.$ref.split("/").pop() ?? ""] ?? {}) : value);
  return Object.entries(root.properties)
    .filter(([key]) => /^player\d$/.test(key))
    .map(([, value]) => resolve(value).properties?.text?.description ?? "");
}

const TURNS: [string, (overrides: Partial<StoryState>) => Story][] = [
  ["a first turn", (o) => firstSwitchBeat(1, o)],
  ["a chapter step", (o) => threadBeat(1, o)],
  ["a switch turn after a chapter", (o) => laterSwitchBeat(1, o)],
  ["an ending", (o) => endingBeat(1, o)],
  ["a group's chapter step", (o) => threadBeat(2, o)],
  ["a group's switch turn", (o) => laterSwitchBeat(3, o)],
];

describe("which turns take the kids rules", () => {
  it("every turn of a read-with-kids story, with its age or without one (a template tagged Kids records none)", () => {
    expect(takesKidsTurn(threadBeat(1, KIDS))).toBe(true);
    expect(takesKidsTurn(threadBeat(1, { category: "read-with-kids" }))).toBe(true);
    expect(takesKidsTurn(threadBeat(1))).toBe(false);
    expect(takesKidsTurn(threadBeat(1, { category: "learn-something" }))).toBe(false);
  });
});

describe("the variant on a read-with-kids story", () => {
  it.each(TURNS)("%s: the short count in place of production's three, and the rules block once", (_, build) => {
    const story = build(KIDS);
    const request = kidsTurnRequest(story);
    const base = choiceResultRequest(story);
    // Production's count is gone from the prompt and from every text description; the short one stands in its places
    expect(request.prompt).not.toContain("5-6 paragraphs");
    expect(request.prompt).toContain(KIDS_TURN_TEXT.context);
    expect(occurrences(request.prompt, KIDS_TURN_TEXT.rules("a child aged 5"))).toBe(1);
    expect(occurrences(request.prompt, KIDS_TURN_TEXT.repeat("a child aged 5"))).toBe(1);
    for (const description of textDescriptions(request.schema)) {
      expect(description).not.toContain("5-6 paragraphs");
      expect(description).toContain(KIDS_TURN_TEXT.fieldCount("a child aged 5"));
      expect(description).toContain(KIDS_TURN_TEXT.repeat("a child aged 5"));
    }
    expect(textDescriptions(request.schema)).toHaveLength(story.getNumberOfPlayers());
    // Nothing else changes: the state and the rest of the schema are production's
    expect(request.prompt.slice(request.prompt.indexOf("======= CURRENT GAME STATE"))).toBe(base.prompt.slice(base.prompt.indexOf("======= CURRENT GAME STATE")));
    const strip = (value: unknown): unknown => JSON.parse(JSON.stringify(value), (key, v: unknown) => (key === "text" && typeof v === "object" ? "<text>" : v));
    expect(strip(toJsonSchema(request.schema))).toEqual(strip(toJsonSchema(base.schema)));
  });

  it("names the recorded age, or a young child where the story recorded none", () => {
    expect(kidsTurnRequest(threadBeat(1, { category: "read-with-kids", readingAge: "8-10" })).prompt).toContain(KIDS_TURN_TEXT.rules("a child aged 8-10"));
    const template = kidsTurnRequest(threadBeat(1, { category: "read-with-kids" })).prompt;
    expect(template).toContain(KIDS_TURN_TEXT.rules("a young child"));
    expect(template).toContain(KIDS_TURN_TEXT.repeat("a young child"));
  });

  it("asks for short paragraphs of short sentences in the child's everyday words, options and interludes too", () => {
    const rules = KIDS_TURN_TEXT.rules("a child aged 5");
    expect(rules).toContain("3-4 short paragraphs of 2-3 sentences each");
    expect(rules).toContain("everyday words");
    expect(rules).toContain("options");
    expect(rules).toContain("interludes");
    expect(KIDS_TURN_TEXT.context).toContain("3-4 short paragraphs of 2-3 short sentences each");
  });

  it("asks a retry for the same short count", () => {
    expect(kidsShortTextCount(threadBeat(1, KIDS))).toBe("three or four short paragraphs of two or three short sentences each");
    expect(kidsShortTextCount(threadBeat(1))).toBeUndefined();
  });
});

describe("production's request byte for byte on every other story", () => {
  it.each(TURNS)("%s", (_, build) => {
    const story = build({});
    const request = kidsTurnRequest(story);
    expect(request.prompt).toBe(choiceResultRequest(story).prompt);
    // At an ending, production as it stood before the owner's decision of 2026-10-01 on ending milestones
    expect(request.prompt).toBe(productionThen(beatStep.request(story), story).prompt);
    expect(json(request.schema)).toBe(json(beatStep.request(story).schema));
  });

  // Until the kids-ages stage's adoption later that day, which gave every kids turn its age band's text (productionBeforeKidsAges)
  it("and since the stage's adoption (2026-10-01) production was the variant on a single player's kids turn, a group's kids turn unchanged", () => {
    for (const [, build] of TURNS) {
      const story = build(KIDS);
      const production = productionBeforeKidsAges(story);
      if (story.isMultiplayer()) expect(production.prompt).toBe(beatStep.request(build({})).prompt);
      else {
        expect(productionThen(production, story).prompt).toBe(kidsTurnRequest(story).prompt);
        expect(production.json).toBe(json(kidsTurnRequest(story).schema));
      }
    }
  });

  (frozen.length ? it : it.skip)("every frozen turn case: production's request unless the story is read with a child", () => {
    const turns = frozen.filter((c) => c.role === "beat" && c.state);
    expect(turns.length).toBeGreaterThan(50);
    let kids = 0;
    for (const c of turns) {
      const story = caseStory(c);
      const same = kidsTurnRequest(story).prompt === choiceResultRequest(story).prompt;
      expect([c.id, same]).toEqual([c.id, !story.isReadWithKids()]);
      if (story.isReadWithKids()) kids++;
    }
    expect(kids).toBeGreaterThan(0);
  });
});

describe("the eval variant", () => {
  it("sends the request with production's turn limits for the player count, and names the retry's count on a kids story", () => {
    for (const [players, story] of [
      [1, threadBeat(1, KIDS)],
      [2, threadBeat(2, KIDS)],
    ] as const) {
      const request = requestFor("kidsTurn", { role: "beat", story });
      expect(requestText(request)).toBe(kidsTurnRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", players));
      expect("shortTextCount" in request && request.shortTextCount).toBe(kidsShortTextCount(story));
    }
    expect("shortTextCount" in requestFor("kidsTurn", { role: "beat", story: threadBeat(1) })).toBe(false);
  });

  it("covers turns only", () => {
    expect(() => requestFor("kidsTurn", { role: "switch", story: threadBeat(1, KIDS) })).toThrow(/does not cover role switch/);
  });
});
