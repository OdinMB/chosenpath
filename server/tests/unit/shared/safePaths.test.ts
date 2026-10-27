import { describe, expect, it } from "@jest/globals";
import { isUuid, validateSafePaths } from "../../../src/shared/safePaths.js";

describe("isUuid", () => {
  it("accepts a UUID, the form a World's id takes", () => {
    expect(isUuid("6f1c2e8a-3b4d-4c5e-9f60-718293a4b5c6")).toBe(true);
  });

  it.each([
    ["a parent path", "../../escape"],
    ["a UUID with a parent step", "6f1c2e8a-3b4d-4c5e-9f60-718293a4b5c6/../x"],
    ["a plain name", "images"],
    ["an empty string", ""],
    ["a number", 7],
    ["an object", {}],
    ["a missing value", undefined],
  ])("refuses %s", (_what, value) => {
    expect(isUuid(value)).toBe(false);
  });
});

describe("validateSafePaths", () => {
  it("accepts ids and relative paths that stay where they are joined", () => {
    expect(validateSafePaths("world-1", "harbour_master", "players/player1_0.jpeg")).toBe(true);
  });

  it.each([
    ["a parent step", "../stories/x"],
    ["a parent step inside", "images/../../x"],
    ["a backslash", "images\\x"],
    ["an absolute path", "/etc/x"],
    ["an empty string", ""],
    ["a number", 7],
    ["a missing value", undefined],
  ])("refuses %s", (_what, unsafe) => {
    expect(validateSafePaths("world-1", unsafe)).toBe(false);
  });
});
