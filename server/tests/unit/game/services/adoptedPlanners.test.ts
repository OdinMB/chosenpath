import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes } from "core/types/index.js";
import { switchStep, threadStep } from "../../../../src/game/services/storyTextSteps.js";
import { plannerV2SwitchRequest, plannerV2ThreadRequest } from "../../../../src/game/services/storyTextRounds/turnRound1Planners.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import {
  firstSwitchBeat,
  firstThreadAnalysis,
  laterSwitchBeat,
  switchAnalysisAfterThread,
  threadAnalysisAfterSwitch,
} from "../../../helpers/promptStories.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";

/*
 * Production's planners are planner v2 with two-sided contests as the eval
 * measured it (variant planV2b) for the switch, and planner v2c for the
 * chapter (planV2b with the nearer chapter question and the planner's own
 * kind of milestone, the owner's feedback of 2026-09-28, and the adopted
 * "without a number" in the chapter title's field): the same prompt and JSON
 * schema, byte for byte, on every story the tests build and on every frozen
 * planning case; and a reply is assembled into today's stored plan the way
 * the eval assembles it.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);


const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const MIA = "player1_mia_friendship";

function singlePlayerAfterChapters(maxTurns: number, turns: number): Story {
  return roundStory({
    turns,
    maxTurns,
    playerOutcomes: {
      player1: [
        outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: ["The Guild listens"] }),
        outcome(ENCLAVE, { intendedNumberOfMilestones: 2 }),
        outcome(MIA, { intendedNumberOfMilestones: 1 }),
      ],
    },
    phases: [
      topicSwitch([["Rally the enclave", GUILD], ["Visit Gruk", ENCLAVE], ["Walk with Mia", MIA]], 0),
      endedChapter(GUILD, 3, 1, "Sir Bram suspends the bounty"),
      topicSwitch([["Press the Guild", GUILD], ["Visit Gruk", ENCLAVE], ["Walk with Mia", MIA]], turns - 1),
    ],
    lastChoice: 1,
    switchAndThreadInstructions: ["When Public Support falls below 30%, the next thread is about winning back the crowd."],
  });
}

function contestStory(players: number, withFlavor: boolean): Story {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  return roundStory({
    players,
    turns: 5,
    maxTurns: 20,
    gameMode: GameModes.Competitive,
    sharedOutcomes: [
      outcome("shared_voice", { possibleResolutions: { sideAWins: "The enclave speaks", mixed: "Shared", sideBWins: "The printers speak" }, resonance: "Scored by Enclave's Voice|Printers' Voice." }),
    ],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_pride`)]])),
    phases: [
      topicSwitch([["Speak up", "shared_voice"], ["Stay home", `player1_pride`], ["Hide", "shared_voice"]], 0, slots),
      endedChapter("shared_voice", 3, 1, "The council hears the enclave", slots),
      withFlavor ? flavorSwitch("shared_voice", "Who wins the council?", 4, slots) : topicSwitch([["Speak up", "shared_voice"], ["Stay home", "player1_pride"], ["Hide", "shared_voice"]], 4, slots),
    ],
  });
}

const SWITCH_STORIES: [string, () => Story][] = [
  ...[1, 2, 3].flatMap((players): [string, () => Story][] => [
    [`the opening switch, ${players} players`, () => firstSwitchBeat(players)],
    [`a switch after a chapter, ${players} players`, () => switchAnalysisAfterThread(players)],
    [`a later switch beat's story, ${players} players`, () => laterSwitchBeat(players)],
  ]),
  ["a late 10-turn story", () => singlePlayerAfterChapters(10, 6)],
  ["the middle of a 25-turn story", () => singlePlayerAfterChapters(25, 8)],
];

const THREAD_STORIES: [string, () => Story][] = [
  ...[1, 2, 3].flatMap((players): [string, () => Story][] => [
    [`the first chapter, ${players} players`, () => firstThreadAnalysis(players)],
    [`a chapter after a switch, ${players} players`, () => threadAnalysisAfterSwitch(players)],
  ]),
  ["a single player's pick in a 10-turn story", () => singlePlayerAfterChapters(10, 6)],
  ["a single player's pick in a 25-turn story", () => singlePlayerAfterChapters(25, 8)],
  ...[2, 3].flatMap((players): [string, () => Story][] => [
    [`a ${players}-player contest after a topic switch`, () => contestStory(players, false)],
    [`a ${players}-player contest after a flavor switch`, () => contestStory(players, true)],
  ]),
];

function expectSwitchLikeMeasured(story: Story) {
  const production = switchStep.request(story);
  const measured = plannerV2SwitchRequest(story, false);
  expect(production.prompt).toBe(measured.prompt);
  expect(json(production.schema)).toBe(json(measured.schema));
}

/** planV2c: planV2b with the nearer chapter question, the planner's own kind of milestone, and the adopted title ("without a number"). */
const planV2c = (story: Story) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true });

