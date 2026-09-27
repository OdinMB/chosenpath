import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { CharacterBackground, StoryTemplate } from "core/types/index.js";
import { stat } from "../../helpers/textFixtures.js";

// The service writes template.json and a DB row; both are stubbed here
const writeFile = jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const readFile = jest.fn<(...args: unknown[]) => Promise<string>>(async () => "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("fs/promises", () => ({
  __esModule: true,
  default: { writeFile, readFile, mkdir: jest.fn(async () => undefined) },
}));
await mockModule("fs", () => ({
  __esModule: true,
  default: { existsSync: jest.fn(() => true) },
}));
await mockModule("../../../src/shared/storageUtils.js", () => ({
  __esModule: true,
  ensureStorageDirectory: jest.fn(async () => undefined),
  getStoragePath: jest.fn(() => "templates"),
}));
await mockModule("../../../src/templates/TemplateDbService.js", () => ({
  __esModule: true,
  templateDbService: {
    createTemplateEntry: jest.fn(async () => undefined),
    updateTemplateEntry: jest.fn(async () => undefined),
    findTemplateEntryById: jest.fn(async () => null),
  },
}));
await mockModule("../../../src/game/services/AIStoryGenerator.js", () => ({
  __esModule: true,
  AIStoryGenerator: class {},
}));
await mockModule("../../../src/game/services/prompts/StorySetupPromptService.js", () => ({
  __esModule: true,
  StorySetupPromptService: {},
}));
await mockModule("../../../src/templates/templateZipUtils.js", () => ({
  __esModule: true,
  extractAndAnalyzeTemplateZip: jest.fn(),
  copyTemplateFiles: jest.fn(),
  cleanupTempFiles: jest.fn(),
}));

const { TemplateService } = await import("../../../src/templates/TemplateService.js");

function seat(values: CharacterBackground["initialPlayerStatValues"]) {
  return {
    outcomes: [],
    possibleCharacterIdentities: [],
    possibleCharacterBackgrounds: [{ title: "Smuggler", fluffTemplate: "{name} runs the docks.", initialPlayerStatValues: values }],
  };
}

const playerStats = [stat("player_nerve", { partOfPlayerBackgrounds: true, initialValue: 40 })];

function writtenTemplate(): StoryTemplate {
  const content = writeFile.mock.calls.at(-1)?.[1];
  return JSON.parse(String(content)) as StoryTemplate;
}

let log: { mock: { calls: unknown[][] } };
beforeEach(() => {
  writeFile.mockClear();
  log = jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

const checkLines = () =>
  log.mock.calls.map((call) => call.join(" ")).filter((line) => /converted|replaced|dropped/.test(line));

describe("TemplateService background values on save", () => {
  it("saves a new template with each background value read by its stat's type", async () => {
    const saved = await new TemplateService().createTemplate({
      id: "template-1",
      playerStats,
      player1: seat([
        { statId: "player_nerve", value: "70" },
        { statId: "player_ghost", value: 1 },
      ]),
    });

    const expected = [{ statId: "player_nerve", value: 70 }];
    expect(writtenTemplate().player1.possibleCharacterBackgrounds[0]?.initialPlayerStatValues).toEqual(expected);
    expect(saved.player1.possibleCharacterBackgrounds[0]?.initialPlayerStatValues).toEqual(expected);
    expect(checkLines()).toHaveLength(1);
    expect(checkLines()[0]).toContain("template-1");
    expect(checkLines()[0]).toContain("player1 background 0: 1 converted, 1 dropped");
    expect(checkLines()[0]).not.toContain("player_nerve");
  });

  it("checks an updated template against the stats it will hold after the update", async () => {
    readFile.mockResolvedValueOnce(
      JSON.stringify({ id: "template-2", title: "Docks", playerStats, player1: seat([{ statId: "player_nerve", value: 50 }]) })
    );

    await new TemplateService().updateTemplate("template-2", {
      player1: seat([{ statId: "player_nerve", value: "high" }]),
    });

    expect(writtenTemplate().player1.possibleCharacterBackgrounds[0]?.initialPlayerStatValues).toEqual([
      { statId: "player_nerve", value: 40 },
    ]);
    expect(checkLines()).toEqual([expect.stringContaining("player1 background 0: 1 replaced")]);
  });

  it("saves values that fit as they are, with no check logged", async () => {
    await new TemplateService().createTemplate({
      id: "template-3",
      playerStats,
      player1: seat([{ statId: "player_nerve", value: 70 }]),
    });

    expect(writtenTemplate().player1.possibleCharacterBackgrounds[0]?.initialPlayerStatValues).toEqual([
      { statId: "player_nerve", value: 70 },
    ]);
    expect(checkLines()).toEqual([]);
  });
});
