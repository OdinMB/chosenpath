import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type { Change } from "core/types/index.js";
import type { OutcomeState } from "core/utils/outcomeStates.js";

/*
 * A player's state at the end tells where each outcome ended from the
 * milestones recorded (ClientStateManager's outcomesAtEnd), adding none. That
 * holds only if the first story at the ending that is stored and sent already
 * has the ending's milestones: handleProgression writes the ending and applies
 * its changes before it returns the story the queue stores and broadcasts
 * (GameQueueProcessor.handleMoveStoryForward). The model is replaced by a
 * generator that writes the ending's one milestone, as the beat repairs leave
 * it (one per thread of the chapter that just ended).
 */

type Generate = (story: Story, ...rest: unknown[]) => Promise<[Story, Change[], unknown[]]>;
const generateBeats = jest.fn<Generate>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("../../../../src/game/services/AIStoryGenerator.js", () => ({
  __esModule: true,
  AIStoryGenerator: class {
    generateBeats = generateBeats;
    generateSwitches = jest.fn();
    generateThreads = jest.fn();
  },
}));
await mockModule("../../../../src/images/AIImageGenerator.js", () => ({
  __esModule: true,
  AIImageGenerator: class {},
}));
await mockModule("../../../../src/game/services/PregenerationService.js", () => ({
  __esModule: true,
  pregenerationService: {
    cancelPregenerationForTurn: jest.fn(async () => undefined),
    getPregeneratedStory: jest.fn(async () => null),
  },
}));
await mockModule("../../../../src/stories/StoryDbService.js", () => ({
  __esModule: true,
  storyDbService: {
    updateStoryBeatAndTimestamp: jest.fn(async () => undefined),
    setAllPlayersPending: jest.fn(async () => undefined),
  },
}));

const { storyProgressionService } = await import("../../../../src/game/services/StoryProgressionService.js");
const { outcomeStatesAtEnding } = await import("../../../../src/game/services/endingStates.js");
const { endedChapter, outcome, roundStory, topicSwitch } = await import("../../../helpers/roundStories.js");
const { createMockBeat } = await import("../../../helpers/testHelpers.js");

const RING = "player1_ring";
const ENDING_MILESTONE = "The exposé runs on every front page.";

/**
 * The story as stored after the player's last choice: seven beats of a
 * seven-turn story, the last chapter (on RING) waiting for its last step to
 * be resolved, RING one milestone of two along.
 */
function storedAfterLastChoice(): Story {
  const last = endedChapter(RING, 3, 4, "The exposé");
  const unresolved = {
    ...last,
    threads: last.threads.map((thread) => ({
      ...thread,
      progression: thread.progression.map((step, i) => (i === 2 ? { ...step, resolution: null } : step)),
      resolution: null,
      milestone: null,
    })),
  };
  const story = roundStory({
    turns: 7,
    maxTurns: 7,
    playerOutcomes: { player1: [outcome(RING, { intendedNumberOfMilestones: 2, milestones: ["The ledger"] })] },
    phases: [topicSwitch([["Dig", RING]], 0), endedChapter(RING, 2, 1, "The ledger"), topicSwitch([["Dig", RING]], 3), unresolved],
  });
  const player = story.getPlayer("player1")!;
  const beatHistory = player.beatHistory.map((beat, i) =>
    i === player.beatHistory.length - 1 ? { ...beat, resolution: "favorable" as const } : beat
  );
  return story.updatePlayers({ player1: { ...player, beatHistory } });
}

describe("StoryProgressionService.handleProgression: the ending", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    generateBeats.mockReset();
  });

  it("returns the story at its ending with the ending's milestones recorded, so its first state at the end counts them once", async () => {
    const stored = storedAfterLastChoice();
    expect(stored.filterStateForPlayer("player1").gameOver).toBe(false);

    let told: OutcomeState[] = [];
    generateBeats.mockImplementation(async (story) => {
      // The ending is written from the story at its ending, its milestones not yet recorded
      told = outcomeStatesAtEnding(story);
      const ending = story.addBeatToPlayer("player1", createMockBeat({ title: "The End", options: [] }));
      const milestone: Change = { type: "newMilestone", outcomeGroup: "player1", outcome: RING, newMilestone: ENDING_MILESTONE };
      return [ending, [milestone], []];
    });

    const { finalStory } = await storyProgressionService.handleProgression("game-1", stored);
    const state = finalStory.filterStateForPlayer("player1");

    expect(generateBeats).toHaveBeenCalledTimes(1);
    expect(told).toEqual([{ id: RING, owner: "player1", milestones: 2, intended: 2, complete: true }]);
    expect(state.gameOver).toBe(true);
    expect(state.outcomesAtEnd).toEqual([
      {
        id: RING,
        owner: "player1",
        question: `Question of ${RING}?`,
        milestones: ["The ledger", ENDING_MILESTONE],
        intended: 2,
        complete: true,
      },
    ]);
  });
});
