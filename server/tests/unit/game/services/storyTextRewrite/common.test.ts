import { z } from "zod";
import {
  asArray,
  asDiscriminatedUnion,
  asObject,
  asUnion,
  reworded,
  textBetween,
  textFrom,
} from "../../../../../src/game/services/storyTextRewrite/common.js";

describe("textFrom and textBetween", () => {
  const text = "intro. STATE one. MIDDLE two. STATE again. END";

  it("take the first occurrences", () => {
    expect(textFrom(text, "STATE", "state")).toBe("STATE one. MIDDLE two. STATE again. END");
    expect(textBetween(text, "STATE", "MIDDLE", "slice")).toBe(" one. ");
  });

  it("throw with the name when an anchor is missing", () => {
    expect(() => textFrom(text, "NOWHERE", "the marker")).toThrow("the marker");
    expect(() => textBetween(text, "STATE", "NOWHERE", "the slice")).toThrow("the slice");
    expect(() => textBetween(text, "NOWHERE", "END", "the slice")).toThrow("the slice");
  });

  it("throws when the end anchor comes before the start anchor", () => {
    expect(() => textBetween(text, "MIDDLE", "STATE", "backwards")).toThrow("backwards");
  });
});

describe("schema guards", () => {
  const object = z.object({ a: z.string() });

  it("pass the schema through when it has the kind, and throw with the label otherwise", () => {
    expect(asObject(object, "root")).toBe(object);
    const array = z.array(object);
    expect(asArray(array, "list")).toBe(array);
    const union = z.union([z.string(), object]);
    expect(asUnion(union, "either")).toBe(union);
    const tagged = z.discriminatedUnion("kind", [z.object({ kind: z.literal("a") }), z.object({ kind: z.literal("b") })]);
    expect(asDiscriminatedUnion(tagged, "tagged")).toBe(tagged);
    expect(() => asObject(array, "the root")).toThrow("the root");
    expect(() => asArray(object, "the list")).toThrow("the list");
    expect(() => asUnion(object, "the union")).toThrow("the union");
    expect(() => asDiscriminatedUnion(union, "the tagged union")).toThrow("the tagged union");
  });

  it("rewords a description exactly once, and throws when the text is not there once", () => {
    const described = z.string().describe("Keep this. Drop this. Keep that.");
    expect(reworded(described, " Drop this.", "").description).toBe("Keep this. Keep that.");
    expect(() => reworded(described, "Nowhere.", "")).toThrow("Nowhere.");
    expect(() => reworded(described, "Keep th", "")).toThrow("Keep th");
  });
});
