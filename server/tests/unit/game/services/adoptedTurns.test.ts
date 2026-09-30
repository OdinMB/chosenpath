import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes, type GameMode, type ThreadAnalysis } from "core/types/index.js";
import { beatStep, switchStep, threadStep } from "../../../../src/game/services/storyTextSteps.js";
import { todaysFormWithB6Request } from "../../../../src/game/services/storyTextRounds/turnRound2.js";
import { round0BeatStep } from "../../../../src/game/services/storyTextRound0/round0Steps.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadAnalysisAfterSwitch, threadBeat } from "../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { stat, threadAnalysis, type ThreadKind } from "../../../helpers/textFixtures.js";
import { CHAPTER_RULES_HEADING, adoptedTurn } from "../../../helpers/adoptedDeltas.js";
import { ENDING_STATE_TEXT, endingStateRequest, scoreboardEnding } from "../../../../src/game/services/storyTextRounds/endingState.js";
import { SCOREBOARD_ENDING_RULE } from "../../../../src/game/services/prompts/BeatPromptService.js";
import { CHOICE_RESULT_TEXT, choiceResultRequest, takesExplorationOrder } from "../../../../src/game/services/storyTextRounds/choiceResult.js";

/*
 * Production's turns are today's form with the option rules (B6) alone, as
 * the setup-to-play chain ran them (variant turnB6): single-player challenge
 * and contest chapter steps get B6's lines, fields and computed lever line;
 * every other single-player turn, and every group turn (B6 was never built or
 * measured for groups), is today's request (the frozen round0 form), byte
 * for byte, on the stories the tests build and on every frozen beat case,
 * apart from the logged turn delta (adoptedDeltas.ts): since the owner's
 * feedback of 2026-09-28, no chapter rules on a switch turn. Every ending,
 * since the owner's decision of 2026-09-30, is the measured variant
 * endingStateB byte for byte (each outcome told as its milestones leave it,
 * the scoreboard rule with its unfinished half); until then an ending was
 * today's form with the scoreboard rule on a scored contest's ending. Since
 * the choice-result stage of 2026-09-30, a group turn where a player's thread
 * explores is the measured variant choiceResult byte for byte (the
 * exploration-order line after the option types); since the choice-line-sp
 * stage of the same day, a single player's exploration step is too (measured
 * with production's one retry of a short reply in the loop).
 */

/**
 * The measured request production must send: the ending as endingStateB, an
 * exploration step as choiceResult (every player count), else a single
 * player's turnB6 or a group's today's form.
 */
function measuredTurn(story: Story): { prompt: string; schema: Parameters<typeof toJsonSchema>[0] } {
  if (story.getCurrentBeatType() === "ending") return endingStateRequest(story);
  if (takesExplorationOrder(story)) return choiceResultRequest(story);
  return story.isMultiplayer() ? round0BeatStep.request(story) : todaysFormWithB6Request(story);
}

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

/** A group's step 2 of a 3-beat thread from history index 2: one exploration thread for everyone, or player1 exploring beside the others' challenge. */
function groupStep(players: number, kind: "exploration" | "mixed"): Story {
  const story = threadBeat(players);
  const state = structuredClone(story.getState());
  const analysis = state.storyPhases[1] as ThreadAnalysis;
  const explore = <T extends ThreadAnalysis["threads"][number]>(t: T): T => ({
    ...t,
    possibleMilestones: { resolution1: "one", resolution2: "two", resolution3: "three" },
    progression: t.progression.map((s, i) => ({ ...s, possibleResolutions: { resolution1: "one", resolution2: "two", resolution3: "three" }, resolution: i === 0 ? ("resolution1" as const) : null })),
  });
  analysis.threads =
    kind === "exploration"
      ? analysis.threads.map(explore)
      : [
          { ...explore(analysis.threads[0]), id: "explore", playersSideA: ["player1"] },
          { ...analysis.threads[0], id: "fight", playersSideA: analysis.threads[0].playersSideA.filter((s) => s !== "player1") },
        ];
  return story.clone({ storyPhases: state.storyPhases });
}

