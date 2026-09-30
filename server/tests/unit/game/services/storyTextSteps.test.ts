import { jest } from "@jest/globals";
import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { GameModes, type Beat, type ChallengeOption, type Change } from "core/types/index.js";
import { POINTS_FOR_SACRIFICE } from "core/config.js";
import {
  analysisBefore,
  beatStep,
  partialTemplateSchema,
  switchStep,
  threadStep,
} from "../../../../src/game/services/storyTextSteps.js";
import { createMockMultiplayerStory, createMockStory } from "../../../helpers/testHelpers.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import {
  beatGeneration,
  beatSet,
  challengeOptions,
  stat,
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

describe("beatStep.apply records the lever a turn paid on its new beat (for the next turn's repair, TR-10)", () => {
  const RESERVE = stat("player_personal_reserve", { name: "Personal Reserve", optionsToSacrifice: "Spend 15% Personal Reserve to sustain one difficult effort." });
  const CONTACTS = stat("player_city_contacts", { type: "string[]", name: "City Contacts", optionsToSacrifice: "Call in one contact, removing them from the list." });
  const CRUMBS = stat("shared_pantry_crumbs", { type: "number", name: "Pantry Crumbs", optionsToSacrifice: "Spend 1 Pantry Crumb to wedge, bait or bribe." });
  const BRACE = "Brace the shuddering control ring and keep it aligned (-15% Personal Reserve).";
  const option = (text: string, resourceType: "normal" | "sacrifice" = "sacrifice"): ChallengeOption => ({
    optionType: "challenge",
    resourceType,
    riskType: "normal",
    text,
    basePoints: resourceType === "sacrifice" ? POINTS_FOR_SACRIFICE : 0,
    modifiersToSuccessRate: [],
  });

  /** Each player's last beat chose this option (none: a normal one); Personal Reserve at 60, two contacts, three Pantry Crumbs. */
  function chose(base: Story, bySlot: Record<string, string | undefined>): Story {
    const players = Object.fromEntries(
      Object.entries(base.getPlayers()).map(([slot, player]) => {
        const beats = [...player.beatHistory];
        const text = bySlot[slot];
        beats[beats.length - 1] = { ...beats[beats.length - 1], options: [...challengeOptions().slice(0, 2), option(text ?? "Look around", text ? "sacrifice" : "normal")], choice: 2 };
        const statValues = [
          { statId: RESERVE.id, value: 60 },
          { statId: CONTACTS.id, value: ["Mara Vell", "Tavi Renn"] },
        ];
        return [slot, { ...player, beatHistory: beats, statValues }];
      })
    );
    return base.clone({ sharedStats: [CRUMBS], sharedStatValues: [{ statId: CRUMBS.id, value: 3 }], playerStats: [RESERVE, CONTACTS], players });
  }
  const change = (group: string, id: string, kind: "addNumber" | "subtractNumber" | "setNumber" | "removeElement", value: number | string): Change => ({ type: "statChange", group, stat: id, change: kind, value });
  const paidOn = (story: Story, statChanges: Change[], slot = "player1") =>
    beatStep.apply(story, beatSet(story.getPlayerSlots().length, { statChanges }))[0].getCurrentBeat(slot as "player1")?.paidLever;

  it("records the sacrifice the turn paid, by the change that paid it (New Avalon turn 3: 60 → 45)", () => {
    const story = chose(threadBeat(1), { player1: BRACE });
    expect(paidOn(story, [change("player1", RESERVE.id, "subtractNumber", 15)])).toEqual({ kind: "sacrifice", group: "player1", stat: RESERVE.id, step: -15 });
    expect(paidOn(story, [change("player1", RESERVE.id, "setNumber", 45)])).toEqual({ kind: "sacrifice", group: "player1", stat: RESERVE.id, step: -15 });
  });

  it("records nothing for a lever the turn left unpaid or paid the other way, for a normal choice, or for a list stat", () => {
    const story = chose(threadBeat(1), { player1: BRACE });
    expect(paidOn(story, [])).toBeUndefined();
    expect(paidOn(story, [change("player1", RESERVE.id, "addNumber", 15)])).toBeUndefined();
    expect(paidOn(chose(threadBeat(1), {}), [change("player1", RESERVE.id, "subtractNumber", 15)])).toBeUndefined();
    const contact = chose(threadBeat(1), { player1: "Call in Tavi Renn from your City Contacts." });
    expect(paidOn(contact, [change("player1", CONTACTS.id, "removeElement", "Tavi Renn")])).toBeUndefined();
  });

  it("records a shared stat's payment on the beat of the player who chose it", () => {
    const story = chose(threadBeat(2), { player2: "Spend 1 Pantry Crumb as a wedge under the board." });
    const paid = [change("shared", CRUMBS.id, "subtractNumber", 1)];
    expect(paidOn(story, paid, "player2")).toEqual({ kind: "sacrifice", group: "shared", stat: CRUMBS.id, step: -1 });
    expect(paidOn(story, paid, "player1")).toBeUndefined();
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
    const keys = Object.keys(partialTemplateSchema(["players", "media", "unknown"], 2, GameModes.Competitive).shape);
    expect(keys.sort()).toEqual(
      ["characterSelectionIntroduction", "characterSelectionPlan", "imageInstructions", "player1", "player2"].sort()
    );
  });
});
