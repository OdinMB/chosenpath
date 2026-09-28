import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes, type GameMode, type ThreadAnalysis } from "core/types/index.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";
import { todaysFormWithB6Request } from "../../../../src/game/services/storyTextRounds/turnRound2.js";
import { round0BeatStep } from "../../../../src/game/services/storyTextRound0/round0Steps.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { stat, threadAnalysis, type ThreadKind } from "../../../helpers/textFixtures.js";
import { SCOREBOARD_ENDING_RULE, SHARED_OUTCOMES_LINE, adoptedTurnPrompt, isScoreboardEnding } from "../../../helpers/adoptedDeltas.js";

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

/*
 * The scoreboard ending rule (decision 3, settled; it lands without B8's
 * full ending format): the one line production adds to today's form, on the
 * ending of a story with a contested outcome, two players or two camps
 * (adoptedDeltas.ts).
 */
const withEndingRule = (prompt: string) => adoptedTurnPrompt(prompt, true);

/** The contest's scoreboard, a shared opposites stat, as a contest setup writes it. */
const SCOREBOARD = stat("shared_voice_score", { name: "Enclave's Voice|Printers' Voice", type: "opposites", initialValue: 50 });

function contestEnding(players: number, mode: GameMode = GameModes.Competitive, scoreboard = true): Story {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  const story = roundStory({
    players,
    turns: 6,
    maxTurns: 6,
    gameMode: mode,
    sharedOutcomes: [
      outcome("shared_voice", {
        possibleResolutions: { sideAWins: "The enclave speaks", mixed: "They share the seat", sideBWins: "The printers speak" },
        resonance: "Who speaks for the goblins. Scored by Enclave's Voice|Printers' Voice.",
      }),
    ],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_pride`)]])),
    phases: [
      topicSwitch([["Speak", "shared_voice"]], 0, slots),
      endedChapter("shared_voice", 2, 1, "The council hears the enclave", slots),
      topicSwitch([["Speak", "shared_voice"]], 3, slots),
      endedChapter("shared_voice", 2, 4, "The printers win the vote", slots),
    ],
  });
  return scoreboard ? story.clone({ sharedStats: [SCOREBOARD], sharedStatValues: [{ statId: SCOREBOARD.id, value: 40 }] }) : story;
}

describe("group turns: today's form, and the scoreboard ending rule on a contest's ending", () => {
  it.each(GROUPS)("%s", (_, build) => {
    const story = build();
    expectSame(beatStep.request(story), round0BeatStep.request(story));
  });

  it.each([
    ["two players, competitive", () => contestEnding(2)],
    ["two players, cooperative-competitive", () => contestEnding(2, GameModes.CooperativeCompetitive)],
    ["three players (two camps)", () => contestEnding(3)],
  ] as const)("the ending of a contest, %s: today's form plus the scoreboard rule, once", (_, build) => {
    const story = build();
    const production = beatStep.request(story);
    const today = round0BeatStep.request(story);
    expect(today.prompt.split(SHARED_OUTCOMES_LINE)).toHaveLength(2);
    expect(production.prompt).toBe(withEndingRule(today.prompt));
    expect(json(production.schema)).toBe(json(today.schema));
  });

  it("prints the rule on no other turn of a contest, and on no ending without one", () => {
    const beforeEnding = contestEnding(2).clone({ maxTurns: 20 });
    expect(beforeEnding.getCurrentBeatType()).not.toBe("ending");
    expect(beatStep.request(beforeEnding).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
    expect(beatStep.request(endingBeat(2)).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
    expect(beatStep.request(endingBeat(1)).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
  });

  it.each([
    // A template's author can set a contest in any mode, or leave out its scoreboard; the rule would name a stat or a side B that isn't there
    ["a cooperative story", () => contestEnding(2, GameModes.Cooperative)],
    ["a single player's story", () => contestEnding(1, GameModes.SinglePlayer)],
    ["a contest without a scoreboard (no shared opposites stat)", () => contestEnding(2, GameModes.Competitive, false)],
  ] as const)("prints no rule on the ending of %s that holds a contested outcome: today's form", (_, build) => {
    const story = build();
    expect(story.getCurrentBeatType()).toBe("ending");
    expect(isScoreboardEnding(story)).toBe(false);
    expectSame(beatStep.request(story), round0BeatStep.request(story));
  });

  (frozen.length ? it : it.skip)("every frozen group turn: today's form, the rule only on a scored contest's ending", () => {
    const cases = frozen.filter((c) => c.role === "beat" && c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(10);
    for (const c of cases) {
      const story = caseStory(c);
      const today = round0BeatStep.request(story);
      expectSame(beatStep.request(story), isScoreboardEnding(story) ? { ...today, prompt: withEndingRule(today.prompt) } : today);
    }
  });
});
