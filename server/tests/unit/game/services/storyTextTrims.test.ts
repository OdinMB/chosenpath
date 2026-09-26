import { jest } from "@jest/globals";
import { z } from "zod";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import {
  GameModes,
  type Change,
  type GameMode,
  type PlayerCount,
  type SetOfBeatGenerationSchema,
  type SwitchAnalysis,
  type ThreadAnalysis,
} from "core/types/index.js";
import { ChangeService } from "../../../../src/game/services/ChangeService.js";
import {
  beatStep,
  setupStep,
  switchStep,
  threadStep,
} from "../../../../src/game/services/storyTextSteps.js";
import {
  applyPromptEdits,
  trimmedBeatRequest,
  trimmedSetupRequest,
  trimmedSwitchRequest,
  trimmedThreadRequest,
  type TrimLevel,
} from "../../../../src/game/services/storyTextTrims.js";
import { createMockMultiplayerStory, createMockStory } from "../../../helpers/testHelpers.js";
import {
  endingBeat,
  firstSwitchBeat,
  laterSwitchBeat,
  slotsOf,
  switchAnalysisAfterThread,
  threadAnalysisAfterSwitch,
  threadBeat,
} from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const STATE_MARKER = "======= CURRENT GAME STATE =======";
const SETUP_MARKER = "Remember: everything so far has only been general instructions and examples.";
const LEVELS: TrimLevel[] = ["slim", "minimal"];

/** The prompt from the marker on: the story state or the premise. */
function fromMarker(prompt: string, marker: string): string {
  const at = prompt.indexOf(marker);
  expect(at).toBeGreaterThan(0);
  return prompt.slice(at);
}

function objectShape(schema: unknown): z.ZodRawShape {
  if (!(schema instanceof z.ZodObject)) throw new Error("not an object schema");
  return schema.shape;
}

const keysOf = (schema: unknown) => Object.keys(objectShape(schema));

/**
 * The schema of the production request a trim was derived from. The schema
 * factories build fresh instances per request, so identity can only be
 * checked against that very request (the spied step's first call).
 */
function productionSchemaOf(results: { value: unknown }[]): z.ZodRawShape {
  const value = results[0]?.value;
  if (typeof value !== "object" || value === null || !("schema" in value)) throw new Error("no production request recorded");
  return objectShape(value.schema);
}

/** The last step of a 2-beat thread (step 1 resolved). */
function lastThreadStep(players: number): Story {
  const thread = threadAnalysis("challenge", 2, 2, slotsOf(players));
  thread.threads[0].progression[0].resolution = "favorable";
  return threadBeat(players, { storyPhases: [switchAnalysis(slotsOf(players), 1), thread] });
}

/** [case, story, text that proves production took the branch the case names] */
type Branch = [string, () => Story, string];

const BEAT_BRANCHES: Branch[] = [1, 2].flatMap((players): Branch[] => [
  [`first beat, ${players}p`, () => firstSwitchBeat(players), "there are no consequences of player actions"],
  [`later switch beat, ${players}p`, () => laterSwitchBeat(players), "Since a thread was just resolved"],
  [`mid thread beat, ${players}p`, () => threadBeat(players), "This is not yet the last beat of the thread"],
  [`last thread beat, ${players}p`, () => lastThreadStep(players), "This is the last beat of the thread"],
  [`ending, ${players}p`, () => endingBeat(players), "transition to an overall ending"],
]);

const SWITCH_BRANCHES: Branch[] = [
  ["single-player at turn 0", () => createMockStory(), "Based on the story setup"],
  ["single-player later", () => switchAnalysisAfterThread(1), "Based on the previous thread"],
  ["multiplayer at turn 0", () => createMockMultiplayerStory(2), "simply write 'introduction'"],
  ["multiplayer later", () => switchAnalysisAfterThread(2), "Analyze potential for player coordination"],
];

const THREAD_BRANCHES: Branch[] = [
  ["single-player", () => threadAnalysisAfterSwitch(1), "there is always only one thread"],
  ["multiplayer at turn 0", () => firstSwitchBeat(2), "MANDATORY FIRST THREAD REQUIREMENT"],
  ["multiplayer later", () => threadAnalysisAfterSwitch(2), "A summary of how you want to set up the threads"],
];

