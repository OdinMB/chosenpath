import { jest } from "@jest/globals";
import type { CharacterBackground, CharacterIdentity, Stat, StatValueEntry } from "core/types/index.js";
import { createMockStory } from "../../helpers/testHelpers.js";
import { stat } from "../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const identity: CharacterIdentity = {
  name: "Mira",
  pronouns: { personal: "she", object: "her", possessive: "her", reflexive: "herself" },
  appearance: "tall",
};

function background(values: StatValueEntry[]): CharacterBackground {
  return { title: "Smuggler", fluffTemplate: "{name} runs the docks.", initialPlayerStatValues: values };
}

/** A stat as a stored template may hold it: with no initialValue key. */
function withoutInitialValue(definition: Stat): Stat {
  const copy = { ...definition };
  Reflect.deleteProperty(copy, "initialValue");
  return copy;
}

function selected(playerStats: Stat[], values: StatValueEntry[]): StatValueEntry[] {
  const story = createMockStory({ playerStats });
  return story.setCharacterSelection("player1", identity, background(values), 0, 1).getPlayer("player1")?.statValues ?? [];
}

describe("PlayerManager.setCharacterSelection stat values", () => {
  it("fills a background stat the background leaves out from the stat's initial value", () => {
    const stats = [
      stat("player_nerve", { partOfPlayerBackgrounds: true, initialValue: 40 }),
      stat("player_cash", { type: "number", partOfPlayerBackgrounds: true, initialValue: 7 }),
    ];
    expect(selected(stats, [{ statId: "player_nerve", value: 70 }])).toEqual([
      { statId: "player_nerve", value: 70 },
      { statId: "player_cash", value: 7 },
    ]);
  });

  it("uses the editor's default when the stat has no initial value", () => {
    const stats = [
      withoutInitialValue(stat("player_rank", { type: "string", partOfPlayerBackgrounds: true })),
      withoutInitialValue(stat("player_contacts", { type: "string[]", partOfPlayerBackgrounds: true })),
      withoutInitialValue(stat("player_nerve", { partOfPlayerBackgrounds: true })),
    ];
    expect(selected(stats, [])).toEqual([
      { statId: "player_rank", value: "" },
      { statId: "player_contacts", value: [] },
      { statId: "player_nerve", value: 50 },
    ]);
  });

  it("logs how many values it filled for which seat, without stat ids", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    selected([stat("player_cash", { type: "number", partOfPlayerBackgrounds: true, initialValue: 7 })], []);
    const lines = log.mock.calls.map((call) => call.join(" "));
    expect(lines.some((line) => line.includes("player1") && line.includes("1 background stat"))).toBe(true);
    expect(lines.some((line) => line.includes("player_cash"))).toBe(false);
  });

  it("keeps the background's values and the universal stats as before", () => {
    const stats = [
      stat("player_nerve", { partOfPlayerBackgrounds: true, initialValue: 40 }),
      stat("player_luck", { partOfPlayerBackgrounds: false, initialValue: 20 }),
    ];
    expect(selected(stats, [{ statId: "player_nerve", value: 90 }])).toEqual([
      { statId: "player_nerve", value: 90 },
      { statId: "player_luck", value: 20 },
    ]);
  });
});