const GROUPS: [string, () => Story][] = [2, 3].flatMap((players): [string, () => Story][] => [
  [`the first switch, ${players} players`, () => firstSwitchBeat(players)],
  [`a later switch, ${players} players`, () => laterSwitchBeat(players)],
  [`a chapter step, ${players} players`, () => threadBeat(players)],
  [`an exploration step, ${players} players`, () => groupStep(players, "exploration")],
  [`one player exploring beside a challenge, ${players} players`, () => groupStep(players, "mixed")],
  [`the ending, ${players} players`, () => endingBeat(players)],
]);

function expectSame(production: { prompt: string; schema: Parameters<typeof toJsonSchema>[0] }, measured: { prompt: string; schema: Parameters<typeof toJsonSchema>[0] }) {
  expect(production.prompt).toBe(measured.prompt);
  expect(json(production.schema)).toBe(json(measured.schema));
}

/** The measured request with the turn deltas applied (adoptedDeltas.ts): what production must send for this story. */
const asAdopted = <T extends { prompt: string }>(measured: T, story: Story): T => ({ ...measured, prompt: adoptedTurn(measured.prompt, story) });

describe("single-player turns: today's form with B6 as measured, an exploration step as choiceResult, the ending as endingStateB", () => {
  it.each(SINGLE_PLAYER)("%s", (_, build) => {
    const story = build();
    expectSame(beatStep.request(story), asAdopted(measuredTurn(story), story));
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
      expectSame(beatStep.request(story), asAdopted(measuredTurn(story), story));
    }
  });
});

/*
 * The chapter rules are for the planners only (the owner's feedback of
 * 2026-09-28): the switch turn, the one turn that carried them, drops them;
 * it still reads each stat's "Adjustments after threads", the after-chapter
 * changes it applies. The switch and chapter planners keep them.
 */
describe("the chapter rules: the planners' only", () => {
  const RULE = "When Public Support falls below 30%, the next thread is about winning back the crowd.";
  const withRules = (story: Story) =>
    story.clone({
      guidelines: { ...story.getGuidelines(), typesOfThreads: ["Rally (challenge, 3): win the square"], switchAndThreadInstructions: [RULE] },
      sharedStats: [stat("shared_support", { name: "Public Support", adjustmentsAfterThreads: ["+10% after a favorable rally thread"] })],
      sharedStatValues: [{ statId: "shared_support", value: 40 }],
    });
  const TURNS: [string, () => Story][] = [
    ["a single player's first switch", () => firstSwitchBeat(1)],
    ["a single player's later switch", () => laterSwitchBeat(1)],
    ["a group's later switch", () => laterSwitchBeat(2)],
    ["a chapter step", () => threadBeat(1)],
    ["the ending", () => endingBeat(1)],
  ];

  it.each(TURNS)("%s: no chapter rules in the turn", (_, build) => {
    const story = withRules(build());
    const prompt = beatStep.request(story).prompt;
    expect(prompt).not.toContain(CHAPTER_RULES_HEADING);
    expect(prompt).not.toContain(RULE);
    expect(prompt).not.toContain("Rally (challenge, 3)");
  });

  it("was printed on the measured switch turn only, and the switch turn still reads the after-chapter stat changes", () => {
    const story = withRules(laterSwitchBeat(1));
    expect(round0BeatStep.request(story).prompt).toContain(`${CHAPTER_RULES_HEADING}\n- Types of threads`);
    expect(round0BeatStep.request(withRules(threadBeat(1))).prompt).not.toContain(CHAPTER_RULES_HEADING);
    expect(beatStep.request(story).prompt).toContain("- Adjustments after threads: +10% after a favorable rally thread");
    expect(beatStep.request(story).prompt).toContain("Consider the 'Adjustments after threads' parameter in the stat definitions.");
  });

  it("stays in both planners' prompts", () => {
    for (const story of [withRules(laterSwitchBeat(1)), withRules(laterSwitchBeat(2))]) {
      expect(switchStep.request(story).prompt).toContain(RULE);
    }
    for (const story of [withRules(threadAnalysisAfterSwitch(1)), withRules(threadAnalysisAfterSwitch(2))]) {
      expect(threadStep.request(story).prompt).toContain(RULE);
    }
  });
});

/*
 * The ending (the owner's decision of 2026-09-30, measured as endingStateB):
 * each outcome told as its milestones leave it, the game's standing of every
 * outcome after the ending, and on a scored contest's ending (two players or
 * two camps) the scoreboard rule with its unfinished half, in place of the
 * rule production added to today's form on 2026-09-28 (decision 3).
 */

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