const SETUP_INPUTS: [PlayerCount, GameMode][] = [
  [1, GameModes.SinglePlayer],
  [3, GameModes.Competitive],
];

const setupRequests = (players: PlayerCount, gameMode: GameMode) => ({
  production: setupStep.request("A lighthouse keeper's last winter", players, gameMode, 25, "story"),
  trimmed: trimmedSetupRequest("A lighthouse keeper's last winter", players, gameMode, 25),
});

describe("applyPromptEdits", () => {
  const MARKER = "== STATE ==";
  const prompt = `Step one. Step two. Step three.\n${MARKER}\nStep one again.`;

  it("replaces and cuts exactly once, keeping the cut's end anchor and the text from the marker on", () => {
    const edited = applyPromptEdits(
      prompt,
      [
        { name: "replace", find: "Step one.", replace: "First." },
        { name: "cut", cutFrom: "Step two.", cutTo: "Step three.", replace: "" },
      ],
      MARKER
    );
    expect(edited).toBe(`First. Step three.\n${MARKER}\nStep one again.`);
  });

  it.each([
    ["missing", "Step four."],
    ["repeated", "Step"],
  ])("throws with the edit's name when an anchor is %s", (_, find) => {
    expect(() => applyPromptEdits(prompt, [{ name: "named edit", find, replace: "" }], MARKER)).toThrow(
      'Stage 3 trim "named edit": anchor found'
    );
  });

  it("does not match an anchor that occurs only after the marker", () => {
    expect(() => applyPromptEdits(prompt, [{ name: "late", find: "again", replace: "" }], MARKER)).toThrow(
      'Stage 3 trim "late": anchor found 0 times'
    );
  });

  it("throws when a cut ends before it starts, or the marker is missing", () => {
    const backwards = { name: "backwards", cutFrom: "Step three.", cutTo: "Step two.", replace: "" };
    expect(() => applyPromptEdits(prompt, [backwards], MARKER)).toThrow('Stage 3 trim "backwards"');
    expect(() => applyPromptEdits(prompt, [], "== NOWHERE ==")).toThrow("Stage 3 trim");
  });
});

describe("every production branch builds, and the story state and premise stay as production has them", () => {
  describe.each(LEVELS)("beats, %s", (level) => {
    it.each(BEAT_BRANCHES)("%s", (_, build, branchText) => {
      const story = build();
      const production = beatStep.request(story).prompt;
      expect(production).toContain(branchText);
      expect(fromMarker(trimmedBeatRequest(story, level).prompt, STATE_MARKER)).toBe(fromMarker(production, STATE_MARKER));
    });
  });

  it.each(SWITCH_BRANCHES)("switch, %s", (_, build, branchText) => {
    const story = build();
    const production = switchStep.request(story).prompt;
    expect(production).toContain(branchText);
    expect(fromMarker(trimmedSwitchRequest(story).prompt, STATE_MARKER)).toBe(fromMarker(production, STATE_MARKER));
  });

  it.each(THREAD_BRANCHES)("thread, %s", (_, build, branchText) => {
    const story = build();
    const production = threadStep.request(story).prompt;
    expect(production).toContain(branchText);
    expect(fromMarker(trimmedThreadRequest(story).prompt, STATE_MARKER)).toBe(fromMarker(production, STATE_MARKER));
  });

  it.each(SETUP_INPUTS)("setup, %i players", (players, gameMode) => {
    const { production, trimmed } = setupRequests(players, gameMode);
    expect(fromMarker(trimmed.prompt, SETUP_MARKER)).toBe(fromMarker(production.prompt, SETUP_MARKER));
  });
});

