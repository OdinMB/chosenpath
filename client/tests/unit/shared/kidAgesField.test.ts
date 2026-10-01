import { KID_AGES_HINT, parseKidAges } from "core/types";
import { readKidAgesField } from "../../../src/shared/utils/kidAgesField";
import { suggestionData } from "../../../src/page/data/suggestionData";

/*
 * The read-with-kids setting's field (the setup form and the template
 * editor; the owner's decision of 2026-10-01): one age or a range, read with
 * core's parseKidAges, an empty field left unset, anything else an error with
 * the hint.
 */

describe("readKidAgesField", () => {
  it("reads one age or a range, and leaves an empty field unset", () => {
    expect(readKidAgesField("5")).toEqual({ ages: { min: 5, max: 5 } });
    expect(readKidAgesField("8-10")).toEqual({ ages: { min: 8, max: 10 } });
    expect(readKidAges(" 8 to 10 ")).toEqual({ min: 8, max: 10 });
    expect(readKidAgesField("")).toEqual({});
    expect(readKidAgesField("   ")).toEqual({});
  });

  it("answers anything else with the hint", () => {
    expect(readKidAgesField("five")).toEqual({ error: KID_AGES_HINT });
    expect(readKidAgesField("5, 8")).toEqual({ error: KID_AGES_HINT });
    expect(readKidAgesField("16")).toEqual({ error: KID_AGES_HINT });
  });
});

function readKidAges(text: string) {
  return readKidAgesField(text).ages;
}

describe("the read-with-kids suggestions", () => {
  it("each fill the field with ages it reads", () => {
    const fills = JSON.stringify(suggestionData["read-with-kids"]).match(/"kidAge":"[^"]*"/g) ?? [];
    expect(fills.length).toBeGreaterThan(10);
    for (const fill of fills) {
      const value = fill.slice('"kidAge":"'.length, -1);
      expect([value, parseKidAges(value) !== undefined]).toEqual([value, true]);
    }
  });
});