describe("group turns: today's form, an exploration step as choiceResult, the ending as endingStateB", () => {
  it.each(GROUPS)("%s", (_, build) => {
    const story = build();
    expectSame(beatStep.request(story), asAdopted(measuredTurn(story), story));
  });

  it("gives every exploration step the exploration-order line, once, after the option types: a group's (the choice-result stage) and a single player's (the choice-line-sp stage); no challenge step", () => {
    const once = (prompt: string) => {
      expect(prompt.split(CHOICE_RESULT_TEXT.explorationOrder).length - 1).toBe(1);
      expect(prompt).toContain(`${CHOICE_RESULT_TEXT.optionTypes}${CHOICE_RESULT_TEXT.explorationOrder}\n- Define if the option is a sacrifice`);
    };
    for (const players of [2, 3]) {
      for (const kind of ["exploration", "mixed"] as const) once(beatStep.request(groupStep(players, kind)).prompt);
      expect(beatStep.request(threadBeat(players)).prompt).not.toContain(CHOICE_RESULT_TEXT.explorationOrder);
    }
    for (const done of [0, 1, 2]) once(beatStep.request(chapterStep("exploration", done)).prompt);
    for (const build of [() => threadBeat(1), () => chapterStep("challenge", 1), () => firstSwitchBeat(1), () => laterSwitchBeat(1), () => endingBeat(1)]) {
      expect(beatStep.request(build()).prompt).not.toContain(CHOICE_RESULT_TEXT.explorationOrder);
    }
  });

  it.each([
    ["two players, competitive", () => contestEnding(2)],
    ["two players, cooperative-competitive", () => contestEnding(2, GameModes.CooperativeCompetitive)],
    ["three players (two camps)", () => contestEnding(3)],
  ] as const)("the ending of a contest, %s: endingStateB, the scoreboard rule with its unfinished half once", (_, build) => {
    const story = build();
    const production = beatStep.request(story);
    expectSame(production, endingStateRequest(story));
    expect(production.prompt.split(SCOREBOARD_ENDING_RULE)).toHaveLength(2);
    expect(SCOREBOARD_ENDING_RULE).toBe(ENDING_STATE_TEXT.contestRule);
    expect(SCOREBOARD_ENDING_RULE).toContain("While it is unfinished, no side has won yet");
    // The rule production sent until the adoption is gone
    expect(production.prompt).not.toContain(ENDING_STATE_TEXT.measuredScoreboardRule);
  });

  it("prints the rule on no other turn of a contest, and on no ending without one", () => {
    const beforeEnding = contestEnding(2).clone({ maxTurns: 20 });
    expect(beforeEnding.getCurrentBeatType()).not.toBe("ending");
    expect(beatStep.request(beforeEnding).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
    expect(beatStep.request(beforeEnding).prompt).not.toContain(ENDING_STATE_TEXT.tellAsLeft);
    expect(beatStep.request(endingBeat(2)).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
    expect(beatStep.request(endingBeat(1)).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
  });

  it.each([
    // A template's author can set a contest in any mode, or leave out its scoreboard; the rule would name a stat or a side B that isn't there
    ["a cooperative story", () => contestEnding(2, GameModes.Cooperative)],
    ["a single player's story", () => contestEnding(1, GameModes.SinglePlayer)],
    ["a contest without a scoreboard (no shared opposites stat)", () => contestEnding(2, GameModes.Competitive, false)],
  ] as const)("prints no contest rule on the ending of %s that holds a contested outcome, the outcome lines still", (_, build) => {
    const story = build();
    expect(story.getCurrentBeatType()).toBe("ending");
    expect(scoreboardEnding(story)).toBe(false);
    expectSame(beatStep.request(story), endingStateRequest(story));
    expect(beatStep.request(story).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
    expect(beatStep.request(story).prompt).toContain(ENDING_STATE_TEXT.tellAsLeft);
  });

  (frozen.length ? it : it.skip)("every frozen group turn: today's form, the ending as endingStateB", () => {
    const cases = frozen.filter((c) => c.role === "beat" && c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(10);
    for (const c of cases) {
      const story = caseStory(c);
      expectSame(beatStep.request(story), asAdopted(measuredTurn(story), story));
    }
  });
});