describe("removed steps and kept rules", () => {
  describe.each(LEVELS)("beats, %s", (level) => {
    it.each([1, 2])("%i players", (players) => {
      const prompt = trimmedBeatRequest(threadBeat(players), level).prompt;
      expect(prompt).not.toContain("IDENTIFY STATS AND STORY ELEMENTS");
      expect(prompt).not.toContain("Cover the following points");
      expect(prompt).toContain("1. IDENTIFY CHANGES TO THE STORY STATE");
      expect(prompt).toContain("2. GENERATE ONE STORY BEAT FOR EACH PLAYER");
      expect(prompt).toContain("Remember that this is beat");
      if (level === "minimal") {
        expect(prompt).not.toContain("generated in the plan for the beat");
      } else {
        expect(prompt).toContain("generated in the plan for the beat");
      }
      if (players > 1) {
        expect(prompt).not.toContain("MULTIPLAYER COORDINATION");
        expect(prompt).not.toContain("multiplayer coordination for this set of beats");
        expect(prompt).toContain("Keep this beat consistent");
      }
    });
  });

  it.each(SWITCH_BRANCHES)("switch, %s", (_, build) => {
    const prompt = trimmedSwitchRequest(build()).prompt;
    expect(prompt).not.toContain("c) Decision");
    expect(prompt).not.toContain("1a - c");
    expect(prompt).not.toContain("Thread types that should be avoided");
    expect(prompt).toContain("3. Relationship to other switches");
    expect(prompt).toContain("4. If flavor switch");
  });

  it.each(THREAD_BRANCHES)("thread, %s", (_, build) => {
    const prompt = trimmedThreadRequest(build()).prompt;
    expect(prompt).not.toContain("A list of previous thread types");
    expect(prompt).toContain("3. The type of thread");
    expect(prompt).toContain("4. Possible milestones");
    expect(prompt).toContain("5. A progression");
  });

  it.each(SETUP_INPUTS)("setup, %i players", (players, gameMode) => {
    const prompt = setupRequests(players, gameMode).trimmed.prompt;
    expect(prompt).not.toContain("playerStatConversionRates:");
    expect(prompt).not.toContain("backgroundArchetypes:");
    expect(prompt).not.toContain("multiplayerCoordination:");
    expect(prompt).toContain("Each background should represent a different tradeoff");
  });
});

describe("trimmed schemas", () => {
  describe.each(LEVELS)("beats, %s", (level) => {
    it.each([1, 2])("%i players: keys in production order, kept fields are production's instances", (players) => {
      const spy = jest.spyOn(beatStep, "request");
      const trimmed = objectShape(trimmedBeatRequest(laterSwitchBeat(players), level).schema);
      const production = productionSchemaOf(spy.mock.results);
      expect(Object.keys(trimmed)).toEqual(["statChanges", "newMilestones", ...slotsOf(players)]);
      expect(trimmed.statChanges).toBe(production.statChanges);
      expect(trimmed.newMilestones).toBe(production.newMilestones);
      // Shared across slots exactly where production shares, so the JSON schema keeps its references
      expect(trimmed[`player${players}`] === trimmed.player1).toBe(production[`player${players}`] === production.player1);

      for (const slot of slotsOf(players)) {
        const player = objectShape(trimmed[slot]);
        const productionPlayer = objectShape(production[slot]);
        expect(Object.keys(player)).toEqual(Object.keys(productionPlayer));
        for (const kept of ["title", "summary", "options", "interludes"]) expect(player[kept]).toBe(productionPlayer[kept]);

        const plan = objectShape(player.plan);
        const productionPlan = objectShape(productionPlayer.plan);
        const lists = ["newGameElements", "newIntroductionsOfStoryElements", "establishedFacts"];
        for (const kept of lists) expect(plan[kept]).toBe(productionPlan[kept]);
        if (level === "slim") {
          expect(Object.keys(plan)).toEqual(["newGameElements", "showDontTell", "newIntroductionsOfStoryElements", "establishedFacts", "optionConsiderations"]);
          expect(player.text).toBe(productionPlayer.text);
          const options = plan.optionConsiderations;
          if (!(options instanceof z.ZodUnion)) throw new Error("optionConsiderations is not a union");
          expect(options.description).toBe(productionPlan.optionConsiderations.description);
          expect(keysOf(options.options[1])).toEqual(["previousOptionsToAvoid", "upToOneSacrificeOrRewardOption"]);
        } else {
          expect(Object.keys(plan)).toEqual(lists);
          expect(player.text.description).not.toContain("'plan' attribute");
          expect(player.text.description).toContain("show don't tell");
        }
      }
    });
  });

  it.each([1, 2])("switch, %i players", (players) => {
    const spy = jest.spyOn(switchStep, "request");
    const trimmed = objectShape(trimmedSwitchRequest(switchAnalysisAfterThread(players)).schema);
    const production = productionSchemaOf(spy.mock.results);
    expect(Object.keys(trimmed)).toEqual(["coordinationPatternSummary", "switches"]);
    expect(trimmed.coordinationPatternSummary).toBe(production.coordinationPatternSummary);
    if (!(trimmed.switches instanceof z.ZodArray)) throw new Error("switches is not an array");
    expect(trimmed.switches.description).toBe(production.switches.description);
    expect(keysOf(trimmed.switches.element)).toEqual([
      "players", "type", "outcomeId", "question", "topicChoices", "relationshipToOtherSwitches", "title", "id",
    ]);
  });

  it("thread", () => {
    const spy = jest.spyOn(threadStep, "request");
    const trimmed = objectShape(trimmedThreadRequest(threadAnalysisAfterSwitch(1)).schema);
    const production = productionSchemaOf(spy.mock.results);
    expect(Object.keys(trimmed)).toEqual(["duration", "threads"]);
    expect(trimmed.duration).toBe(production.duration);
    if (!(trimmed.threads instanceof z.ZodArray)) throw new Error("threads is not an array");
    expect(trimmed.threads.description).toBe(production.threads.description);
    expect(keysOf(trimmed.threads.element)).toEqual([
      "outcomeId", "playersSideA", "playersSideB", "typeOfThread", "possibleMilestones", "progression", "title", "id",
    ]);
  });

  it.each(SETUP_INPUTS)("setup, %i players: player slots match production's apart from descriptions", (players, gameMode) => {
    const spy = jest.spyOn(setupStep, "request");
    const trimmedShape = objectShape(trimmedSetupRequest("A premise", players, gameMode, 25).schema);
    const productionShape = productionSchemaOf(spy.mock.results);
    expect(Object.keys(trimmedShape)).toEqual(Object.keys(productionShape).filter((key) => key !== "characterSelectionPlan"));
    expect(trimmedShape[`player${players}`] === trimmedShape.player1).toBe(productionShape[`player${players}`] === productionShape.player1);
    for (const [key, field] of Object.entries(trimmedShape)) {
      if (slotsOf(players).includes(key)) {
        expect(withoutDescriptions(toJsonSchema(field))).toEqual(withoutDescriptions(toJsonSchema(productionShape[key])));
      } else {
        expect(field).toBe(productionShape[key]);
      }
    }
  });
});

function withoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDescriptions);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "description")
        .map(([key, inner]) => [key, withoutDescriptions(inner)])
    );
  }
  return value;
}

/** The story with every player's last beat chosen (option 1), as after a turn is played. */
function played(story: Story): Story {
  const state = story.getState();
  const players = Object.fromEntries(
    Object.entries(state.players).map(([slot, player]) => [
      slot,
      { ...player, beatHistory: player.beatHistory.map((beat, i) => (i === player.beatHistory.length - 1 ? { ...beat, choice: 0 } : beat)) },
    ])
  );
  return Story.create({ ...state, players });
}

describe("a trimmed reply works in production code", () => {
  it.each(LEVELS)("beats, %s: apply, the story changes and the next prompt", (level) => {
    const story = laterSwitchBeat(1);
    const statChange: Change = { type: "statChange", group: "shared", stat: "gold", change: "addNumber", value: 5 };
    const milestone: Change = { type: "newMilestone", outcomeGroup: "player1", outcome: "o1", newMilestone: "m" };
    const fact: Change = { type: "newFact", storyElementId: "world", fact: "The river runs uphill at dusk." };
    const element: Change = {
      type: "newStoryElement",
      element: { id: "ferry_inn", name: "Ferry Inn", role: "location", instructions: "", appearance: "", facts: [] },
    };
    const intro: Change = { type: "addIntroductionOfStoryElement", player: "player1", storyElementId: "ferry_inn" };
    const beat = beatGeneration({ summary: "The ferryman hands the player a silver key." });
    beat.plan.establishedFacts = [fact];
    beat.plan.newGameElements = [element];
    beat.plan.newIntroductionsOfStoryElements = [intro];
    const reply = beatSet(1, { statChanges: [statChange], newMilestones: [milestone], player1: beat });

    const parsed: SetOfBeatGenerationSchema = trimmedBeatRequest(story, level).schema.parse(reply);
    expect(Object.keys(parsed)).not.toContain("statsAffectingDecisionConsequences");
    expect(Object.keys(parsed.player1.plan)).not.toContain("forPlayer");
    expect(Object.keys(parsed.player1.plan)).not.toContain("worldBuilding");
    expect("showDontTell" in parsed.player1.plan).toBe(level === "slim");

    const [updated, changes] = beatStep.apply(story, parsed);
    expect(changes).toEqual([statChange, milestone, fact, element, intro]);
    expect(updated.getCurrentBeat("player1")).toMatchObject({ summary: beat.summary, options: beat.options, text: beat.text });

    const changed = new ChangeService().applyChanges(updated, changes);
    expect(changed.getState().storyElements.map((e) => e.id)).toContain("ferry_inn");
    expect(changed.getState().worldFacts).toContain(fact.fact);
    expect(changed.getPlayer("player1")?.knownStoryElements).toContain("ferry_inn");
    expect(beatStep.request(played(changed)).prompt).toContain(beat.summary);
  });

  it.each([1, 2])("switch, minimal, %i players: production's switch beat shows the kept fields", (players) => {
    const story = switchAnalysisAfterThread(players);
    const reply = switchAnalysis(slotsOf(players));
    reply.coordinationPatternSummary = "Everyone converges on the lighthouse.";
    const topicChoices = ["Climb the tower (o1)", "Row out to the wreck (o2)", "Question the keeper (o3)"];
    reply.switches[0] = {
      ...reply.switches[0],
      relationshipToOtherSwitches: "The only switch in this turn.",
      title: "The Lighthouse Gambit",
      topicChoices,
    };

    const parsed: SwitchAnalysis = trimmedSwitchRequest(story).schema.parse(reply);
    expect(Object.keys(parsed)).toEqual(["coordinationPatternSummary", "switches"]);
    expect(Object.keys(parsed.switches[0])).not.toContain("relevantSuggestedThreadTypes");

    const next = switchStep.apply(story, parsed);
    const prompt = beatStep.request(next).prompt;
    for (const text of [reply.coordinationPatternSummary, "The only switch in this turn.", "The Lighthouse Gambit", ...topicChoices]) {
      expect(prompt).toContain(text);
    }
    // A Stage 3 chain builds the trimmed beat on this story
    expect(fromMarker(trimmedBeatRequest(next, "minimal").prompt, STATE_MARKER)).toBe(fromMarker(prompt, STATE_MARKER));
  });

  it("thread, minimal: thread types, duration and production's thread beat", () => {
    const story = threadAnalysisAfterSwitch(1);
    const reply = threadAnalysis("challenge", 3, 0);
    const question = "Infiltration: How does the player slip past the archive clerks?";
    reply.threads[0] = {
      ...reply.threads[0],
      title: "Storming the Archive",
      typeOfThread: "Heist",
      possibleMilestones: { favorable: "The ledger is theirs", mixed: "A torn page", unfavorable: "The ledger burns" },
      progression: reply.threads[0].progression.map((step) => ({ ...step, question })),
    };

    const parsed: ThreadAnalysis = trimmedThreadRequest(story).schema.parse(reply);
    expect(Object.keys(parsed)).toEqual(["duration", "threads"]);
    expect(Object.keys(parsed.threads[0])).not.toContain("typeOfMilestone");

    const next = threadStep.apply(story, parsed);
    expect(next.getPlayer("player1")?.previousTypesOfThreads).toContain("Heist");
    expect(next.getCurrentThreadDuration()).toBe(3);
    const prompt = beatStep.request(next).prompt;
    for (const text of ["Storming the Archive", question, "The ledger is theirs", "The ledger burns"]) {
      expect(prompt).toContain(text);
    }
    expect(fromMarker(trimmedBeatRequest(next, "minimal").prompt, STATE_MARKER)).toBe(fromMarker(prompt, STATE_MARKER));
  });

  it.each(SETUP_INPUTS)("setup, minimal, %i players: every field story creation reads is kept", (players, gameMode) => {
    const shape = objectShape(setupRequests(players, gameMode).trimmed.schema);
    const read = [
      "title", "imageInstructions", "guidelines", "storyElements", "sharedOutcomes", "sharedStats", "playerStats",
      "difficultyLevel", "characterSelectionIntroduction",
    ];
    for (const field of read) expect(shape).toHaveProperty(field);
    for (const slot of slotsOf(players)) {
      expect(keysOf(shape[slot])).toEqual(["outcomes", "possibleCharacterIdentities", "possibleCharacterBackgrounds"]);
    }
    expect(Object.keys(shape)).not.toContain("characterSelectionPlan");
  });
});
