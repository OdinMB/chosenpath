import { KID_AGES_HINT } from "core/types";
import {
  draftedKidsSetting,
  kidAgesFieldText,
  unreadableTemplateKidAges,
} from "../../../../src/resources/templates/utils/templateKidAges";

/*
 * The template editor's read-with-kids setting (the owner's decision of
 * 2026-10-01; the review of its first version): what the Children's ages
 * field shows, when an unreadable value keeps Save from saving, and what a
 * Draft World on the read-with-kids category gives the template.
 */

describe("kidAgesFieldText: what the Children's ages field shows", () => {
  it("shows the text typed since the form last took a template, as typed", () => {
    expect(kidAgesFieldText("4", { min: 8, max: 10 })).toBe("4");
    expect(kidAgesFieldText("8 to 10", { min: 8, max: 10 })).toBe("8 to 10");
    expect(kidAgesFieldText("8-1", null)).toBe("8-1");
    expect(kidAgesFieldText("", { min: 8, max: 10 })).toBe("");
  });

  it("shows the template's ages where nothing was typed since (a template loaded, changes discarded, a save reverted, a draft)", () => {
    expect(kidAgesFieldText(undefined, { min: 8, max: 10 })).toBe("8-10");
    expect(kidAgesFieldText(undefined, { min: 7, max: 7 })).toBe("7");
    expect(kidAgesFieldText(undefined, null)).toBe("");
    expect(kidAgesFieldText(undefined, undefined)).toBe("");
  });
});

describe("unreadableTemplateKidAges: the hint that keeps Save from saving", () => {
  it("is the hint for typed ages it can't read on a template tagged Kids", () => {
    expect(unreadableTemplateKidAges(["Fiction", "Kids"], "8-1")).toBe(KID_AGES_HINT);
    expect(unreadableTemplateKidAges(["kids"], "five")).toBe(KID_AGES_HINT);
  });

  it("is nothing for readable or empty ages, nothing typed, or a template not tagged Kids (the field isn't shown)", () => {
    expect(unreadableTemplateKidAges(["Kids"], "8 to 10")).toBeUndefined();
    expect(unreadableTemplateKidAges(["Kids"], "5")).toBeUndefined();
    expect(unreadableTemplateKidAges(["Kids"], "")).toBeUndefined();
    expect(unreadableTemplateKidAges(["Kids"], undefined)).toBeUndefined();
    expect(unreadableTemplateKidAges(["Fiction"], "8-1")).toBeUndefined();
    expect(unreadableTemplateKidAges(undefined, "8-1")).toBeUndefined();
  });
});

describe("draftedKidsSetting: a Draft World on the read-with-kids category", () => {
  it("gives the template the Kids tag and the ages the form read", () => {
    expect(
      draftedKidsSetting({ tags: ["Fiction"], kidAges: null }, { category: "read-with-kids", kidAges: { min: 10, max: 12 } })
    ).toEqual({ tags: ["Fiction", "Kids"], kidAges: { min: 10, max: 12 } });
    expect(draftedKidsSetting({}, { category: "read-with-kids", kidAges: { min: 4, max: 4 } })).toEqual({
      tags: ["Kids"],
      kidAges: { min: 4, max: 4 },
    });
  });

  it("adds the tag once, and the drafted ages replace the template's", () => {
    expect(
      draftedKidsSetting({ tags: ["kids"], kidAges: { min: 6, max: 8 } }, { category: "read-with-kids", kidAges: { min: 9, max: 9 } })
    ).toEqual({ tags: ["kids"], kidAges: { min: 9, max: 9 } });
  });

  it("keeps the template's ages where the form had none (the field is optional)", () => {
    expect(draftedKidsSetting({ tags: [], kidAges: { min: 6, max: 8 } }, { category: "read-with-kids" })).toEqual({ tags: ["Kids"] });
  });

  it("changes nothing on any other category", () => {
    expect(draftedKidsSetting({ tags: ["Fiction"], kidAges: null }, { category: "enjoy-fiction" })).toEqual({});
    expect(draftedKidsSetting({ tags: ["Kids"], kidAges: { min: 6, max: 8 } }, {})).toEqual({});
  });
});
