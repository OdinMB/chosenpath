import { describe, expect, it } from "@jest/globals";
import { validateSafePaths } from "../../../src/shared/safePaths.js";

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
