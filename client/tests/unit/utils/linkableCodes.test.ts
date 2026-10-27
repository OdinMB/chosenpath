import type { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { linkableCodes } from "../../../src/shared/utils/linkableCodes";

/*
 * The seat codes a story card's "Link to my account" would link to the
 * signed-in account: codes stored on this device for active seats not yet
 * linked to it, never a seat started for other players to play. Those are the
 * codes marked when "Start several stories at once" stored them, and, for
 * codes stored before such marks, every seat of a story the account started
 * and holds no seat in.
 */

const ME = "user-me";

function seat(
  playerSlot: string,
  overrides: Partial<StoryPlayerEntry> = {}
): StoryPlayerEntry {
  return {
    storyId: "s1",
    playerSlot,
    code: `${playerSlot.toUpperCase()}-CODE`,
    userId: null,
    lastPlayedAt: null,
    isPending: true,
    isCurrentUser: false,
    status: "active",
    ...overrides,
  };
}

function story(
  creatorId: string | null,
  players: StoryPlayerEntry[]
): ExtendedStoryMetadata {
  return {
    id: "s1",
    title: "The Lighthouse",
    difficultyLevel: { modifier: 0, title: "Normal" },
    createdAt: 1,
    updatedAt: 2,
    maxTurns: 5,
    generateImages: false,
    creatorId,
    currentBeat: 0,
    players,
  };
}

const ALL_STORED = ["PLAYER1-CODE", "PLAYER2-CODE", "PLAYER3-CODE"];

describe("linkableCodes", () => {
  it("offers the stored codes of active seats not linked to the account", () => {
    const anonymous = story(null, [seat("player1"), seat("player2")]);

    expect(linkableCodes(anonymous, ME, ALL_STORED, [])).toEqual([
      "PLAYER1-CODE",
      "PLAYER2-CODE",
    ]);
  });

  it("leaves out seats linked to the account, seats not active and codes not stored here", () => {
    const joined = story("someone-else", [
      seat("player1", { userId: ME, isCurrentUser: true }),
      seat("player2", { status: "archived" }),
      seat("player3"),
      seat("player4"),
    ]);

    expect(linkableCodes(joined, ME, ALL_STORED, [])).toEqual(["PLAYER3-CODE"]);
  });

  it("never offers a code marked as started for other players", () => {
    const started = story(ME, [
      seat("player1", { userId: ME, isCurrentUser: true }),
      seat("player2"),
      seat("player3"),
    ]);

    expect(
      linkableCodes(started, ME, ALL_STORED, ["PLAYER2-CODE", "PLAYER3-CODE"])
    ).toEqual([]);
  });

  it("offers nothing on a story the account started and holds no seat in", () => {
    // Codes a several-stories start stored before the marks existed
    const startedForOthers = story(ME, [
      seat("player1"),
      seat("player2", { userId: "a-player" }),
      seat("player3"),
    ]);

    expect(linkableCodes(startedForOthers, ME, ALL_STORED, [])).toEqual([]);
  });

  it("offers the other stored seats of a story the account started and plays in, as before", () => {
    const playing = story(ME, [
      seat("player1", { userId: ME, isCurrentUser: true }),
      seat("player2"),
    ]);

    expect(linkableCodes(playing, ME, ALL_STORED, [])).toEqual(["PLAYER2-CODE"]);
  });

  it("offers the stored seats of a story another account started", () => {
    const theirs = story("someone-else", [seat("player1"), seat("player2")]);

    expect(linkableCodes(theirs, ME, ["PLAYER2-CODE"], [])).toEqual([
      "PLAYER2-CODE",
    ]);
  });
});
