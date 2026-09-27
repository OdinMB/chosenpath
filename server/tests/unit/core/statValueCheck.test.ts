import { describe, expect, it } from "@jest/globals";
import type {
  CharacterBackground,
  PlayerOptionsGeneration,
  Stat,
  StatValueEntry,
} from "core/types/index.js";
import {
  checkBackgroundStatValues,
  checkSeatBackgrounds,
  checkStatValue,
  checkStoryStateBackgrounds,
  checkTemplateBackgrounds,
  countStatValueFixes,
  describeBackgroundFixes,
  statValueFit,
} from "core/utils/statValueCheck.js";
import { createMockStoryState } from "../../helpers/testHelpers.js";
import { stat } from "../../helpers/textFixtures.js";

const percentage = stat("player_nerve", { initialValue: 40 });
const opposites = stat("player_order", { type: "opposites", initialValue: 50 });
const count = stat("player_cash", { type: "number", initialValue: 7 });
const rank = stat("player_rank", { type: "string", initialValue: "Novice" });
const items = stat("player_items", { type: "string[]", initialValue: ["rope"] });

describe("checkStatValue", () => {
  it.each([
    [percentage, 70],
    [percentage, 0],
    [percentage, 100],
    [opposites, 65],
    [count, 1200],
    [count, -3],
    [rank, "Master"],
    [rank, ""],
    [items, ["sword", "map"]],
    [items, []],
  ])("keeps a value of the right type (%#)", (definition, value) => {
    expect(checkStatValue(definition, value)).toEqual({ value });
  });

  it.each([
    [percentage, "5", 5],
    [percentage, " 75% ", 75],
    [count, "12", 12],
    [count, "-4.5", -4.5],
    [opposites, "60", 60],
    [opposites, "60|40", 60],
    [opposites, "30% | 70%", 30],
    [rank, ["Master"], "Master"],
    [items, "sword", ["sword"]],
    [items, "", []],
  ])("converts an unambiguous value (%#)", (definition, value, converted) => {
    expect(checkStatValue(definition, value)).toEqual({
      value: converted,
      kind: "converted",
    });
  });

  it.each([
    [percentage, 120, 100],
    [percentage, -5, 0],
    [percentage, "150", 100],
    [percentage, " 140% ", 100],
    [percentage, "-10", 0],
    [opposites, 130, 100],
    [opposites, "-20%", 0],
  ])("clamps a percentage or opposites value outside 0 to 100 to the range (%#)", (definition, value, clamped) => {
    expect(checkStatValue(definition, value)).toEqual({
      value: clamped,
      kind: "clamped",
    });
  });

  it("leaves a number stat unbounded", () => {
    expect(checkStatValue(count, 5000)).toEqual({ value: 5000 });
    expect(checkStatValue(count, "-250")).toEqual({ value: -250, kind: "converted" });
  });

  it.each([
    [percentage, Number.NaN, 40],
    [percentage, Number.POSITIVE_INFINITY, 40],
    [percentage, "high", 40],
    [percentage, ["5"], 40],
    [opposites, "60|30", 50],
    [opposites, "Order|Chaos", 50],
    [count, "1,000", 7],
    [count, Number.NaN, 7],
    [rank, 3, "Novice"],
    [rank, ["Novice", "Master"], "Novice"],
    [items, 3, ["rope"]],
    [items, ["sword", 2], ["rope"]],
    [items, null, ["rope"]],
  ])("replaces anything else with the stat's own initial value (%#)", (definition, value, initial) => {
    expect(checkStatValue(definition, value)).toEqual({
      value: initial,
      kind: "replaced",
    });
  });

  it("falls back to the editor's default when the stat's initial value doesn't fit either", () => {
    expect(checkStatValue({ ...percentage, initialValue: "lots" }, "none")).toEqual({
      value: 50,
      kind: "replaced",
    });
    expect(checkStatValue({ ...rank, initialValue: 4 }, 4)).toEqual({ value: "", kind: "replaced" });
    expect(checkStatValue({ ...items, initialValue: 4 }, 4)).toEqual({ value: [], kind: "replaced" });
  });

  it("uses a converted initial value as the replacement", () => {
    expect(checkStatValue({ ...percentage, initialValue: "30" }, "none")).toEqual({
      value: 30,
      kind: "replaced",
    });
  });

  it("uses a clamped initial value as the replacement", () => {
    expect(checkStatValue({ ...percentage, initialValue: 130 }, "none")).toEqual({
      value: 100,
      kind: "replaced",
    });
  });
});

