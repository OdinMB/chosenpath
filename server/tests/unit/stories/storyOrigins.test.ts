import { afterEach, describe, expect, it, jest } from "@jest/globals";

/*
 * A story's origin is looked up once and remembered, so choices and AI calls
 * don't each query the database. A remembered answer may never make a story
 * look account-started once it isn't: a deleted account's stories are
 * anonymous from then on.
 */

const getStoryCreatorId = jest.fn<(storyId: string) => Promise<string | null | undefined>>();

jest.unstable_mockModule("../../../src/stories/StoryDbService.js", () => ({
  storyDbService: { getStoryCreatorId },
}));

const { forgetAllStoryOrigins, forgetStoriesOfCreator, storyOrigin } = await import(
  "../../../src/stories/storyOrigins.js"
);

const NOW = Date.parse("2026-10-26T12:00:00Z");
const TEN_MINUTES = 10 * 60 * 1000;

afterEach(() => {
  forgetAllStoryOrigins();
  getStoryCreatorId.mockReset();
});

describe("storyOrigin", () => {
  it("reads a story started from an account as account, and one without as anonymous", async () => {
    getStoryCreatorId.mockImplementation(async (storyId) =>
      storyId === "class-story" ? "teacher-1" : null
    );

    await expect(storyOrigin("class-story", NOW)).resolves.toBe("account");
    await expect(storyOrigin("guest-story", NOW)).resolves.toBe("anonymous");
  });

  it("asks the database once per story, however many choices come in at once", async () => {
    getStoryCreatorId.mockResolvedValue("teacher-1");

    const origins = await Promise.all(
      Array.from({ length: 20 }, () => storyOrigin("class-story", NOW))
    );
    await storyOrigin("class-story", NOW + 60_000);

    expect(new Set(origins)).toEqual(new Set(["account"]));
    expect(getStoryCreatorId).toHaveBeenCalledTimes(1);
  });

  it("asks again once the remembered answer is ten minutes old", async () => {
    getStoryCreatorId.mockResolvedValueOnce("teacher-1").mockResolvedValueOnce(null);

    await storyOrigin("class-story", NOW);

    await expect(storyOrigin("class-story", NOW + TEN_MINUTES)).resolves.toBe("anonymous");
    expect(getStoryCreatorId).toHaveBeenCalledTimes(2);
  });

  it("reads a story without a row as anonymous and doesn't remember it", async () => {
    getStoryCreatorId.mockResolvedValueOnce(undefined).mockResolvedValueOnce("teacher-1");

    await expect(storyOrigin("new-story", NOW)).resolves.toBe("anonymous");
    await expect(storyOrigin("new-story", NOW)).resolves.toBe("account");
  });

  it("rejects when the lookup fails, and asks again next time", async () => {
    getStoryCreatorId
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(null);

    await expect(storyOrigin("guest-story", NOW)).rejects.toThrow("connection refused");
    await expect(storyOrigin("guest-story", NOW)).resolves.toBe("anonymous");
  });
});

describe("forgetStoriesOfCreator", () => {
  it("makes a deleted account's stories anonymous at once", async () => {
    getStoryCreatorId.mockResolvedValueOnce("teacher-1").mockResolvedValueOnce(null);
    await storyOrigin("class-story", NOW);

    forgetStoriesOfCreator("teacher-1");

    await expect(storyOrigin("class-story", NOW)).resolves.toBe("anonymous");
  });

  it("drops a lookup still running, which may have read the creator before the deletion", async () => {
    let answer: (creatorId: string | null) => void = () => undefined;
    getStoryCreatorId
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(null);
    const running = storyOrigin("class-story", NOW);

    forgetStoriesOfCreator("teacher-1");
    answer("teacher-1");
    await running;

    await expect(storyOrigin("class-story", NOW)).resolves.toBe("anonymous");
  });

  it("keeps other accounts' stories", async () => {
    getStoryCreatorId.mockResolvedValue("teacher-2");
    await storyOrigin("other-class", NOW);

    forgetStoriesOfCreator("teacher-1");
    await storyOrigin("other-class", NOW);

    expect(getStoryCreatorId).toHaveBeenCalledTimes(1);
  });
});
