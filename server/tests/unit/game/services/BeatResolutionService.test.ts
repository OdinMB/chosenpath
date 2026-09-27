import { jest } from "@jest/globals";
import type { Beat, ChallengeOption } from "core/types/index.js";
import { BeatResolutionService } from "../../../../src/game/services/BeatResolutionService.js";
import { createMockStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, challengeOptions, stat } from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function storyWithCurrentBeat(beat: Beat) {
  const base = createMockStory().getState();
  return createMockStory({
    players: { player1: { ...base.players.player1, beatHistory: [beat] } },
  });
}

describe("BeatResolutionService.resolveChoice", () => {
  const difficulty = { title: "Balanced", modifier: 0 };

  it("maps an exploration option to its resolution without a roll", () => {
    const story = storyWithCurrentBeat({ ...beatGeneration(), choice: 2, resolution: null });
    const resolved = BeatResolutionService.resolveChoice(story, "player1", 2, difficulty);
    const beat = resolved.getCurrentBeat("player1");
    expect(beat?.resolution).toBe("resolution3");
    expect(beat?.resolutionDetails).toBeUndefined();
  });

  it("rolls a challenge option and stores the roll's details", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99);
    const story = storyWithCurrentBeat({
      ...beatGeneration({ options: challengeOptions() }),
      choice: 1,
      resolution: null,
    });
    const resolved = BeatResolutionService.resolveChoice(story, "player1", 1, difficulty);
    const beat = resolved.getCurrentBeat("player1");
    expect(beat?.resolution).toBe("unfavorable");
    expect(beat?.resolutionDetails?.roll).toBeCloseTo(99);
  });
});

describe("BeatResolutionService stat bonuses", () => {
  const statsStory = () =>
    createMockStory({
      playerStats: [
        stat("player_charm", { name: "Charm" }),
        stat("player_wit", { name: "Wit" }),
        stat("player_grit", { name: "Grit" }),
      ],
    });

  function optionWith(modifiers: ChallengeOption["modifiersToSuccessRate"]): ChallengeOption {
    return { ...challengeOptions()[0], basePoints: -5, modifiersToSuccessRate: modifiers };
  }

  const outOfRange = optionWith([
    { statId: "player1_charm", reason: "charming", effect: 20 },
    { statId: "player_wit", reason: "slow", effect: -30 },
    { statId: "player_grit", reason: "tough", effect: 5 },
  ]);

  it("clamps each bonus to +/-15 and counts only the first two", () => {
    const readable: Array<{ name: string; value: number; tooltip?: string }> = [];
    const points = BeatResolutionService.calculateTotalPoints(outOfRange, readable, statsStory());
    expect(points).toBe(-5 + 15 - 15);
    expect(readable.map(({ name, value }) => ({ name, value }))).toEqual([
      { name: "Choice", value: -5 },
      { name: "Charm", value: 15 },
      { name: "Wit", value: -15 },
    ]);
  });

  it("leaves bonuses within the range as written", () => {
    const readable: Array<{ name: string; value: number; tooltip?: string }> = [];
    const option = optionWith([
      { statId: "player_charm", reason: "charming", effect: 15 },
      { statId: "player_wit", reason: "slow", effect: -10 },
    ]);
    expect(BeatResolutionService.calculateTotalPoints(option, readable, statsStory())).toBe(-5 + 15 - 10);
    expect(readable.map((m) => m.value)).toEqual([-5, 15, -10]);
  });

  it("shows the clamped bonuses in the roll's point breakdown", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.5);
    const base = statsStory();
    const story = createMockStory({
      ...base.getState(),
      players: {
        player1: {
          ...base.getState().players.player1,
          beatHistory: [{ ...beatGeneration({ options: [outOfRange] }), choice: 0, resolution: null }],
        },
      },
    });
    const resolved = BeatResolutionService.resolveChoice(story, "player1", 0, { title: "Balanced", modifier: 0 });
    const details = resolved.getCurrentBeat("player1")?.resolutionDetails;
    expect(details?.points).toBe(-5);
    expect(details?.readablePointModifiers?.map((m) => m.value)).toEqual([-5, 15, -15]);
  });
});