describe("statValueFit", () => {
  it("tells a value that fits, one that converts, one out of range and one of the wrong type apart", () => {
    expect(statValueFit(percentage, 5)).toBe("fits");
    expect(statValueFit(percentage, "5")).toBe("converts");
    expect(statValueFit(percentage, 120)).toBe("clamps");
    expect(statValueFit(percentage, "150%")).toBe("clamps");
    expect(statValueFit(percentage, "high")).toBe("wrongType");
    expect(statValueFit(items, "sword")).toBe("converts");
    expect(statValueFit(rank, 3)).toBe("wrongType");
  });
});

describe("checkBackgroundStatValues", () => {
  const playerStats: Stat[] = [percentage, rank, items];

  it("leaves values that fit alone and reports nothing", () => {
    const values: StatValueEntry[] = [
      { statId: "player_nerve", value: 70 },
      { statId: "player_rank", value: "Master" },
    ];
    expect(checkBackgroundStatValues(playerStats, values)).toEqual({ values, fixes: [] });
  });

  it("converts, replaces and drops unknown stat ids, one fix each", () => {
    const result = checkBackgroundStatValues(playerStats, [
      { statId: "player_nerve", value: "70" },
      { statId: "player_rank", value: 2 },
      { statId: "player_ghost", value: 10 },
      { statId: "shared_weather", value: "Storm" },
      { statId: "player_items", value: "sword" },
    ]);

    expect(result.values).toEqual([
      { statId: "player_nerve", value: 70 },
      { statId: "player_rank", value: "Novice" },
      { statId: "player_items", value: ["sword"] },
    ]);
    expect(result.fixes).toEqual([
      { statId: "player_nerve", kind: "converted" },
      { statId: "player_rank", kind: "replaced" },
      { statId: "player_ghost", kind: "dropped" },
      { statId: "shared_weather", kind: "dropped" },
      { statId: "player_items", kind: "converted" },
    ]);
  });

  it("reads a missing value list as empty", () => {
    expect(checkBackgroundStatValues(playerStats, undefined)).toEqual({ values: [], fixes: [] });
  });

  it("clamps an out-of-range starting value instead of replacing it", () => {
    const result = checkBackgroundStatValues(playerStats, [{ statId: "player_nerve", value: 120 }]);

    expect(result.values).toEqual([{ statId: "player_nerve", value: 100 }]);
    expect(result.fixes).toEqual([{ statId: "player_nerve", kind: "clamped" }]);
  });

  it("counts the fixes by kind, without stat ids", () => {
    const { fixes } = checkBackgroundStatValues([...playerStats, opposites], [
      { statId: "player_nerve", value: "70" },
      { statId: "player_order", value: -5 },
      { statId: "player_rank", value: "5" },
      { statId: "player_items", value: 5 },
      { statId: "player_ghost", value: 10 },
    ]);
    expect(countStatValueFixes(fixes)).toBe("1 converted, 1 clamped, 1 replaced, 1 dropped");
  });
});

