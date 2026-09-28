import { jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import { GameModes } from "core/types/index.js";
import {
  aggregateProse,
  checkBeatSet,
  checkSetup,
  checkThread,
  PADDING_RUN_CHARS,
  paragraphsOf,
  withPadding,
  withRepairs,
  type SetupShape,
} from "../../../../src/evals/textModelEval/textChecks.js";
import { createMockStory } from "../../../helpers/testHelpers.js";
import {
  PARAGRAPH,
  beatGeneration,
  beatSet,
  challengeOptions,
  explorationOptions,
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

  it("counts paragraphs as the game shows them: a single newline starts a paragraph", () => {
    expect(paragraphsOf(Array.from({ length: 5 }, () => PARAGRAPH).join("\n"))).toHaveLength(5);
  });

  it("joins an image line to the paragraph after it, and a line starting with a comma to the one before", () => {
    const text = `[image id=inn source=story desc="The inn"]\n${PARAGRAPH}\n, and then some.\n${PARAGRAPH}`;
    expect(paragraphsOf(text)).toEqual([`${PARAGRAPH} , and then some.`, PARAGRAPH]);
  });
});

describe("checkBeatSet: image placement on single-newline paragraphs", () => {
  const story = createMockStory({ images: [{ id: "inn", source: "story", description: "The inn" }] });
  const tag = '[image id=inn source=story desc="The inn"]';
  const lines = (n: number) => Array.from({ length: n }, () => PARAGRAPH);
  const check = (text: string) => checkBeatSet(beatSet(1, { player1: beatGeneration({ text }) }), story).checks;

  it("places an image line before the first paragraph in the first paragraph", () => {
    expect(check([tag, ...lines(5)].join("\n"))).toMatchObject({ noImageInLastParagraph: true, paragraphs: true });
  });

  it("places an image line before the last paragraph, or trailing after it, in the last paragraph", () => {
    expect(check([...lines(4), tag, PARAGRAPH].join("\n"))).toMatchObject({ noImageInLastParagraph: false, paragraphs: true });
    expect(check([...lines(5), tag].join("\n"))).toMatchObject({ noImageInLastParagraph: false, paragraphs: true });
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

  it("leaves interludes, facts, new elements and introductions unread at the ending, where the game never shows or reads them", () => {
    const ending = Story.create(story.getState());
    jest.spyOn(ending, "getCurrentBeatType").mockReturnValue("ending");
    const { checks, counts } = checkBeatSet(beatSet(1, { player1: beatGeneration({ options: [], interludes: [] }) }), ending);
    expect(checks).not.toHaveProperty("threeInterludes");
    expect(checks).not.toHaveProperty("interludesTwoToFour");
    for (const name of ["interludes", "facts", "newElements", "introductions"]) expect(counts).not.toHaveProperty(name);
    expect(counts).toHaveProperty("words");
    expect(checkBeatSet(beatSet(1), story).counts).toHaveProperty("facts");
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

  it("reads interludes against rule B32's two to four as well as production's three, and counts them", () => {
    const withInterludes = (n: number) => {
      const beat = beatGeneration();
      const interludes = Array.from({ length: n }, (_, i) => ({ ...beat.interludes[0], text: `Interlude ${i + 1}.` }));
      return checkBeatSet(beatSet(1, { player1: { ...beat, interludes } }), story);
    };
    // A dropped interlude is not a blank one, so noBlankItems passes and only the count sees it
    expect(withInterludes(1).checks).toMatchObject({ interludesTwoToFour: false, threeInterludes: false, noBlankItems: true });
    expect(withInterludes(0).checks.interludesTwoToFour).toBe(false);
    expect(withInterludes(2).checks).toMatchObject({ interludesTwoToFour: true, threeInterludes: false });
    expect(withInterludes(3).checks).toMatchObject({ interludesTwoToFour: true, threeInterludes: true });
    expect(withInterludes(4).checks.interludesTwoToFour).toBe(true);
    expect(withInterludes(5).checks.interludesTwoToFour).toBe(false);
    expect(withInterludes(2).counts.interludes).toBe(2);
  });

  it("reports ids that do not exist", () => {
    const beat = beatGeneration();
    beat.plan.establishedFacts = [{ type: "newFact", storyElementId: "ghost_ship", fact: "It sails at night." }];
    const result = checkBeatSet(beatSet(1, { player1: beat }), story);
    expect(result.checks.knownIds).toBe(false);
    expect(result.unknownIds).toEqual(["fact:ghost_ship"]);
  });

  it("counts prose words without image tags, and the plan's JSON length", () => {
    const text = `[image id=inn source=story desc="The old inn by the river"] The door creaks.\n\nRain falls on the roof tonight.`;
    const beat = beatGeneration({ text });
    const { counts } = checkBeatSet(beatSet(1, { player1: beat }), story);
    expect(counts.words).toBe(9);
    expect(counts.planChars).toBe(JSON.stringify(beat.plan).length);
  });

  it("flags a reply with a blank list item: an empty or whitespace-only string, or an item whose own text is", () => {
    const check = (edit: (beat: ReturnType<typeof beatGeneration>) => void) => {
      const beat = beatGeneration();
      edit(beat);
      return checkBeatSet(beatSet(1, { player1: beat }), story).checks.noBlankItems;
    };
    expect(check(() => undefined)).toBe(true);
    expect(check((beat) => (beat.interludes[2] = { ...beat.interludes[2], text: "" }))).toBe(false);
    expect(check((beat) => (beat.interludes[2] = { ...beat.interludes[2], text: " " }))).toBe(false);
    expect(check((beat) => (beat.options[2] = { ...beat.options[2], text: "\t\r\n" }))).toBe(false);
    expect(check((beat) => (beat.plan.showDontTell = ["The ferryman takes the coin.", ""]))).toBe(false);
    // An interlude without a picture is not blank: its text is what the player reads
    expect(check((beat) => (beat.interludes[0] = { ...beat.interludes[0], imageId: "", imageSource: "none" }))).toBe(true);
  });

  it("flags an image tag in the last paragraph and an unused requested image", () => {
    const text = `${paragraphs(4)}\n\n[image id=inn source=story desc="The inn"] ${PARAGRAPH}`;
    const beat = beatGeneration({ text, imageRequest: { caption: "Hall", id: "hall", referenceImageIds: [], prompt: "hall" } });
    const result = checkBeatSet(beatSet(1, { player1: beat }), story);
    expect(result.checks).toMatchObject({ noImageInLastParagraph: false, requestedImageUsed: false, paragraphs: true });
  });
});

describe("checkBeatSet: game words in what the player sees", () => {
  const story = createMockStory();
  const withImage = (desc: string) => `[image id=player1 source=story desc="${desc}"] ${paragraphs(5)}`;
  const noMetaWords = (overrides: Parameters<typeof beatGeneration>[0]) =>
    checkBeatSet(beatSet(1, { player1: beatGeneration(overrides) }), story).checks.noMetaWords;

  it("reads an image tag as the caption the player sees, so a portrait's id is not a game word", () => {
    expect(noMetaWords({ text: withImage("Mira at the gate") })).toBe(true);
  });

  it("still flags a game word in a caption or an option", () => {
    expect(noMetaWords({ text: withImage("Player 2 at the gate") })).toBe(false);
    const options = explorationOptions();
    options[1] = { ...options[1], text: "Ask player1 for help" };
    expect(noMetaWords({ options })).toBe(false);
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

  it("flags a setup with a blank list item: a fact, a stat list item, or an identity without a name", () => {
    const pronouns = { personal: "she", object: "her", possessive: "her", reflexive: "herself" };
    const identity = (name: string) => ({ name, pronouns, appearance: name ? "Tall, with a red scarf." : "" });
    const element = (facts: string[]) => ({ id: "inn", name: "The Inn", appearance: "", facts });
    const stat = (effectOnPoints: string[]) => ({ name: "Courage", isVisible: true, possibleValues: "", effectOnPoints });
    const clean = setup({
      storyElements: [element(["Old.", "Cold.", "Loud."])],
      sharedStats: [stat(["+10 in fights"]), stat(["-10 when tired"]), stat(["+20 at dawn"])],
      player1: { possibleCharacterIdentities: [identity("Ada"), identity("Bo"), identity("Cy")] },
    });
    // Empty strings outside a list (an abstract element's appearance, a percentage stat's possible values) are fine
    expect(checkSetup(clean, input).checks.noBlankItems).toBe(true);
    expect(checkSetup({ ...clean, storyElements: [element(["Old.", "Cold.", ""])] }, input).checks.noBlankItems).toBe(false);
    expect(checkSetup({ ...clean, sharedStats: [stat(["+10 in fights", " "]), ...clean.sharedStats.slice(1)] }, input).checks.noBlankItems).toBe(false);
    const blankIdentity = { possibleCharacterIdentities: [identity("Ada"), identity("Bo"), identity("")] };
    expect(checkSetup({ ...clean, player1: blankIdentity }, input).checks.noBlankItems).toBe(false);
  });

  describe("list counts: a list left one item short passes noBlankItems, so the counts must see it", () => {
    const twoPlayers = { ...input, playerCount: 2 as const, gameMode: GameModes.Cooperative };
    const COUNT_CHECKS = ["storyElements", "threeFactsPerElement", "effectsPerStat", "threeIdentities", "threeBackgrounds", "threeOutcomes"];
    const list = <T>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i));
    const element = (facts = 3) => ({ id: "inn", name: "The Inn", facts: list(facts, (i) => `Fact ${i + 1}.`) });
    const stat = (effects = 3) => ({ name: "Courage", effectOnPoints: list(effects, (i) => `Effect ${i + 1}.`) });
    const outcome = (i: number) => ({ id: `o${i}`, question: `Question ${i + 1}?` });
    const player = ({ identities = 3, backgrounds = 3, outcomes = 2 } = {}) => ({
      possibleCharacterIdentities: list(identities, (i) => ({ name: `Name ${i + 1}` })),
      possibleCharacterBackgrounds: list(backgrounds, (i) => ({ title: `Background ${i + 1}` })),
      outcomes: list(outcomes, outcome),
    });
    const complete = (overrides: Partial<SetupShape> = {}) =>
      setup({
        storyElements: list(6, () => element()),
        sharedStats: list(3, () => stat()),
        playerStats: list(3, () => stat()),
        sharedOutcomes: [outcome(9)],
        player1: player(),
        player2: player(),
        ...overrides,
      });
    const failing = (overrides: Partial<SetupShape>) =>
      Object.entries(checkSetup(complete(overrides), twoPlayers).checks)
        .filter(([name, ok]) => COUNT_CHECKS.includes(name) && !ok)
        .map(([name]) => name);

    it("passes a setup with every list at the count the prompt asks for", () => {
      expect(failing({})).toEqual([]);
      expect(checkSetup(complete({ storyElements: list(8, () => element()) }), twoPlayers).checks.storyElements).toBe(true);
      expect(checkSetup(complete({ sharedStats: [stat(5), stat(), stat()] }), twoPlayers).checks.effectsPerStat).toBe(true);
    });

    it("fails a list one item short, or one over, on one player, element or stat", () => {
      expect(failing({ player2: player({ identities: 2 }) })).toEqual(["threeIdentities"]);
      expect(failing({ player1: player({ backgrounds: 2 }) })).toEqual(["threeBackgrounds"]);
      expect(failing({ player1: player({ identities: 4 }) })).toEqual(["threeIdentities"]);
      expect(failing({ storyElements: [...list(5, () => element()), element(2)] })).toEqual(["threeFactsPerElement"]);
      expect(failing({ storyElements: list(5, () => element()) })).toEqual(["storyElements"]);
      expect(failing({ storyElements: list(9, () => element()) })).toEqual(["storyElements"]);
      expect(failing({ playerStats: [stat(), stat(2), stat()] })).toEqual(["effectsPerStat"]);
      // Three outcomes per player, counting the shared ones
      expect(failing({ player1: player({ outcomes: 1 }) })).toEqual(["threeOutcomes"]);
      expect(failing({ sharedOutcomes: [], player1: player({ outcomes: 3 }), player2: player({ outcomes: 3 }) })).toEqual([]);
    });

    it("fails startable where the game would refuse the story: no outcomes, or several players and no shared one", () => {
      expect(checkSetup(complete(), twoPlayers).checks.startable).toBe(true);
      expect(checkSetup(complete({ sharedOutcomes: [] }), twoPlayers).checks.startable).toBe(false);
      expect(checkSetup(complete({ sharedOutcomes: undefined }), twoPlayers).checks.startable).toBe(false);
      // Single player: any outcome will do, and none at all is refused
      expect(checkSetup(setup({ player1: player() }), input).checks.startable).toBe(true);
      expect(checkSetup(setup({ player1: player({ outcomes: 0 }) }), input).checks.startable).toBe(false);
    });

    it("fails a list that is missing altogether", () => {
      expect(failing({ player1: {} })).toEqual(["threeIdentities", "threeBackgrounds", "threeOutcomes"]);
      expect(failing({ storyElements: list(6, () => ({ id: "inn", facts: undefined })) })).toEqual(["threeFactsPerElement"]);
    });

    it("counts identities and backgrounds per player and facts per element, as means", () => {
      const { counts } = checkSetup(
        complete({ player2: player({ identities: 2, backgrounds: 2 }), storyElements: [...list(5, () => element()), element(0)] }),
        twoPlayers
      );
      expect(counts).toMatchObject({ identitiesPerPlayer: 2.5, backgroundsPerPlayer: 2.5, storyElements: 6 });
      expect(counts.factsPerElement).toBeCloseTo(15 / 6);
    });
  });
});

describe("withPadding", () => {
  const result = { checks: { duration: true }, counts: { threads: 2 }, unknownIds: [] };

  it("adds the reply's longest whitespace run between JSON tokens as a check and a count", () => {
    const run = (n: number) => `{"a":[1,${" ".repeat(n)}2]}`;
    expect(withPadding(result, run(PADDING_RUN_CHARS))).toEqual({
      checks: { duration: true, noWhitespacePadding: true },
      counts: { threads: 2, longestWhitespaceRun: PADDING_RUN_CHARS },
      unknownIds: [],
    });
    expect(withPadding(result, run(PADDING_RUN_CHARS + 1)).checks.noWhitespacePadding).toBe(false);
  });

  it("passes a pretty-printed reply: indentation is not padding", () => {
    const pretty = JSON.stringify({ a: { b: { c: { d: { e: { f: ["x"] } } } } } }, null, 4);
    expect(withPadding(result, pretty).checks.noWhitespacePadding).toBe(true);
  });
});

describe("withRepairs", () => {
  const result = { checks: { knownChangeIds: true }, counts: { statChanges: 1 }, unknownIds: [] };

  it("counts each repair and note by kind, and fails noRepairs on a repair only", () => {
    const repairs = [{ kind: "statIdSeatForm" }, { kind: "statIdSeatForm" }, { kind: "offLadderValue", note: true }];
    expect(withRepairs(result, repairs)).toEqual({
      checks: { knownChangeIds: true, noRepairs: false },
      counts: { statChanges: 1, "repair:statIdSeatForm": 2, "note:offLadderValue": 1 },
      unknownIds: [],
    });
    expect(withRepairs(result, [{ kind: "offLadderValue", note: true }]).checks.noRepairs).toBe(true);
  });

  it("adds planUsable for a plan: false when its check found a problem", () => {
    expect(withRepairs(result, [], { problem: "player2 is in no thread" }).checks.planUsable).toBe(false);
    expect(withRepairs(result, [], {}).checks.planUsable).toBe(true);
    expect(withRepairs(result, []).checks).not.toHaveProperty("planUsable");
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
