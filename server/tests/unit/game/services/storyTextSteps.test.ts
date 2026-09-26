import { jest } from "@jest/globals";
import { z } from "zod";
import type { Beat, Change } from "core/types/index.js";
import {
  analysisBefore,
  beatStep,
  partialTemplateSchema,
  switchStep,
  threadStep,
} from "../../../../src/game/services/storyTextSteps.js";
import { createMockMultiplayerStory, createMockStory } from "../../../helpers/testHelpers.js";
import {
  beatGeneration,
  beatSet,
  switchAnalysis,
  threadAnalysis,
} from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function playedBeat(resolution: Beat["resolution"] = "resolution1"): Beat {
  return { ...beatGeneration(), choice: 0, resolution };
}

function storyWithBeats(beats: number, overrides = {}) {
  const base = createMockStory(overrides).getState();
  return createMockStory({
    ...overrides,
    players: {
      player1: { ...base.players.player1, beatHistory: Array.from({ length: beats }, () => playedBeat()) },
    },
  });
}

function shapeOf(story: ReturnType<typeof createMockStory>) {
  return beatStep.request(story).schema.shape;
}

describe("beatStep.request schema flags", () => {
  it("allows milestones on a switch after the first beat, not on the first switch", () => {
    const firstSwitch = createMockStory({ storyPhases: [switchAnalysis(["player1"])] });
    expect(shapeOf(firstSwitch).newMilestones).toBeInstanceOf(z.ZodLiteral);

    const laterSwitch = storyWithBeats(3, { storyPhases: [switchAnalysis(["player1"], 3)] });
    expect(shapeOf(laterSwitch).newMilestones).toBeInstanceOf(z.ZodArray);
  });

  it("allows milestones on the ending", () => {
    const resolved = threadAnalysis("exploration", 2, 1);
    resolved.threads[0].progression.forEach((step) => (step.resolution = "resolution1"));
    const ending = storyWithBeats(3, { maxTurns: 3, storyPhases: [resolved] });
    expect(ending.getCurrentBeatType()).toBe("ending");
    expect(shapeOf(ending).newMilestones).toBeInstanceOf(z.ZodArray);
  });

  it("asks for multiplayer coordination only in multiplayer games", () => {
    expect(shapeOf(createMockStory()).multiplayerCoordination).toBeInstanceOf(z.ZodLiteral);
    expect(shapeOf(createMockMultiplayerStory(2)).multiplayerCoordination).toBeInstanceOf(
      z.ZodString
    );
  });

  it("adds an image request field only when the story generates images", () => {
    const beatShape = (generateImages: boolean) => {
      const player = Object.entries(shapeOf(createMockStory({ generateImages }))).find(
        ([key]) => key === "player1"
      )?.[1];
      return player instanceof z.ZodObject ? Object.keys(player.shape) : [];
    };
    expect(beatShape(true)).toContain("imageRequest");
    expect(beatShape(false)).not.toContain("imageRequest");
  });
});

describe("beatStep.apply", () => {
  it("adds the new beat and merges stat changes, milestones, facts, elements and introductions", () => {
    const story = createMockStory({ generateImages: true });
    const statChange: Change = {
      type: "statChange",
      group: "shared",
      stat: "gold",
      change: "addNumber",
      value: 5,
    };
    const milestone: Change = {
      type: "newMilestone",
      outcomeGroup: "player1",
      outcome: "o1",
      newMilestone: "m",
    };
    const fact: Change = { type: "newFact", storyElementId: "world", fact: "f" };
    const intro: Change = {
      type: "addIntroductionOfStoryElement",
      player: "player1",
      storyElementId: "inn",
    };
    const element: Change = {
      type: "newStoryElement",
      element: {
        id: "inn",
        name: "Inn",
        role: "location",
        instructions: "",
        appearance: "",
        facts: [],
      },
    };
    const beat = beatGeneration({
      imageRequest: { caption: "The hall", id: "hall", referenceImageIds: [], prompt: "the hall" },
    });
    beat.plan.establishedFacts = [fact];
    beat.plan.newGameElements = [element];
    beat.plan.newIntroductionsOfStoryElements = [intro];
    const response = beatSet(1, { statChanges: [statChange], newMilestones: [milestone], player1: beat });

    const [updated, changes, imageRequests] = beatStep.apply(story, response);
    expect(changes).toEqual([statChange, milestone, fact, element, intro]);
    expect(updated.getCurrentTurn()).toBe(1);
    expect(updated.getCurrentBeat("player1")?.choice).toBe(-1);
    expect(imageRequests).toHaveLength(1);
    expect(beatStep.apply(story, response, true)[2]).toHaveLength(0);
  });
});

describe("analysis steps", () => {
  it("adds a switch phase starting at the next beat", () => {
    const story = storyWithBeats(2);
    const updated = switchStep.apply(story, switchAnalysis(["player1"]));
    expect(updated.getCurrentBeatType()).toBe("switch");
    expect(updated.getState().storyPhases[0]).toMatchObject({ firstBeatIndex: 2, duration: 1 });
  });

  it("adds a thread phase with unresolved steps and records the thread type", () => {
    const story = storyWithBeats(2);
    const updated = threadStep.apply(story, threadAnalysis("challenge", 3, 0));
    expect(updated.getCurrentBeatType()).toBe("thread");
    expect(updated.getCurrentThreadBeatsCompleted()).toBe(0);
    expect(updated.getCurrentThreadAnalysis()?.threads[0]).toMatchObject({
      firstBeatIndex: 2,
      duration: 3,
      milestone: null,
    });
    expect(updated.getPlayer("player1")?.previousTypesOfThreads).toContain("Chase");
  });
});

describe("analysisBefore", () => {
  it("runs a switch analysis before a switch beat", () => {
    expect(analysisBefore(createMockStory(), "switch")).toBe("switch");
  });

  it("runs a thread analysis only before a thread's first beat", () => {
    const fresh = createMockStory({ storyPhases: [threadAnalysis("challenge", 2, 0)] });
    expect(analysisBefore(fresh, "thread")).toBe("thread");

    const started = threadAnalysis("challenge", 2, 0);
    started.threads[0].progression[0].resolution = "favorable";
    expect(analysisBefore(createMockStory({ storyPhases: [started] }), "thread")).toBeUndefined();
  });

  it("runs nothing before an ending", () => {
    expect(analysisBefore(createMockStory(), "ending")).toBeUndefined();
  });
});

describe("partialTemplateSchema", () => {
  it("keeps only the section fields and this player count's slots", () => {
    const keys = Object.keys(partialTemplateSchema(["players", "media", "unknown"], 2).shape);
    expect(keys.sort()).toEqual(
      ["characterSelectionIntroduction", "characterSelectionPlan", "imageInstructions", "player1", "player2"].sort()
    );
  });
});