describe("checkSeatBackgrounds", () => {
  function background(title: string, values: StatValueEntry[]): CharacterBackground {
    return { title, fluffTemplate: "{name} is here.", initialPlayerStatValues: values };
  }

  function seat(backgrounds: CharacterBackground[]): PlayerOptionsGeneration {
    return { outcomes: [], possibleCharacterIdentities: [], possibleCharacterBackgrounds: backgrounds };
  }

  it("checks every background of every seat and says where it fixed what", () => {
    const clean = seat([background("Pilot", [{ statId: "player_nerve", value: 60 }])]);
    const seats = {
      player1: clean,
      player2: seat([
        background("Scout", [{ statId: "player_nerve", value: 55 }]),
        background("Smuggler", [
          { statId: "player_nerve", value: "80%" },
          { statId: "player_ghost", value: 1 },
        ]),
      ]),
      player3: undefined,
    };

    const result = checkSeatBackgrounds([percentage], seats);

    expect(result.seats.player1).toBe(clean);
    expect(result.seats.player3).toBeUndefined();
    expect(result.seats.player2?.possibleCharacterBackgrounds[1]?.initialPlayerStatValues).toEqual([
      { statId: "player_nerve", value: 80 },
    ]);
    expect(result.seats.player2?.possibleCharacterBackgrounds[0]).toBe(
      seats.player2.possibleCharacterBackgrounds[0]
    );
    expect(result.fixed).toEqual([
      {
        slot: "player2",
        background: 1,
        fixes: [
          { statId: "player_nerve", kind: "converted" },
          { statId: "player_ghost", kind: "dropped" },
        ],
      },
    ]);
    expect(describeBackgroundFixes(result.fixed)).toBe("player2 background 1: 1 converted, 1 dropped");
  });

  it("returns the seats untouched when every value fits", () => {
    const seats = { player1: seat([background("Pilot", [{ statId: "player_nerve", value: 60 }])]) };
    const result = checkSeatBackgrounds([percentage], seats);
    expect(result.fixed).toEqual([]);
    expect(result.seats.player1).toBe(seats.player1);
  });

  it("checks a template's seats against its player stats and keeps the rest of it", () => {
    const template = {
      id: "template-1",
      playerStats: [percentage],
      sharedStats: [],
      player1: seat([background("Pilot", [{ statId: "player_nerve", value: "60" }])]),
      player2: seat([background("Scout", [{ statId: "player_nerve", value: 20 }])]),
    };

    const result = checkTemplateBackgrounds(template);

    expect(result.fixed).toEqual([
      { slot: "player1", background: 0, fixes: [{ statId: "player_nerve", kind: "converted" }] },
    ]);
    expect(result.template.player1.possibleCharacterBackgrounds[0]?.initialPlayerStatValues).toEqual([
      { statId: "player_nerve", value: 60 },
    ]);
    expect(result.template.player2).toBe(template.player2);
    expect(result.template.id).toBe("template-1");
    // The template passed in is not mutated
    expect(template.player1.possibleCharacterBackgrounds[0]?.initialPlayerStatValues[0]?.value).toBe("60");
  });

  it("returns a template with nothing to fix as the same object", () => {
    const template = {
      playerStats: [percentage],
      player1: seat([background("Pilot", [{ statId: "player_nerve", value: 60 }])]),
    };
    expect(checkTemplateBackgrounds(template)).toEqual({ template, fixed: [] });
    expect(checkTemplateBackgrounds(template).template).toBe(template);
  });

  it("checks a story state's character selection options", () => {
    const state = createMockStoryState({
      playerStats: [percentage],
      characterSelectionOptions: {
        player1: seat([background("Pilot", [{ statId: "player_nerve", value: "high" }])]),
      },
    });

    const result = checkStoryStateBackgrounds(state);

    expect(result.fixed).toEqual([
      { slot: "player1", background: 0, fixes: [{ statId: "player_nerve", kind: "replaced" }] },
    ]);
    expect(
      result.state.characterSelectionOptions.player1?.possibleCharacterBackgrounds[0]?.initialPlayerStatValues
    ).toEqual([{ statId: "player_nerve", value: 40 }]);
    expect(result.state.players).toBe(state.players);
  });
});
