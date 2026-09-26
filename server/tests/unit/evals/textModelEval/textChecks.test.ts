import { jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import { GameModes } from "core/types/index.js";
import {
  aggregateProse,
  checkBeatSet,
  checkSetup,
  checkThread,
  paragraphsOf,
  type SetupShape,
} from "../../../../src/evals/textModelEval/textChecks.js";
import { createMockStory } from "../../../helpers/testHelpers.js";
import {
  PARAGRAPH,
  beatGeneration,
  beatSet,
  challengeOptions,
  threadAnalysis,
} from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const paragraphs = (n: number, prefix = "") => Array.from({ length: n }, (_, i) => `${i === 0 ? prefix : ""}${PARAGRAPH}`).join("\n\n");

describe("paragraphsOf", () => {
  it("keeps a paragraph that starts with an image tag", () => {
    const text = `[image id=inn source=story desc="The inn"]\n\n${paragraphs(5, '[image id=inn source=story desc="The inn"] ')}`;
    expect(paragraphsOf(text)).toHaveLength(5);
  });
});

describe("checkBeatSet", () => {
  const story = createMockStory({ images: [{ id: "inn", source: "story", description: "The inn" }] });

  it("passes a well-formed beat", () => {
    const result = checkBeatSet(beatSet(1), story);
    expect(Object.entries(result.checks).filter(([, ok]) => !ok)).toEqual([]);
  });

  it("flags option count, a second sacrifice, and the wrong option type for a challenge thread", () => {
    const inThread = Story.create({ ...story.getState(), storyPhases: [threadAnalysis("challenge", 2, 0)] });
    const options = challengeOptions();
    options[0] = { ...options[0], resourceType: "sacrifice", basePoints: 30 };
    options[1] = { ...options[1], resourceType: "reward", basePoints: -30 };
    const twoTradeOffs = checkBeatSet(beatSet(1, { player1: beatGeneration({ options }) }), inThread);
    expect(twoTradeOffs.checks).toMatchObject({ atMostOneSacrificeOrReward: false, optionType: true, basePoints: true });
    const exploration = checkBeatSet(beatSet(1), inThread);
    expect(exploration.checks.optionType).toBe(false);
    const two = checkBeatSet(beatSet(1, { player1: beatGeneration({ options: challengeOptions().slice(0, 2) }) }), inThread);
    expect(two.checks.threeOptions).toBe(false);
  });

  it("does not hold an ending to three options (the ending prompt asks for none)", () => {
    const ending = Story.create(story.getState());
    jest.spyOn(ending, "getCurrentBeatType").mockReturnValue("ending");
    const none = checkBeatSet(beatSet(1, { player1: beatGeneration({ options: [] }) }), ending);
    expect(none.checks.threeOptions).toBe(true);
    expect(checkBeatSet(beatSet(1), ending).checks.threeOptions).toBe(true);
  });

  it("wants a sacrifice option at exactly the fixed sacrifice bonus", () => {
    const inThread = Story.create({ ...story.getState(), storyPhases: [threadAnalysis("challenge", 2, 0)] });
    const withSacrifice = (basePoints: number) => {
      const options = challengeOptions();
      options[0] = { ...options[0], resourceType: "sacrifice", basePoints };
      return checkBeatSet(beatSet(1, { player1: beatGeneration({ options }) }), inThread).checks.basePoints;
    };
    expect(withSacrifice(25)).toBe(false);
    expect(withSacrifice(30)).toBe(true);
  });

  it("counts interludes", () => {
    const beat = beatGeneration();
    const result = checkBeatSet(beatSet(1, { player1: { ...beat, interludes: beat.interludes.slice(0, 1) } }), story);
    expect(result.checks.threeInterludes).toBe(false);
  });

  it("reports ids that do not exist", () => {
    const beat = beatGeneration();
    beat.plan.establishedFacts = [{ type: "newFact", storyElementId: "ghost_ship", fact: "It sails at night." }];
    const result = checkBeatSet(beatSet(1, { player1: beat }), story);
    expect(result.checks.knownIds).toBe(false);
    expect(result.unknownIds).toEqual(["fact:ghost_ship"]);
  });

  it("flags an image tag in the last paragraph and an unused requested image", () => {
    const text = `${paragraphs(4)}\n\n[image id=inn source=story desc="The inn"] ${PARAGRAPH}`;
    const beat = beatGeneration({ text, imageRequest: { caption: "Hall", id: "hall", referenceImageIds: [], prompt: "hall" } });
    const result = checkBeatSet(beatSet(1, { player1: beat }), story);
    expect(result.checks).toMatchObject({ noImageInLastParagraph: false, requestedImageUsed: false, paragraphs: true });
  });
});

describe("checkSetup", () => {
  const input = { premise: "p", playerCount: 1 as const, gameMode: GameModes.SinglePlayer, maxTurns: 25 };
  const setup = (overrides: Partial<SetupShape> = {}): SetupShape => ({
    difficultyLevel: { modifier: 0 },
    sharedStats: [{}, {}, {}],
    playerStats: [{}, {}, {}],
    storyElements: [],
    guidelines: { typesOfThreads: [1, 2, 3, 4, 5, 6] },
    player1: {},
    ...overrides,
  });

  it("rejects a difficulty modifier outside the allowed set", () => {
    const result = checkSetup(setup({ difficultyLevel: { modifier: 15 } }), input);
    expect(result.checks).toMatchObject({ difficultyModifier: false, playerSlots: true, sharedStats: true, threadTypes: true });
  });

  it("counts only visible stats against the 3-4 rule", () => {
    const hidden = { isVisible: false };
    const withInvisibleExtra = setup({
      sharedStats: [{}, {}, { isVisible: true }, {}, hidden],
      playerStats: [{}, {}, {}, {}, hidden],
    });
    expect(checkSetup(withInvisibleExtra, input).checks).toMatchObject({ sharedStats: true, playerStats: true });
    expect(checkSetup(withInvisibleExtra, input).counts).toMatchObject({ sharedStats: 5, playerStats: 5 });
    const tooFewVisible = setup({ playerStats: [{}, {}, hidden, hidden] });
    expect(checkSetup(tooFewVisible, input).checks.playerStats).toBe(false);
  });
});

describe("checkThread", () => {
  it("wants one step per beat of the duration", () => {
    const thread = threadAnalysis("challenge", 3, 0);
    expect(checkThread(thread).checks).toEqual({ duration: true, stepPerBeat: true });
    thread.threads[0].progression.pop();
    expect(checkThread(thread).checks.stepPerBeat).toBe(false);
    expect(checkThread({ ...thread, duration: 5 }).checks.duration).toBe(false);
  });
});

describe("aggregateProse", () => {
  it("counts distinct openings and stock phrases", () => {
    const result = aggregateProse(["You walk in. A testament to time.", "You walk out.", "Rain falls."]);
    expect(result).toMatchObject({ beats: 3, distinctOpenings: 2, youOpenings: 2 });
    expect(result.topStockPhrases).toEqual([["a testament to", 1]]);
  });
});
