import { jest } from "@jest/globals";
import {
  BeatPromptService,
  GENERIC_ELEMENT_IMAGES_FIRST_INSTRUCTION,
} from "../../../../../src/game/services/prompts/BeatPromptService.js";
import { createMockStory } from "../../../../helpers/testHelpers.js";
import {
  endingBeat,
  firstSwitchBeat,
  historyText,
  laterSwitchBeat,
  threadBeat,
} from "../../../../helpers/promptStories.js";

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

describe("BeatPromptService: what each beat is shown", () => {
  const RESOLUTION_NOTE =
    "describe the resolution of the thread in detail. Focus on the milestones that were added to outcomes and how that affects the player";

  it("shows a thread beat the texts of this thread's own beats", () => {
    const prompt = BeatPromptService.createBeatPrompt(threadBeat());

    expect(prompt).toContain(`Beat 1/3: Step 1\n\n${historyText("player1", 2)}`);
    expect(prompt).not.toContain(historyText("player1", 0));
    expect(prompt).not.toContain(historyText("player1", 1));
  });

  it("shows the ending the thread it wraps up, and the outcomes", () => {
    const prompt = BeatPromptService.createBeatPrompt(endingBeat());

    expect(prompt).toContain("Final Thread");
    expect(prompt).not.toContain("Older Thread");
    expect(prompt).toContain("SHARED OUTCOMES that will affect all players:");
    expect(prompt).toContain("OUTCOMES that will define this character's story ending:");
  });

  it("asks only switch beats to create the next switch", () => {
    expect(BeatPromptService.createBeatPrompt(threadBeat())).not.toContain("create the next switch");
    expect(BeatPromptService.createBeatPrompt(firstSwitchBeat())).toContain("create the next switch");
  });

  it("keeps the thread-resolution note on a switch beat after a thread", () => {
    expect(BeatPromptService.createBeatPrompt(laterSwitchBeat(1))).toContain(`${RESOLUTION_NOTE}.`);
    expect(BeatPromptService.createBeatPrompt(laterSwitchBeat(2))).toContain(
      `${RESOLUTION_NOTE} (and other players).`
    );
  });

  it("tells multiplayer beats, not single-player ones, to show other players' images", () => {
    const images = { generateImages: true };
    const sentence = "Do show other players' images";

    expect(BeatPromptService.createBeatPrompt(laterSwitchBeat(2, images))).toContain(sentence);
    expect(BeatPromptService.createBeatPrompt(laterSwitchBeat(1, images))).not.toContain(sentence);
  });
});
