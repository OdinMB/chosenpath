import { jest } from "@jest/globals";
import type { Beat } from "core/types/index.js";
import { BeatResolutionService } from "../../../../src/game/services/BeatResolutionService.js";
import { createMockStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, challengeOptions } from "../../../helpers/textFixtures.js";

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