function expectThreadLikeMeasured(story: Story) {
  const production = threadStep.request(story);
  const measured = planV2c(story);
  expect(production.prompt).toBe(measured.prompt);
  expect(json(production.schema)).toBe(json(measured.schema));
}

describe("the switch planner: planner v2 as measured", () => {
  it.each(SWITCH_STORIES)("%s", (_, build) => expectSwitchLikeMeasured(build()));

  (frozen.length ? it : it.skip)("every frozen switch case", () => {
    const cases = frozen.filter((c) => c.role === "switch");
    expect(cases.length).toBeGreaterThan(20);
    for (const c of cases) expectSwitchLikeMeasured(caseStory(c, false));
  });
});

describe("the chapter planner: planner v2c (two-sided contests, the nearer chapter question)", () => {
  it.each(THREAD_STORIES)("%s", (_, build) => expectThreadLikeMeasured(build()));

  (frozen.length ? it : it.skip)("every frozen chapter case", () => {
    const cases = frozen.filter((c) => c.role === "thread");
    expect(cases.length).toBeGreaterThan(15);
    for (const c of cases) expectThreadLikeMeasured(caseStory(c, false));
  });
});

describe("a reply, assembled into today's stored plan as the eval assembled it", () => {
  it("a single player's topic switch: directions as 'text (id)' with their outcome beside them", () => {
    const story = singlePlayerAfterChapters(25, 8);
    const reply = {
      switch: {
        type: "topic",
        outcomeId: "",
        question: "",
        topicChoices: [
          { direction: "Meet Zelda at the print shop", outcomeId: ENCLAVE },
          { direction: "Bring the petition to Sir Bram", outcomeId: GUILD },
          { direction: "Walk the canal with Mia", outcomeId: MIA },
        ],
        title: "Three Doors",
      },
    };
    expect(switchStep.request(story).assemble(reply)).toEqual(plannerV2SwitchRequest(story, false).assemble(reply));
  });

  it("a single player's chapter: the pick sets its outcome, the last step's results are the milestones", () => {
    const story = singlePlayerAfterChapters(25, 8);
    const reply = {
      thread: {
        kind: "challenge",
        typeOfThread: "Negotiation",
        title: "The Enclave Gate",
        question: "Will Gruk open the gate?",
        typeOfMilestone: "whether Gruk lets the enclave's envoys in",
        possibleMilestones: { favorable: "Gruk opens it", mixed: "Gruk hesitates", unfavorable: "Gruk bars it" },
        steps: [{ title: "Knock", question: "Approach: How does Rikkit ask?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } }],
        finalStep: { title: "The ask", question: "How does Rikkit settle it?" },
        plan: "Rikkit stays at the gate.",
      },
    };
    const assembled = threadStep.request(story).assemble(reply);
    expect(assembled).toEqual(planV2c(story).assemble(reply));
    const [stored] = (assembled as unknown as { threads: { outcomeId: string; typeOfMilestone: string; question: string }[] }).threads;
    expect(stored).toMatchObject({ outcomeId: ENCLAVE, typeOfMilestone: "whether Gruk lets the enclave's envoys in", question: "Will Gruk open the gate?" });
  });

  it("a contest chapter: its outcome and sides as written, checked later by the plan check", () => {
    const story = contestStory(2, true);
    const reply = {
      grouping: "Both at the council.",
      duration: 2,
      threads: [
        {
          kind: "contest",
          outcomeId: "shared_voice",
          playersSideA: ["player1"],
          playersSideB: ["player2"],
          typeOfThread: "Debate",
          title: "The Council",
          question: "Who speaks?",
          possibleMilestones: { sideAWins: "A", mixed: "M", sideBWins: "B" },
          steps: [{ title: "Open", question: "How do both argue?", possibleResolutions: { sideAWins: "a", mixed: "m", sideBWins: "b" } }],
          finalStep: { title: "Vote", question: "How do both close?" },
          plan: "One hall.",
        },
      ],
    };
    expect(threadStep.request(story).assemble(reply)).toEqual(planV2c(story).assemble(reply));
  });
});
