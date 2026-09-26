import { jest } from "@jest/globals";
import { SwitchPromptService } from "../../../../../src/game/services/prompts/SwitchPromptService.js";
import { createMockStory } from "../../../../helpers/testHelpers.js";
import { switchAnalysisAfterThread } from "../../../../helpers/promptStories.js";

beforeEach(() => {
  // The story-state section logs that the mock story has no elements
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("SwitchPromptService: example output", () => {
  it.each([
    ["at the start", () => createMockStory()],
    ["after a thread", () => switchAnalysisAfterThread(1)],
  ])("gives a single-player story a single-player example %s", (_when, build) => {
    const prompt = SwitchPromptService.createSwitchAnalysisPrompt(build());

    expect(prompt).not.toMatch(/player2|player3/);
    expect(prompt).toContain("IMPORTANT:\nThis whole exercise is ONLY about designing a sensible narrative structure.");
  });

  it("keeps the 3-player example for a later multiplayer switch", () => {
    const prompt = SwitchPromptService.createSwitchAnalysisPrompt(switchAnalysisAfterThread(2));

    expect(prompt).toContain("player3 will get a topic switch");
    expect(prompt).toContain("IMPORTANT:\nThis whole exercise is ONLY about designing a sensible narrative structure.");
  });
});
