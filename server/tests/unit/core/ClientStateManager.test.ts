import { ClientStateManager } from "core/models/ClientStateManager.js";
import { AI_TEXT_PROVENANCE } from "core/types/index.js";
import { createMockStoryState } from "../../helpers/testHelpers.js";

const manager = new ClientStateManager();

function filtered(overrides: Parameters<typeof createMockStoryState>[0] = {}) {
  return manager.filterStateForPlayer(
    createMockStoryState(overrides),
    "player1",
    "thread",
    [],
    []
  );
}

describe("ClientStateManager.filterStateForPlayer", () => {
  it("sends the failed image ids, so the reader can hide those slots", () => {
    expect(filtered({ failedImageIds: ["harbour"] }).failedImageIds).toEqual([
      "harbour",
    ]);
    expect(filtered().failedImageIds).toEqual([]);
  });

  it("marks the story text it sends as AI-generated", () => {
    expect(filtered().provenance).toEqual(AI_TEXT_PROVENANCE);
    expect(filtered().provenance?.aiGenerated).toBe(true);
  });

  it("sends the story category", () => {
    expect(filtered({ category: "read-with-kids" }).category).toBe(
      "read-with-kids"
    );
  });
});
