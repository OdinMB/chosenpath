import type { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { storyLastPlayed } from "../../../src/shared/utils/storyLastPlayed";

/*
 * When a story was last played, as a story card says it: the latest time any
 * seat played, whoever holds the seat; "never" only when no seat has played
 * and no turn has been written.
 */

function seat(
  playerSlot: string,
  lastPlayedAt: number | null,
  overrides: Partial<StoryPlayerEntry> = {}
): StoryPlayerEntry {
  return {
    storyId: "s1",
    playerSlot,
    userId: null,
    lastPlayedAt,
    isCurrentUser: false,
    status: "active",
    ...overrides,
  };
}

function story(
  players: StoryPlayerEntry[],
  currentBeat?: number
): Pick<ExtendedStoryMetadata, "players" | "currentBeat"> {
  return { players, currentBeat };
}

describe("storyLastPlayed", () => {
  it("is the latest time any seat played, though the viewer holds none of them", () => {
    const result = storyLastPlayed(
      story([seat("player1", 1_000), seat("player2", 3_000), seat("player3", 2_000)], 9)
    );

    expect(result).toEqual({ kind: "played", at: 3_000 });
  });

  it("counts another seat's later play over the viewer's own", () => {
    const result = storyLastPlayed(
      story(
        [
          seat("player1", 1_000, { isCurrentUser: true, userId: "u1" }),
          seat("player2", 5_000),
        ],
        2
      )
    );

    expect(result).toEqual({ kind: "played", at: 5_000 });
  });

  it("counts a seat that played before it left the story", () => {
    const result = storyLastPlayed(
      story([seat("player1", null), seat("player2", 4_000, { status: "deleted" })], 3)
    );

    expect(result).toEqual({ kind: "played", at: 4_000 });
  });

  it("counts a seat that picked its character before the first turn", () => {
    const result = storyLastPlayed(story([seat("player1", 2_000), seat("player2", null)], 0));

    expect(result).toEqual({ kind: "played", at: 2_000 });
  });

  it("is never when no seat has played and no turn was written", () => {
    expect(storyLastPlayed(story([seat("player1", null), seat("player2", null)], 0))).toEqual({
      kind: "never",
    });
    expect(storyLastPlayed(story([seat("player1", null)]))).toEqual({ kind: "never" });
    expect(storyLastPlayed(story([], 0))).toEqual({ kind: "never" });
  });

  it("is unknown, not never, when a turn was written but no seat has a time", () => {
    expect(storyLastPlayed(story([seat("player1", null), seat("player2", null)], 4))).toEqual({
      kind: "unknown",
    });
  });
});
