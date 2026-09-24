import { jest } from "@jest/globals";
import {
  BeatPromptService,
  GENERIC_ELEMENT_IMAGES_FIRST_INSTRUCTION,
} from "../../../../../src/game/services/prompts/BeatPromptService.js";
import { createMockStory } from "../../../../helpers/testHelpers.js";

beforeEach(() => {
  // The story-state section logs that the mock story has no elements
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("BeatPromptService: generic element images first", () => {
  it("asks template-based stories that generate images for generic element images first", () => {
    const story = createMockStory({
      generateImages: true,
      templateId: "template-under-test",
    });

    expect(BeatPromptService.createBeatPrompt(story)).toContain(
      GENERIC_ELEMENT_IMAGES_FIRST_INSTRUCTION
    );
  });

  it("asks custom stories that generate images for generic element images first", () => {
    const story = createMockStory({ generateImages: true });

    expect(BeatPromptService.createBeatPrompt(story)).toContain(
      GENERIC_ELEMENT_IMAGES_FIRST_INSTRUCTION
    );
  });

  it("leaves the instruction out when the story does not generate images", () => {
    const story = createMockStory({
      generateImages: false,
      templateId: "template-under-test",
    });

    expect(BeatPromptService.createBeatPrompt(story)).not.toContain(
      GENERIC_ELEMENT_IMAGES_FIRST_INSTRUCTION
    );
  });
});
