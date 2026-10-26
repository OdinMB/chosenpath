import type { ExtendedStoryMetadata, StoryPlayerEntry } from "core/types/api";
import { seatCardsFor } from "../../../src/users/stories/seatCards";

/*
 * A class's seat cards: one per student, for the stories the teacher picked,
 * with the groups numbered in the order the stories were started.
 */

jest.mock("../../../src/shared/utils/codeSetUtils", () => ({
  generateJoinLink: (code: string) => `https://join.example/game/${code}`,
}));

function seat(storyId: string, playerSlot: string, code?: string): StoryPlayerEntry {
  return {
    storyId,
    playerSlot,
    code,
    userId: null,
    lastPlayedAt: null,
    isPending: false,
    isCurrentUser: false,
    status: "active",
  };
}

function story(
  id: string,
  createdAt: number,
  players: StoryPlayerEntry[]
): ExtendedStoryMetadata {
  return {
    id,
    title: `Story ${id}`,
    difficultyLevel: { modifier: 0, title: "Normal" },
    createdAt,
    updatedAt: createdAt,
    maxTurns: 10,
    generateImages: false,
    creatorId: "teacher-1",
    currentBeat: 0,
    players,
  };
}

// As the feed returns them: newest first
const STORIES = [
  story("c", 3000, [seat("c", "player1", "CCC111")]),
  story("a", 1000, [
    seat("a", "player2", "AAA222"),
    seat("a", "player1", "AAA111"),
    seat("a", "player3"),
  ]),
  story("b", 2000, [seat("b", "player1", "BBB111"), seat("b", "player2", "BBB222")]),
];

describe("seatCardsFor", () => {
  it("numbers the selected stories' groups in the order they were started", () => {
    const cards = seatCardsFor(STORIES, new Set(["a", "b", "c"]));

    expect(cards.map((card) => [card.groupNumber, card.storyId, card.code])).toEqual([
      [1, "a", "AAA111"],
      [1, "a", "AAA222"],
      [2, "b", "BBB111"],
      [2, "b", "BBB222"],
      [3, "c", "CCC111"],
    ]);
  });

  it("leaves out the stories not selected and numbers the rest from 1", () => {
    const cards = seatCardsFor(STORIES, new Set(["c", "b"]));

    expect(cards.map((card) => [card.groupNumber, card.storyId])).toEqual([
      [1, "b"],
      [1, "b"],
      [2, "c"],
    ]);
    expect(seatCardsFor(STORIES, new Set())).toEqual([]);
  });

  it("makes one card per seat with a code, skipping seats without one", () => {
    const cards = seatCardsFor(STORIES, new Set(["a"]));

    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.code)).not.toContain(undefined);
  });

  it("carries the story's title and the join link of the seat's code", () => {
    const [card] = seatCardsFor(STORIES, new Set(["c"]));

    expect(card).toEqual({
      storyId: "c",
      storyTitle: "Story c",
      groupNumber: 1,
      code: "CCC111",
      joinLink: "https://join.example/game/CCC111",
    });
  });

  it("orders seats as player1, player2, …, player10", () => {
    const players = [10, 2, 1].map((n) => seat("d", `player${n}`, `D${n}`));

    const cards = seatCardsFor([story("d", 1, players)], new Set(["d"]));

    expect(cards.map((card) => card.code)).toEqual(["D1", "D2", "D10"]);
  });
});
