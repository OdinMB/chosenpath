import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes, type SwitchAnalysis, type ThreadAnalysis } from "core/types/index.js";
import { checkSwitchPlan, checkThreadPlan } from "../../../../../src/game/services/planChecks.js";
import { switchStep, threadStep } from "../../../../../src/game/services/storyTextSteps.js";
import {
  PLANNER_V2_TEXT,
  plannerV2SwitchRequest,
  plannerV2ThreadRequest,
} from "../../../../../src/game/services/storyTextRounds/turnRound1Planners.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { descriptionsOf } from "../storyTextRewrite/rewriteChecks.js";

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const MIA = "player1_mia_friendship";
const OUTCOMES = { player1: [outcome(GUILD, { intendedNumberOfMilestones: 3 }), outcome(ENCLAVE), outcome(MIA, { intendedNumberOfMilestones: 1 })] };

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const schemaText = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const descriptions = (schema: Parameters<typeof toJsonSchema>[0]) => descriptionsOf(toJsonSchema(schema)).join("\n");

/** The planning points of play, one and several players */
const stories = {
  firstSwitch: () => roundStory({ turns: 0, maxTurns: 20, playerOutcomes: OUTCOMES }),
  laterSwitch: () =>
    roundStory({
      turns: 5,
      maxTurns: 20,
      playerOutcomes: OUTCOMES,
      phases: [topicSwitch([["Meet Sir Bram", GUILD], ["Visit the enclave", ENCLAVE], ["Find Mia", MIA]], 0), endedChapter(GUILD, 4, 1, "Sir Bram listens")],
    }),
  lateSwitch: () =>
    roundStory({
      turns: 15,
      maxTurns: 20,
      playerOutcomes: OUTCOMES,
      phases: [topicSwitch([["Meet Sir Bram", GUILD]], 11), endedChapter(GUILD, 3, 12, "Sir Bram listens")],
    }),
  mpFirstSwitch: () =>
    roundStory({ players: 2, turns: 0, maxTurns: 20, sharedOutcomes: [outcome("shared_city")], playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_b")] } }),
  mpLaterSwitch: () =>
    roundStory({
      players: 2,
      turns: 5,
      maxTurns: 20,
      sharedOutcomes: [outcome("shared_city")],
      playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_b")] },
      phases: [flavorSwitch("shared_city", "q", 0, ["player1", "player2"]), endedChapter("shared_city", 4, 1, "m", ["player1", "player2"])],
    }),
  topicThread: () =>
    roundStory({
      turns: 5,
      maxTurns: 20,
      lastChoice: 1,
      playerOutcomes: OUTCOMES,
      phases: [endedChapter(GUILD, 4, 0, "m"), topicSwitch([["Meet Sir Bram", GUILD], ["Visit the enclave", ENCLAVE], ["Find Mia", MIA]], 4)],
    }),
  flavorThread: () =>
    roundStory({ turns: 1, maxTurns: 10, playerOutcomes: OUTCOMES, phases: [flavorSwitch(ENCLAVE, "How does Rikkit answer the enclave?", 0)] }),
  shortThread: () =>
    roundStory({
      turns: 5,
      maxTurns: 10,
      playerOutcomes: OUTCOMES,
      phases: [endedChapter(GUILD, 3, 1, "m"), flavorSwitch(ENCLAVE, "q", 4)],
    }),
  mpFirstThread: () =>
    roundStory({
      players: 2,
      turns: 1,
      maxTurns: 20,
      sharedOutcomes: [outcome("shared_city")],
      playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_b")] },
      phases: [flavorSwitch("shared_city", "q", 0, ["player1", "player2"])],
    }),
  mp3LaterThread: () =>
    roundStory({
      players: 3,
      turns: 5,
      maxTurns: 20,
      gameMode: GameModes.Competitive,
      sharedOutcomes: [outcome("shared_race", { possibleResolutions: { sideAWins: "A", mixed: "draw", sideBWins: "B" } })],
      playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_b")], player3: [outcome("player3_c")] },
      phases: [
        flavorSwitch("shared_race", "q", 0, ["player1", "player2", "player3"]),
        endedChapter("shared_race", 4, 1, "m", ["player1", "player2", "player3"]),
        topicSwitch([["Go", "shared_race"]], 4, ["player1", "player2", "player3"]),
      ],
    }),
};

const SWITCH_STORIES = ["firstSwitch", "laterSwitch", "lateSwitch", "mpFirstSwitch", "mpLaterSwitch"] as const;
const THREAD_STORIES = ["topicThread", "flavorThread", "shortThread", "mpFirstThread", "mp3LaterThread"] as const;

describe("planner v2 builds on every planning case", () => {
  it.each(SWITCH_STORIES.flatMap((s) => [false, true].map((full) => [s, full] as const)))("switch plan, %s (full: %s): one message, a schema that converts", (name, full) => {
    const request = plannerV2SwitchRequest(stories[name](), full);
    expect(request.prompt).toContain("======= CURRENT GAME STATE =======");
    expect(() => toJsonSchema(request.schema)).not.toThrow();
    expect(typeof request.assemble).toBe("function");
  });

  it.each(THREAD_STORIES.flatMap((s) => [false, true].map((full) => [s, full] as const)))("chapter plan, %s (full: %s): one message, a schema that converts", (name, full) => {
    const request = plannerV2ThreadRequest(stories[name](), full);
    expect(request.prompt).toContain("======= CURRENT GAME STATE =======");
    expect(() => toJsonSchema(request.schema)).not.toThrow();
  });
});

describe("the switch planner's prompt (A2, A4, A5)", () => {
  it.each(SWITCH_STORIES)("%s: each rule once; today's lines that the round replaces are gone", (name) => {
    const story = stories[name]();
    const { prompt } = plannerV2SwitchRequest(story, false);
    expect(occurrences(prompt, "======= PACING =======")).toBe(1);
    expect(prompt).not.toContain("======= STORY PROGRESS =======");
    expect(prompt).not.toContain("IMAGE LIBRARY:");
    expect(prompt).not.toContain("NOT CHOSEN (ignore for storytelling purposes");
    expect(prompt).not.toContain("one or more story outcomes");
    expect(prompt).not.toContain("It can pose questions relating to one or more outcomes.");
    expect(prompt).not.toContain("Topic switches can be used to identify a player's priorities");
    expect(prompt).not.toContain("1/4 milestones");
    expect(prompt).not.toContain("Only mark an outcome/question pair as important");
    expect(prompt).not.toContain("Justify your choice");
    expect(prompt).not.toContain("Exactly 3 possible directions");
    expect(prompt).toContain("push one story outcome closer to its resolution.");
    if (!(story.isMultiplayer() && story.getCurrentTurn() === 0)) {
      expect(occurrences(prompt, PLANNER_V2_TEXT.stepA)).toBe(1);
      expect(occurrences(prompt, PLANNER_V2_TEXT.stepB)).toBe(1);
    }
  });

  it("names the ended chapter as the thread that just ended, with its chosen option only", () => {
    const { prompt } = plannerV2SwitchRequest(stories.laterSwitch(), false);
    expect(prompt).toContain("======= THE THREAD THAT JUST ENDED =======");
    expect(prompt).not.toContain("CURRENT THREAD CONFIGURATION");
  });

  it("states the multiplayer first-thread rule once, in the coordination step", () => {
    const { prompt } = plannerV2SwitchRequest(stories.mpFirstSwitch(), false);
    expect(occurrences(prompt, "ALL players MUST be in a SINGLE")).toBe(1);
    expect(prompt).toContain("Every player gets a flavor switch");
  });

  it("binds late: the last chapter's exact length and the final phase reach the planner", () => {
    const { prompt } = plannerV2SwitchRequest(stories.lateSwitch(), false);
    expect(prompt).toContain("The thread this switch opens is the last before the ending: it has exactly 4 beats.");
    expect(prompt).toContain("Phase: the story's final thread.");
  });

  it("leaves the choice of outcome to step b, even in the final phase and the examples (review read before paying)", () => {
    const late = plannerV2SwitchRequest(stories.lateSwitch(), false);
    // The final phase asks for a climax; which outcome it pushes is step b's (those with no thread yet first)
    expect(late.prompt).not.toContain("on the main outcome if it still needs its last milestone");
    expect(late.prompt).toContain("the story's climax, on an outcome step b allows.");
    // The single-player example no longer promises a different outcome per direction, which binding can't keep
    expect(late.prompt).not.toContain("each pushing a different outcome/question");
    expect(late.prompt).toContain("- Topic choices: three directions, each with the one outcome it pushes");
    // The main-conflict and personal alternation yields to the binding priority
    expect(descriptions(late.schema)).toContain("as far as step b's priority allows");
  });
});

describe("the switch planner's reply (A2, A5)", () => {
  it("lists the story's outcome ids for each direction and a flavor switch's outcome, caps the directions at three, and forces no count", () => {
    const { schema } = plannerV2SwitchRequest(stories.laterSwitch(), false);
    const json = schemaText(schema);
    expect(json).toContain(`"enum":["${GUILD}","${ENCLAVE}","${MIA}"]`);
    expect(json).toContain(`"enum":["${GUILD}","${ENCLAVE}","${MIA}",""]`);
    expect(json).toContain('"maxItems":3');
    expect(json).not.toContain("minItems");
    expect(descriptions(schema)).toContain("a list never holds an empty or blank item");
  });

  it("keeps a free-text outcome for a story without outcomes", () => {
    const story = roundStory({ turns: 0, maxTurns: 20 });
    expect(schemaText(plannerV2SwitchRequest(story, false).schema)).not.toContain('"enum":[""]');
  });

  it("adds the field that restates the story's instructions only in the full form", () => {
    expect(schemaText(plannerV2SwitchRequest(stories.laterSwitch(), true).schema)).toContain("relevantSwitchAndThreadInstructions");
    expect(schemaText(plannerV2SwitchRequest(stories.laterSwitch(), false).schema)).not.toContain("relevantSwitchAndThreadInstructions");
  });

  it("assembles a single player's topic switch into today's plan, each direction with its outcome in brackets", () => {
    const story = stories.laterSwitch();
    const request = plannerV2SwitchRequest(story, false);
    const reply = {
      switch: {
        type: "topic",
        outcomeId: "",
        question: "",
        topicChoices: [
          { direction: "Meet Zelda at the print shop", outcomeId: ENCLAVE },
          { direction: "Find Mia at the market", outcomeId: MIA },
          { direction: "Return to Sir Bram", outcomeId: GUILD },
        ],
        title: "Three Doors, One Night",
      },
    };
    const plan = request.assemble(reply) as SwitchAnalysis & { switches: { topicDirections?: unknown }[] };
    expect(plan.switches).toHaveLength(1);
    expect(plan.switches[0]).toMatchObject({
      players: ["player1"],
      type: "topic",
      id: "three_doors_one_night",
      title: "Three Doors, One Night",
      relationshipToOtherSwitches: "single-player",
      topicChoices: [`Meet Zelda at the print shop (${ENCLAVE})`, `Find Mia at the market (${MIA})`, `Return to Sir Bram (${GUILD})`],
    });
    expect(plan.switches[0].topicDirections).toEqual(reply.switch.topicChoices);
    const checked = checkSwitchPlan(story, plan);
    expect(checked.problem).toBeUndefined();
    expect(() => switchStep.apply(story, checked.plan)).not.toThrow();
  });

  it("assembles a flavor switch, leaving its directions empty", () => {
    const request = plannerV2SwitchRequest(stories.laterSwitch(), false);
    const plan = request.assemble({ switch: { type: "flavor", outcomeId: MIA, question: "Will Mia forgive Rikkit?", topicChoices: [], title: "Mia" } }) as SwitchAnalysis;
    expect(plan.switches[0]).toMatchObject({ type: "flavor", outcomeId: MIA, question: "Will Mia forgive Rikkit?", topicChoices: [] });
  });

  it("assembles a multiplayer switch list with its coordination summary", () => {
    const story = stories.mpLaterSwitch();
    const request = plannerV2SwitchRequest(story, false);
    const plan = request.assemble({
      coordinationPatternSummary: "Both players meet the council together.",
      switches: [
        { players: ["player1", "player2"], type: "flavor", outcomeId: "shared_city", question: "q?", topicChoices: [], relationshipToOtherSwitches: "grouped", title: "The Council" },
      ],
    }) as SwitchAnalysis;
    expect(plan.coordinationPatternSummary).toBe("Both players meet the council together.");
    expect(plan.switches[0]).toMatchObject({ players: ["player1", "player2"], id: "the_council" });
    expect(checkSwitchPlan(story, plan).problem).toBeUndefined();
  });
});

describe("the chapter planner's prompt (A2, A3, A4, A6)", () => {
  it.each(THREAD_STORIES)("%s: each rule once; today's shares, the default-kind line and the restated lists are gone", (name) => {
    const story = stories[name]();
    const { prompt } = plannerV2ThreadRequest(story, false);
    expect(occurrences(prompt, "======= PACING =======")).toBe(1);
    expect(occurrences(prompt, "Thread kinds:")).toBe(1);
    expect(prompt).not.toContain("Types of Threads:");
    expect(occurrences(prompt, PLANNER_V2_TEXT.kindRuleStart)).toBe(1);
    expect(occurrences(prompt, PLANNER_V2_TEXT.lengthRuleStart)).toBe(1);
    expect(occurrences(prompt, PLANNER_V2_TEXT.milestoneSizeStart)).toBe(1);
    expect(occurrences(prompt, PLANNER_V2_TEXT.oneSituation)).toBe(1);
    expect(occurrences(prompt, "PLAYER DECISIONS:")).toBe(1);
    expect(prompt).not.toContain("% of all threads");
    expect(prompt).not.toContain("This is the default type of thread");
    expect(prompt).not.toContain("A list of previous thread types");
    expect(prompt).not.toContain("Thread types that are suggested for this story");
    expect(prompt).not.toContain("it takes several milestones to resolve an outcome");
    expect(prompt).not.toContain("More than one thread is needed to resolve the outcome");
    expect(prompt).not.toContain("one or more story outcomes");
    expect(prompt).not.toContain("IMPORTANT REMINDER: For this first thread");
  });

  it("gives a single player's prompt a named character in its examples, not the group", () => {
    const { prompt } = plannerV2ThreadRequest(stories.topicThread(), false);
    const instructions = prompt.slice(0, prompt.indexOf("======= CURRENT GAME STATE ======="));
    expect(instructions).not.toContain("[insert player names]");
    expect(instructions).not.toContain("[insert player name]");
    expect(instructions).not.toMatch(/\bThe group\b/);
    expect(instructions).toContain("Rikkit steals incriminating documents");
    expect(instructions).toContain('"Rikkit takes over the family hotel"');
    expect(instructions).toContain("The thread's outcome is already set (PLAYER DECISIONS below).");
  });

  it("tells the chapter planner which direction the player took, and the outcome that sets", () => {
    const { prompt } = plannerV2ThreadRequest(stories.topicThread(), false);
    expect(prompt).toContain(`player1 chose direction 2 of 3: "player1 option 4.1"\nThis thread pushes: Question of ${ENCLAVE}? (${ENCLAVE}). Why it matters: It matters.`);
  });

  it("tells it that a flavor switch set the outcome and the choice sets the approach", () => {
    const { prompt } = plannerV2ThreadRequest(stories.flavorThread(), false);
    expect(prompt).toContain(`This thread pushes the outcome the switch set: Question of ${ENCLAVE}? (${ENCLAVE}). The choice sets the approach, not the outcome.`);
  });

  it("binds the length: a 10-turn story's chapter at 5 turns left may only be 2 beats", () => {
    const { prompt } = plannerV2ThreadRequest(stories.shortThread(), false);
    expect(prompt).toContain("Allowed lengths for this thread: 2 beats.");
  });

  it("prints the three-player race rule in three-player prompts only", () => {
    expect(plannerV2ThreadRequest(stories.mp3LaterThread(), false).prompt).toContain(PLANNER_V2_TEXT.raceRuleStart);
    expect(plannerV2ThreadRequest(stories.mpFirstThread(), false).prompt).not.toContain(PLANNER_V2_TEXT.raceRuleStart);
  });
});

describe("the chapter planner's reply (A3, A5)", () => {
  it("single player: no outcome, sides, length or last step's results to write; the steps before the last capped at three", () => {
    const { schema } = plannerV2ThreadRequest(stories.topicThread(), false);
    const json = schemaText(schema);
    for (const gone of ["outcomeId", "playersSideA", "duration", "typeOfMilestone", "previousThreadTypesToBeAvoided", "relevantSuggestedThreadTypes", "coordinationPatternSummary"]) {
      expect(json).not.toContain(`"${gone}"`);
    }
    for (const kept of ["kind", "typeOfThread", "question", "possibleMilestones", "steps", "finalStep", "plan"]) expect(json).toContain(`"${kept}"`);
    expect(json).toContain('"maxItems":3');
    expect(json).not.toContain("minItems");
    expect(json).not.toContain("sideAWins");
    // Four beats are for a showdown or the thread that settles an outcome's last milestone, not a showdown only
    expect(json).toContain("three for a four-beat thread");
  });

  it("multiplayer: the outcome from the story's ids, the sides, one length for the batch and a grouping line", () => {
    const json = schemaText(plannerV2ThreadRequest(stories.mp3LaterThread(), false).schema);
    expect(json).toContain('"enum":["shared_race","player1_a","player2_b","player3_c"]');
    for (const kept of ["grouping", "duration", "playersSideA", "playersSideB", "sideAWins"]) expect(json).toContain(`"${kept}"`);
  });

  it("assembles a single player's plan into today's shape: the pick's outcome, the length from the steps, the milestones as the last step's results", () => {
    const story = stories.topicThread();
    const request = plannerV2ThreadRequest(story, false);
    const milestones = { favorable: "Zelda rejoins.", mixed: "Zelda wavers.", unfavorable: "Zelda leaves for good." };
    const plan = request.assemble({
      thread: {
        kind: "challenge",
        typeOfThread: "Negotiation",
        title: "The Print Shop",
        question: "Will Zelda rejoin the movement?",
        possibleMilestones: milestones,
        steps: [{ title: "Hearing", question: "Talk: How does Rikkit get a hearing?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } }],
        finalStep: { title: "The Ask", question: "How does Rikkit answer Zelda's price?" },
        plan: "Rikkit stays in the print shop with Zelda.",
      },
    }) as ThreadAnalysis;
    expect(plan.duration).toBe(2);
    expect(plan.threads).toHaveLength(1);
    const [thread] = plan.threads;
    expect(thread).toMatchObject({
      outcomeId: ENCLAVE,
      playersSideA: ["player1"],
      playersSideB: [],
      id: "the_print_shop",
      question: "Will Zelda rejoin the movement?",
      plan: "Rikkit stays in the print shop with Zelda.",
      kind: "challenge",
    });
    expect(thread.progression.map((s) => s.title)).toEqual(["Hearing", "The Ask"]);
    expect(thread.progression[1].possibleResolutions).toEqual(milestones);
    const checked = checkThreadPlan(story, plan);
    expect(checked.problem).toBeUndefined();
    const next = threadStep.apply(story, checked.plan);
    expect(next.getCurrentThreadDuration()).toBe(2);
    expect((next.getCurrentThreadAnalysis()?.threads[0] as unknown as { question: string }).question).toBe("Will Zelda rejoin the movement?");
  });

  it("assembles a multiplayer plan with the batch's length and each thread's outcome as written", () => {
    const story = stories.mpFirstThread();
    const request = plannerV2ThreadRequest(story, false);
    const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `S${i}`, question: "How do they act?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } }));
    const plan = request.assemble({
      grouping: "Both together.",
      duration: 3,
      threads: [
        {
          kind: "challenge",
          outcomeId: "shared_city",
          playersSideA: ["player1", "player2"],
          playersSideB: [],
          typeOfThread: "Siege",
          title: "The Wall",
          question: "Will the wall hold?",
          possibleMilestones: { favorable: "x", mixed: "y", unfavorable: "z" },
          steps: steps(2),
          finalStep: { title: "Breach", question: "How do they hold the breach?" },
          plan: "p",
        },
      ],
    }) as ThreadAnalysis;
    expect(plan.duration).toBe(3);
    expect(plan.coordinationPatternSummary).toBe("Both together.");
    expect(checkThreadPlan(story, plan).problem).toBeUndefined();
  });
});
