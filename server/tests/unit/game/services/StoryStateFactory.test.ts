import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { CharacterBackground, StoryTemplate } from "core/types/index.js";
import { GameModes, PublicationStatus } from "core/types/index.js";
import { stat } from "../../../helpers/textFixtures.js";

// The template's images are read from disk; a story from a template without images
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (jest as any).unstable_mockModule("../../../../src/shared/storageUtils.js", () => ({
  __esModule: true,
  loadTemplateImages: jest.fn(() => []),
}));

const { createStoryStateFromTemplate } = await import(
  "../../../../src/game/services/StoryStateFactory.js"
);

function background(values: CharacterBackground["initialPlayerStatValues"]): CharacterBackground {
  return { title: "Smuggler", fluffTemplate: "{name} runs the docks.", initialPlayerStatValues: values };
}

function template(values: CharacterBackground["initialPlayerStatValues"]): StoryTemplate {
  const seat = { outcomes: [], possibleCharacterIdentities: [], possibleCharacterBackgrounds: [background(values)] };
  return {
    id: "template-1",
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    title: "The Docks",
    teaser: "",
    tags: [],
    gameMode: GameModes.Cooperative,
    difficultyLevels: [],
    playerCountMin: 1,
    playerCountMax: 1,
    maxTurnsMin: 10,
    maxTurnsMax: 10,
    publicationStatus: PublicationStatus.Draft,
    showOnWelcomeScreen: false,
    order: 0,
    containsImages: false,
    imageInstructions: {
      visualStyle: "",
      atmosphere: "",
      colorPalette: "",
      settingDetails: "",
      characterStyle: "",
      artInfluences: "",
      coverPrompt: "",
    },
    guidelines: { world: "", rules: [], tone: [], conflicts: [], decisions: [], typesOfThreads: [], switchAndThreadInstructions: [] },
    storyElements: [],
    sharedOutcomes: [],
    statGroups: [],
    sharedStats: [],
    playerStats: [stat("player_nerve", { partOfPlayerBackgrounds: true, initialValue: 40 })],
    characterSelectionIntroduction: { title: "", text: "" },
    player1: seat,
    player2: seat,
    player3: seat,
  } as StoryTemplate;
}

const start = (source: StoryTemplate) =>
  createStoryStateFromTemplate(
    "story-1",
    source,
    1,
    10,
    false,
    false,
    { title: "Balanced", modifier: 0 },
    { player1: "ABC123" }
  );

let log: { mock: { calls: unknown[][] } };
beforeEach(() => {
  log = jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("createStoryStateFromTemplate background values", () => {
  it("starts the story with each background value read by its stat's type", () => {
    const state = start(
      template([
        { statId: "player_nerve", value: "70" },
        { statId: "player_ghost", value: 5 },
      ])
    );

    expect(state.characterSelectionOptions.player1?.possibleCharacterBackgrounds[0]?.initialPlayerStatValues).toEqual([
      { statId: "player_nerve", value: 70 },
    ]);
    const lines = log.mock.calls.map((call) => call.join(" "));
    const checked = lines.filter((line) => line.includes("1 converted, 1 dropped"));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain("story-1");
    expect(checked[0]).toContain("player1 background 0");
    expect(checked[0]).not.toContain("player_nerve");
  });

  it("keeps values that fit as they are and logs no check", () => {
    const state = start(template([{ statId: "player_nerve", value: 70 }]));

    expect(state.characterSelectionOptions.player1?.possibleCharacterBackgrounds[0]?.initialPlayerStatValues).toEqual([
      { statId: "player_nerve", value: 70 },
    ]);
    const lines = log.mock.calls.map((call) => call.join(" "));
    expect(lines.some((line) => /converted|replaced|dropped/.test(line))).toBe(false);
  });
});

/*
 * The read-with-kids setting on a template (the owner's decision of
 * 2026-10-01): a template tagged Kids carries the children's ages its editor
 * set, and its stories inherit them as a custom story records its form's.
 */
describe("createStoryStateFromTemplate: the read-with-kids setting", () => {
  const kids = (overrides: Partial<StoryTemplate>) => ({ ...template([]), ...overrides }) as StoryTemplate;

  it("gives a story from a template tagged Kids the template's ages", () => {
    const state = start(kids({ tags: ["Kids"], kidAges: { min: 6, max: 8 } }));
    expect([state.category, state.kidAges]).toEqual(["read-with-kids", { min: 6, max: 8 }]);
  });

  it("records no ages where the template has none, or isn't tagged Kids, or holds a value that isn't ages", () => {
    expect(start(kids({ tags: ["Kids"] })).kidAges).toBeUndefined();
    expect(start(kids({ tags: ["Fiction"], kidAges: { min: 6, max: 8 } })).kidAges).toBeUndefined();
    expect(start(kids({ tags: ["Kids"], kidAges: { min: 9, max: 4 } })).kidAges).toBeUndefined();
    expect(start(kids({ tags: ["Kids"], kidAges: null })).kidAges).toBeUndefined();
  });
});
