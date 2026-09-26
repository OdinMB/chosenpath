import { GameModes } from "core/types/index.js";
import { StorySetupPromptService } from "../../../../../src/game/services/prompts/StorySetupPromptService.js";

const PREMISE = "A Lighthouse keeper on Mars finds a Message in the dust";

function between(text: string, open: string, close: string): string | undefined {
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  if (start < 0 || end < start) return undefined;
  return text.slice(start + open.length, end).trim();
}

describe("StorySetupPromptService.createSetupPrompt", () => {
  const story = StorySetupPromptService.createSetupPrompt(
    PREMISE,
    1,
    GameModes.SinglePlayer,
    25,
    "story"
  );
  const template = StorySetupPromptService.createSetupPrompt(
    PREMISE,
    2,
    GameModes.Cooperative,
    25,
    "template"
  );

  it("sends the premise verbatim inside premise tags", () => {
    expect(between(story, "<premise>", "</premise>")).toBe(PREMISE);
    expect(story).not.toContain(PREMISE.toUpperCase());
  });

  it("asks a custom story for exactly one difficulty level", () => {
    expect(story).toContain("exactly one difficulty level");
    expect(story).not.toContain("3-5 difficulty levels");
  });

  it("still asks a template for 3-5 difficulty levels", () => {
    expect(template).toContain("3-5 difficulty levels");
    expect(template).not.toContain("exactly one difficulty level");
  });
});

describe("StorySetupPromptService.createIterationPrompt", () => {
  const feedback = "Make the Villain less Obvious";
  const fullTemplate = {
    title: "The Drowned Library",
    creatorId: "user-4711",
    creatorUsername: "librarian_odin",
    guidelines: { world: "A flooded archive" },
  };
  const prompt = StorySetupPromptService.createIterationPrompt(
    feedback,
    1,
    GameModes.SinglePlayer,
    25,
    ["guidelines"],
    fullTemplate
  );

  it("sends the feedback verbatim inside feedback tags", () => {
    expect(between(prompt, "<feedback>", "</feedback>")).toBe(feedback);
    expect(prompt).not.toContain(feedback.toUpperCase());
  });

  it("serialises the template without its creator's id and username", () => {
    // The fixture carries both values, so the absence below is not vacuous
    expect(JSON.stringify(fullTemplate)).toContain("user-4711");
    expect(prompt).toContain("The Drowned Library");
    expect(prompt).not.toContain("user-4711");
    expect(prompt).not.toContain("librarian_odin");
    expect(prompt).not.toMatch(/creatorId|creatorUsername/);
  });
});
