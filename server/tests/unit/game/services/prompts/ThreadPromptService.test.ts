import { jest } from "@jest/globals";
import { ThreadPromptService } from "../../../../../src/game/services/prompts/ThreadPromptService.js";
import { firstThreadAnalysis, threadAnalysisAfterSwitch } from "../../../../helpers/promptStories.js";

beforeEach(() => {
  // The story-state section logs that the mock story has no elements
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const FIRST_THREAD_RULE = "MANDATORY FIRST THREAD REQUIREMENT";
const FIRST_THREAD_REMINDER = "IMPORTANT REMINDER: For this first thread of the game";
const LATER_SET_UP = "A summary of how you want to set up the threads";

describe("Story.hasThreadAnalysis", () => {
  it("is false until the story holds a thread plan", () => {
    expect(firstThreadAnalysis(2).hasThreadAnalysis()).toBe(false);
    expect(threadAnalysisAfterSwitch(2).hasThreadAnalysis()).toBe(true);
  });
});

describe("ThreadPromptService: the multiplayer first-thread rule", () => {
  it("prints for the first thread plan, which runs at turn 1", () => {
    const story = firstThreadAnalysis(2);
    expect(story.getCurrentTurn()).toBe(1);

    const prompt = ThreadPromptService.createThreadPrompt(story);

    expect(prompt).toContain(FIRST_THREAD_RULE);
    expect(prompt).toContain(FIRST_THREAD_REMINDER);
    expect(prompt).not.toContain(LATER_SET_UP);
  });

  it("does not print once the story has a thread plan", () => {
    const prompt = ThreadPromptService.createThreadPrompt(threadAnalysisAfterSwitch(2));

    expect(prompt).not.toContain(FIRST_THREAD_RULE);
    expect(prompt).not.toContain(FIRST_THREAD_REMINDER);
    expect(prompt).toContain(LATER_SET_UP);
  });

  it("does not print in single player", () => {
    const prompt = ThreadPromptService.createThreadPrompt(firstThreadAnalysis(1));

    expect(prompt).not.toContain(FIRST_THREAD_RULE);
    expect(prompt).not.toContain(FIRST_THREAD_REMINDER);
    expect(prompt).toContain("there is always only one thread");
  });
});
