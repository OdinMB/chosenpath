import { jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, createStorySetupSchema } from "core/types/index.js";
import { StorySetupPromptService } from "../../../../../src/game/services/prompts/StorySetupPromptService.js";

/*
 * Guards the resolved prompt contradictions (Milestone 2, test plan A7):
 * no built prompt or schema may carry a retired rule again.
 */

const RETIRED_PHRASES = [
  "4-5 sentences",
  "only create the first interlude",
  "+5 to -10",
  "+20 to +30",
  "+/-30",
  "-10/-30",
  "playerBackgroundVariety",
  "Generate 3-4 shared stats.",
  "story.There",
  "configuration.---",
  "??",
  "way.- Take",
  "Contestthreads",
];

const schemaText = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

const storySetupPrompt = () =>
  StorySetupPromptService.createSetupPrompt("A premise", 1, GameModes.SinglePlayer, 25, "story");

const TEXTS: [string, () => string][] = [
  ["setup prompt, story", storySetupPrompt],
  [
    "setup prompt, template",
    () => StorySetupPromptService.createSetupPrompt("A premise", 3, GameModes.Competitive, 25, "template"),
  ],
  ["story setup schema", () => schemaText(createStorySetupSchema(1, "story"))],
  ["template setup schema", () => schemaText(createStorySetupSchema(2, "template"))],
];

beforeEach(() => {
  // The story-state sections log that mock stories have no elements
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("prompt rules", () => {
  it.each(TEXTS)("%s carries none of the retired rules", (_name, build) => {
    const text = build();
    expect(RETIRED_PHRASES.filter((phrase) => text.includes(phrase))).toEqual([]);
  });

  it("does not ask a custom story for 3-5 difficulty levels", () => {
    expect(storySetupPrompt()).not.toContain("3-5 difficulty levels");
  });
});
