import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import type { ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";
import { todaysFormWithB6Request } from "../../../../src/game/services/storyTextRounds/turnRound2.js";
import { round0BeatStep } from "../../../../src/game/services/storyTextRound0/round0Steps.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { threadAnalysis, type ThreadKind } from "../../../helpers/textFixtures.js";

/*
 * Production's turns are today's form with the option rules (B6) alone, as
 * the setup-to-play chain ran them (variant turnB6): single-player challenge
 * and contest chapter steps get B6's lines, fields and computed lever line;
 * every other single-player turn, and every group turn (B6 was never built or
 * measured for groups), is today's request (the frozen round0 form), byte
 * for byte, on the stories the tests build and on every frozen beat case.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const OUTCOMES = { player1: [outcome(GUILD, { milestones: ["Sir Bram listened"] }), outcome(ENCLAVE)] };
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", GUILD],
  ["Win over the enclave", ENCLAVE],
  ["Print the pamphlet", GUILD],
];

function chapterStep(kind: ThreadKind, done: number, duration = 3): Story {
  const analysis = threadAnalysis(kind, duration, 1);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: GUILD,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? (kind === "exploration" ? ("resolution1" as const) : ("favorable" as const)) : null })),
    })),
  };
  return roundStory({ turns: 1 + done, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), chapter] });
}

const SINGLE_PLAYER: [string, () => Story][] = [
  ["the first switch", () => firstSwitchBeat(1)],
  ["a later switch", () => laterSwitchBeat(1)],
  ["a challenge step", () => threadBeat(1)],
  ["a challenge chapter's opening", () => chapterStep("challenge", 0)],
  ["a challenge chapter's middle step", () => chapterStep("challenge", 1)],
  ["a challenge chapter's last step", () => chapterStep("challenge", 2)],
  ["an exploration step", () => chapterStep("exploration", 1)],
  ["the ending", () => endingBeat(1)],
  [
    "a switch after a chapter",
    () => roundStory({ turns: 5, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears"), topicSwitch(DIRECTIONS, 5)] }),
  ],
];

const GROUPS: [string, () => Story][] = [2, 3].flatMap((players): [string, () => Story][] => [
  [`the first switch, ${players} players`, () => firstSwitchBeat(players)],
  [`a later switch, ${players} players`, () => laterSwitchBeat(players)],
  [`a chapter step, ${players} players`, () => threadBeat(players)],
  [`the ending, ${players} players`, () => endingBeat(players)],
]);

function expectSame(production: { prompt: string; schema: Parameters<typeof toJsonSchema>[0] }, measured: { prompt: string; schema: Parameters<typeof toJsonSchema>[0] }) {
  expect(production.prompt).toBe(measured.prompt);
  expect(json(production.schema)).toBe(json(measured.schema));
}

describe("single-player turns: today's form with B6 as measured", () => {
  it.each(SINGLE_PLAYER)("%s", (_, build) => {
    const story = build();
    expectSame(beatStep.request(story), todaysFormWithB6Request(story));
  });

  it("gives a challenge step B6's lines and a single player's other turns none", () => {
    expect(beatStep.request(chapterStep("challenge", 1)).prompt).toContain("- The three options are three different ways to act");
    expect(beatStep.request(chapterStep("exploration", 1)).prompt).not.toContain("three different ways to act");
  });

  (frozen.length ? it : it.skip)("every frozen single-player turn", () => {
    const cases = frozen.filter((c) => c.role === "beat" && !c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(40);
    for (const c of cases) {
      const story = caseStory(c);
      expectSame(beatStep.request(story), todaysFormWithB6Request(story));
    }
  });
});

describe("group turns: today's form", () => {
  it.each(GROUPS)("%s", (_, build) => {
    const story = build();
    expectSame(beatStep.request(story), round0BeatStep.request(story));
  });

  (frozen.length ? it : it.skip)("every frozen group turn", () => {
    const cases = frozen.filter((c) => c.role === "beat" && c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(10);
    for (const c of cases) {
      const story = caseStory(c);
      expectSame(beatStep.request(story), round0BeatStep.request(story));
    }
  });
});
