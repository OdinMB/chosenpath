import { GameModes } from "core/types";
import {
  gameModeDescription,
  THREE_PLAYER_CONTEST,
} from "../../../src/page/data/gameModeDescriptions";

const COOPERATIVE =
  "Players work together toward a shared goal and never compete against each other.";
const MIXED =
  "Players work together toward a shared goal and also compete against each other for a prize.";
const COMPETITIVE = "Players compete against each other for a prize.";
const THREE_PLAYERS =
  "With three players, a contest still has only two sides, so when all three compete, it is two against one.";

describe("gameModeDescription", () => {
  it.each([
    [GameModes.Cooperative, COOPERATIVE],
    [GameModes.CooperativeCompetitive, MIXED],
    [GameModes.Competitive, COMPETITIVE],
  ])("says what %s means for two players", (mode, line) => {
    expect(gameModeDescription(mode, 2)).toBe(line);
  });

  // A contest has two sides, so one all three players are in is two against one
  it.each([
    [GameModes.CooperativeCompetitive, MIXED],
    [GameModes.Competitive, COMPETITIVE],
  ])("says a contest of three players is two against one (%s)", (mode, line) => {
    expect(THREE_PLAYER_CONTEST).toBe(THREE_PLAYERS);
    expect(gameModeDescription(mode, 3)).toBe(`${line} ${THREE_PLAYERS}`);
  });

  it("adds nothing about camps where no one competes", () => {
    expect(gameModeDescription(GameModes.Cooperative, 3)).toBe(COOPERATIVE);
  });

  it("has no line for one player, who has no game mode to choose", () => {
    expect(gameModeDescription(GameModes.Competitive, 1)).toBeUndefined();
  });

  it("has no line for the single-player mode a link can carry with more players", () => {
    expect(gameModeDescription(GameModes.SinglePlayer, 2)).toBeUndefined();
  });
});
