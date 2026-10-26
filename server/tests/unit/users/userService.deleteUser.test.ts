import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/*
 * Deleting an account makes its stories anonymous (creator_id ON DELETE SET
 * NULL), so their remembered origin has to go with it: otherwise their
 * choices would keep the account's allowance.
 */

const findUserById = jest.fn<(userId: string) => Promise<{ id: string; username: string } | null>>();
const deleteUserEntryById = jest.fn<(userId: string) => Promise<boolean>>();
const forgetStoriesOfCreator = jest.fn<(userId: string) => void>();

jest.unstable_mockModule("../../../src/users/UserDbService.js", () => ({
  userDbService: { findUserById, deleteUserEntryById },
}));
jest.unstable_mockModule("../../../src/stories/storyOrigins.js", () => ({
  forgetStoriesOfCreator,
}));

const { deleteUserById } = await import("../../../src/users/userService.js");

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
  findUserById.mockResolvedValue({ id: "teacher-1", username: "teacher" });
});

afterEach(() => {
  jest.restoreAllMocks();
  findUserById.mockReset();
  deleteUserEntryById.mockReset();
  forgetStoriesOfCreator.mockReset();
});

describe("deleteUserById", () => {
  it("forgets the deleted account's story origins", async () => {
    deleteUserEntryById.mockResolvedValue(true);

    await expect(deleteUserById("teacher-1")).resolves.toBe(true);

    expect(forgetStoriesOfCreator).toHaveBeenCalledWith("teacher-1");
  });

  it("keeps them when nothing was deleted", async () => {
    deleteUserEntryById.mockResolvedValue(false);

    await deleteUserById("teacher-1");

    expect(forgetStoriesOfCreator).not.toHaveBeenCalled();
  });
});
