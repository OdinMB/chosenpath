import { jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, createStorySetupSchema } from "core/types/index.js";
import { createSetOfBeatGenerationSchema } from "core/types/beat.js";
import { StorySetupPromptService } from "../../../../../src/game/services/prompts/StorySetupPromptService.js";
import { BeatPromptService } from "../../../../../src/game/services/prompts/BeatPromptService.js";
import { SwitchPromptService } from "../../../../../src/game/services/prompts/SwitchPromptService.js";
import { ThreadPromptService } from "../../../../../src/game/services/prompts/ThreadPromptService.js";
import {
  firstSwitchBeat,
  laterSwitchBeat,
  switchAnalysisAfterThread,
  threadAnalysisAfterSwitch,
  threadBeat,
} from "../../../../helpers/promptStories.js";

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
  ["beat prompt, first beat", () => BeatPromptService.createBeatPrompt(firstSwitchBeat(1, { generateImages: true }))],
  ["beat prompt, single-player thread beat", () => BeatPromptService.createBeatPrompt(threadBeat(1))],
  ["beat prompt, multiplayer thread beat", () => BeatPromptService.createBeatPrompt(threadBeat(2))],
  ["beat prompt, multiplayer switch beat", () => BeatPromptService.createBeatPrompt(laterSwitchBeat(2))],
  ["switch analysis, single-player", () => SwitchPromptService.createSwitchAnalysisPrompt(switchAnalysisAfterThread(1))],
  ["switch analysis, multiplayer", () => SwitchPromptService.createSwitchAnalysisPrompt(switchAnalysisAfterThread(3))],
  ["thread analysis, single-player", () => ThreadPromptService.createThreadPrompt(threadAnalysisAfterSwitch(1))],
  ["thread analysis, multiplayer", () => ThreadPromptService.createThreadPrompt(threadAnalysisAfterSwitch(2))],
  ["beat schema, images on", () => schemaText(createSetOfBeatGenerationSchema(2, true, true, true, true))],
  ["beat schema, images off", () => schemaText(createSetOfBeatGenerationSchema(1, false, false, false, false))],
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
