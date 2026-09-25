import { GameModes } from "core/types";
import type { ClientStoryState, PlayerState } from "core/types";
import {
  createImageFromPlaceholder,
  isFailedStoryImage,
} from "../../../src/shared/utils/imageUtils";
import { processStoryText } from "../../../src/game/utils/storyTextProcessor";

function player(identityChoice: number): PlayerState {
  return {
    name: "Suzie",
    pronouns: {
      personal: "she",
      object: "her",
      possessive: "her",
      reflexive: "herself",
    },
    appearance: "",
    fluff: "",
    outcomes: [],
    statValues: [],
    knownStoryElements: [],
    beatHistory: [],
    previousTypesOfThreads: [],
    identityChoice,
    backgroundChoice: 0,
  };
}

function storyState(failedImageIds: string[]): ClientStoryState {
  return {
    id: "story-1",
    title: "A story",
    gameMode: GameModes.SinglePlayer,
    difficultyLevel: { title: "Balanced", modifier: 0 },
    sharedStats: [],
    sharedStatValues: [],
    playerStats: [],
    players: { player1: player(2) },
    maxTurns: 10,
    characterSelectionCompleted: true,
    characterSelectionOptions: {},
    characterSelectionIntroduction: { title: "", text: "" },
    generateImages: true,
    images: [],
    failedImageIds,
    pendingPlayers: [],
    gameOver: false,
  };
}

describe("isFailedStoryImage", () => {
  it("is true only for ids the server recorded as failed", () => {
    const state = storyState(["harbour"]);

    expect(isFailedStoryImage(state, "harbour")).toBe(true);
    expect(isFailedStoryImage(state, "lighthouse")).toBe(false);
    expect(isFailedStoryImage({}, "harbour")).toBe(false);
  });
});

describe("createImageFromPlaceholder", () => {
  it("returns no image for a story image whose generation failed", () => {
    const state = storyState(["harbour"]);

    expect(
      createImageFromPlaceholder({ id: "harbour", source: "story" }, state)
    ).toBeNull();
    expect(
      createImageFromPlaceholder({ id: "lighthouse", source: "story" }, state)
    ).not.toBeNull();
  });

  it("returns no image for a player portrait whose generation failed", () => {
    // player1 chose identity 2, so the portrait's id is player1_2
    expect(
      createImageFromPlaceholder(
        { id: "player1", source: "story" },
        storyState(["player1_2"])
      )
    ).toBeNull();
    expect(
      createImageFromPlaceholder(
        { id: "player1", source: "story" },
        storyState(["player1_0"])
      )
    ).not.toBeNull();
  });

  it("keeps template images with the same id as a failed story image", () => {
    const state = { ...storyState(["cover"]), templateId: "template-1" };

    expect(
      createImageFromPlaceholder({ id: "cover", source: "template" }, state)
    ).not.toBeNull();
  });
});

describe("processStoryText with a failed image", () => {
  it("keeps the beat text and drops the failed image's slot", () => {
    const text =
      'The harbour wakes up. [image id=harbour source=story desc="The harbour"]\n\nBoats leave.';

    const segments = processStoryText(text, storyState(["harbour"]));

    expect(segments.every((segment) => segment.type === "text")).toBe(true);
    const joined = segments.map((segment) => segment.content).join("");
    expect(joined).toContain("The harbour wakes up.");
    expect(joined).toContain("Boats leave.");
    expect(joined).not.toContain("[image");
  });
});
