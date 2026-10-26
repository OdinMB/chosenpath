import {
  CODE_CHECK_FAILED,
  CODE_FORMAT_PROBLEM,
  CODE_NOT_FOUND,
  isStoryCodeFormat,
  joinByCode,
} from "../../../src/page/utils/joinByCode";

/*
 * The home page's join form, as Page.tsx hands it a submitted code: an
 * existing code opens its game page, any other gives the line under the field.
 */

describe("joinByCode", () => {
  it("opens the game page of a code the server knows", async () => {
    const check = jest.fn().mockResolvedValue(true);

    await expect(joinByCode(" AB12CD ", check)).resolves.toEqual({
      kind: "open",
      path: "/game/AB12CD",
    });
    expect(check).toHaveBeenCalledWith("AB12CD");
  });

  it("stays on the page with a line when the code names no story", async () => {
    const check = jest.fn().mockResolvedValue(false);

    await expect(joinByCode("AB12CD", check)).resolves.toEqual({
      kind: "problem",
      message: CODE_NOT_FOUND,
    });
  });

  it("never sends a malformed or empty code", async () => {
    const check = jest.fn().mockResolvedValue(true);

    await expect(joinByCode("ab12cd", check)).resolves.toEqual({
      kind: "problem",
      message: CODE_FORMAT_PROBLEM,
    });
    await expect(joinByCode("AB12C", check)).resolves.toEqual({
      kind: "problem",
      message: CODE_FORMAT_PROBLEM,
    });
    await expect(joinByCode("   ", check)).resolves.toEqual({ kind: "empty" });
    expect(check).not.toHaveBeenCalled();
  });

  it("reads a failed check (a limit, an outage) as one, without opening the game", async () => {
    const check = jest.fn().mockRejectedValue(new Error("429"));

    await expect(joinByCode("AB12CD", check)).resolves.toEqual({
      kind: "problem",
      message: CODE_CHECK_FAILED,
    });
  });
});

describe("isStoryCodeFormat", () => {
  it("accepts exactly six capital letters or digits", () => {
    expect(isStoryCodeFormat("AB12CD")).toBe(true);
    expect(isStoryCodeFormat(" AB12CD ")).toBe(true);
    expect(isStoryCodeFormat("AB12C")).toBe(false);
    expect(isStoryCodeFormat("AB12CDE")).toBe(false);
    expect(isStoryCodeFormat("AB-2CD")).toBe(false);
  });
});
