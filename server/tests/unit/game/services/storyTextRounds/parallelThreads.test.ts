import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, GameMode, Outcome, StoryPhase, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import {
  PARALLEL_THREADS_TEXT,
  parallelThreadsRequest,
  takesLastStageLine,
  takesOneSidedLine,
  takesParallelLine,
  takesTurnLine,
} from "../../../../../src/game/services/storyTextRounds/parallelThreads.js";
import { choiceResultRequest } from "../../../../../src/game/services/storyTextRounds/choiceResult.js";
import { beatStep, switchStep, threadStep } from "../../../../../src/game/services/storyTextSteps.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { plannerV2SwitchRequest } from "../../../../../src/game/services/storyTextRounds/turnRound1Planners.js";
import { withThreadsThatFit } from "../../../../helpers/adoptedDeltas.js";
import { firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { createMockMultiplayerStory } from "../../../../helpers/testHelpers.js";
import { beatGeneration, outcome, thread } from "../../../../helpers/textFixtures.js";

/*
 * Parallel threads keep people and places where they are, a contest one side
 * alone chose is that side's challenge, and a contest's last stage is decided
 * with both sides there (eval only; fix 4 of the second playthroughs' review,
 * 2026-10-01). In the space pirates' third chapter the chapter planner put
 * the captain at Needlepoint's docks, the pilot flying the ship through the
 * Gloam Reach's pylons and the scout at the galley table "before the ship
 * leaves Needlepoint"; the turns followed, so the captain stood on the docks,
 * on the bridge channel and at the galley table in the same turns. The
 * treasure claim's thread, which only the scout had chosen, was written as a
 * contest with the captain's camp "represented", the repair made it her
 * challenge, and its results still said "Pip and the captain's camp" and
 * settled the claim for the captain. In the estate agents' fourth chapter Nia
 * alone played the sale's last stage while Rory was in the archive; the turn
 * put the buyer in both places and Rory at the open house. The variant is
 * production's switch planner, chapter planner and group turn, each with a
 * line where its situation arises; production's request byte for byte
 * everywhere else.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const CONTESTED: Outcome = outcome("shared_sale", {
  question: "Who sells the house?",
  possibleResolutions: { sideAWins: "Rory sells it.", mixed: "Neither sells it.", sideBWins: "Nia sells it." },
  intendedNumberOfMilestones: 3,
});

/** The last beat of a player with the option at `choice` chosen. */
function lastBeat(choice: number): Beat {
  return { ...beatGeneration({ text: "A text.", summary: "A summary." }), choice, resolution: "resolution1" };
}

/** A topic switch for one player whose directions push the given outcomes, in order. */
function topicSwitch(slot: string, outcomes: string[]): SwitchAnalysis["switches"][number] {
  return {
    players: [slot],
    type: "topic",
    relevantSuggestedThreadTypes: [],
    previousThreadTypesToBeAvoided: [],
    relevantSwitchAndThreadInstructions: "",
    outcomeId: "",
    question: "",
    topicChoices: outcomes.map((id) => `Go toward ${id} (${id})`),
    topicDirections: outcomes.map((id) => ({ direction: `Go toward ${id}`, outcomeId: id })),
    relationshipToOtherSwitches: "",
    title: `Switch of ${slot}`,
    id: `switch_${slot}`,
  } as SwitchAnalysis["switches"][number];
}

function switchPhase(switches: SwitchAnalysis["switches"], firstBeatIndex: number): SwitchAnalysis {
  return { coordinationPatternAnalysis: "", coordinationPatternSummary: "", switches, firstBeatIndex, duration: 1 } as SwitchAnalysis;
}

/** A resolved chapter at history indexes 1-2 with one thread per entry. */
function resolvedChapter(threads: [string, string[]][]): ThreadAnalysis {
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 1,
    threads: threads.map(([outcomeId, players], i) => {
      const t = thread("challenge", 2, 1, players);
      return {
        ...t,
        id: `done_${i}`,
        outcomeId,
        progression: t.progression.map((step) => ({ ...step, resolution: "favorable" as const })),
        resolution: "favorable" as const,
        milestone: `Milestone ${i}`,
      };
    }),
  };
}

type Setup = { players?: number; mode?: GameMode; saleMilestones?: number };

/** A group story with a contested shared outcome and one own outcome per player. */
function groupStory(phases: StoryPhase[], turns: number, picks: number[], setup: Setup = {}): Story {
  const players = setup.players ?? 2;
  const base = createMockMultiplayerStory(players).getState();
  const withPlayers = Object.fromEntries(
    Object.entries(base.players).map(([slot, player], i) => [
      slot,
      {
        ...player,
        name: ["Rory Vale", "Nia Hart", "Pip Moss"][i],
        outcomes: [outcome(`${slot}_own`)],
        beatHistory: Array.from({ length: turns }, (_, k) => lastBeat(k === turns - 1 ? (picks[i] ?? 0) : 0)),
      },
    ])
  );
  const sale = { ...CONTESTED, milestones: Array.from({ length: setup.saleMilestones ?? 2 }, (_, k) => `Sale milestone ${k + 1}`) };
  return Story.create({ ...base, gameMode: setup.mode ?? GameModes.Competitive, sharedOutcomes: [sale], players: withPlayers, storyPhases: phases, maxTurns: 25 });
}

const slots = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

/** The chapter planner after a later switch: each player chose the direction at `picks[i]` of [sale, own]. */
function chapterPlanning(picks: number[], setup: Setup = {}): Story {
  const players = setup.players ?? 2;
  const switches = slots(players).map((slot) => topicSwitch(slot, ["shared_sale", `${slot}_own`]));
  return groupStory([switchPhase([topicSwitch("player1", ["shared_sale"])].map((s) => ({ ...s, players: slots(players) })), 0), resolvedChapter([["shared_sale", slots(players)]]), switchPhase(switches, 3)], 4, picks, setup);
}

/** The switch planner after a chapter (turn 3): the sale at `saleMilestones`, the chapter that just ended on it pending. */
function switchPlanning(setup: Setup = {}): Story {
  const players = setup.players ?? 2;
  return groupStory([switchPhase([{ ...topicSwitch("player1", ["shared_sale"]), players: slots(players) }], 0), resolvedChapter([["shared_sale", slots(players)]])], 3, [], setup);
}

/** A chapter step of a chapter with one thread per entry (step 1 played). */
function chapterStep(threads: [string, string[]][], players = 2): Story {
  const chapter: ThreadAnalysis = {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 3,
    firstBeatIndex: 2,
    threads: threads.map(([outcomeId, sideA], i) => {
      const t = thread("challenge", 3, 2, sideA);
      return { ...t, id: `thread_${i}`, outcomeId, progression: t.progression.map((step, k) => ({ ...step, resolution: k === 0 ? ("favorable" as const) : null })) };
    }),
  };
  return groupStory([switchPhase([{ ...topicSwitch("player1", ["shared_sale"]), players: slots(players) }], 1), chapter], 3, [], { players });
}

/** The prompt with the variant's insertions taken out again. */
const withoutInsertions = (prompt: string) =>
  [PARALLEL_THREADS_TEXT.lastStageLine, PARALLEL_THREADS_TEXT.parallelLine, PARALLEL_THREADS_TEXT.oneSidedLine, PARALLEL_THREADS_TEXT.turnLine].reduce(
    (text, passage) => text.split(passage).join(""),
    prompt
  );

describe("the switch planner: a contested outcome's last stage offered only as a grouped thread", () => {
  it("takes the line where a contested shared outcome's next thread settles its last stage, in a contest game after the opening", () => {
    expect(takesLastStageLine(switchPlanning({ saleMilestones: 1 }))).toBe(true); // 1 recorded + 1 pending of 3: one still needed
    expect(takesLastStageLine(switchPlanning({ saleMilestones: 0 }))).toBe(false); // two still needed
    expect(takesLastStageLine(switchPlanning({ saleMilestones: 2 }))).toBe(false); // complete with the pending one
    expect(takesLastStageLine(switchPlanning({ saleMilestones: 1, mode: GameModes.Cooperative }))).toBe(false);
    expect(takesLastStageLine(switchPlanning({ saleMilestones: 1, mode: GameModes.CooperativeCompetitive, players: 3 }))).toBe(true);
    expect(takesLastStageLine(firstSwitchBeat(2))).toBe(false);
  });

  it("adds the line once after the coordination examples, and is the switch planner before the line byte for byte around it", () => {
    const story = switchPlanning({ saleMilestones: 1 });
    const [variant, production] = [parallelThreadsRequest(story, "switch"), switchStep.request(story)];
    expect(occurrences(variant.prompt, PARALLEL_THREADS_TEXT.lastStageLine)).toBe(1);
    expect(variant.prompt).toContain(`${PARALLEL_THREADS_TEXT.lastStageAnchor}${PARALLEL_THREADS_TEXT.lastStageLine}`);
    // The switch planner as it was measured against: planner v2b with production's threads that fit
    expect(withoutInsertions(variant.prompt)).toBe(withThreadsThatFit(plannerV2SwitchRequest(story, false).prompt, story));
    // Adopted as measured (2026-10-01): production's switch planner is the variant's byte for byte
    expect(variant.prompt).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  it("says the contest is decided with both sides in it: a flavor switch for every player, never a direction one side takes alone", () => {
    expect(PARALLEL_THREADS_TEXT.lastStageLine).toContain("1 milestone still needed");
    expect(PARALLEL_THREADS_TEXT.lastStageLine).toContain("a flavor switch on it for every player");
    expect(PARALLEL_THREADS_TEXT.lastStageLine).toContain("never as one direction among others");
  });
});

describe("the chapter planner: parallel threads in one world, a one-sided contest as that side's challenge", () => {
  it("takes the parallel line where the players' choices set more than one outcome", () => {
    expect(takesParallelLine(chapterPlanning([1, 1]))).toBe(true); // each their own
    expect(takesParallelLine(chapterPlanning([0, 1]))).toBe(true); // one on the sale, one on their own
    expect(takesParallelLine(chapterPlanning([0, 0]))).toBe(false); // both on the sale: one thread
  });

  it("takes the one-sided line where some but not all players chose a contested outcome, in a contest game", () => {
    expect(takesOneSidedLine(chapterPlanning([0, 1]))).toBe(true);
    expect(takesOneSidedLine(chapterPlanning([1, 0]))).toBe(true);
    expect(takesOneSidedLine(chapterPlanning([0, 0]))).toBe(false);
    expect(takesOneSidedLine(chapterPlanning([1, 1]))).toBe(false);
    expect(takesOneSidedLine(chapterPlanning([0, 1], { mode: GameModes.Cooperative }))).toBe(false);
  });

  it("adds each line once where it applies, and is production's request byte for byte around them", () => {
    for (const picks of [[0, 1], [1, 1], [0, 0]]) {
      const story = chapterPlanning(picks);
      const [variant, production] = [parallelThreadsRequest(story, "thread"), threadStep.request(story)];
      expect(occurrences(variant.prompt, PARALLEL_THREADS_TEXT.parallelLine)).toBe(takesParallelLine(story) ? 1 : 0);
      expect(occurrences(variant.prompt, PARALLEL_THREADS_TEXT.oneSidedLine)).toBe(takesOneSidedLine(story) ? 1 : 0);
      if (takesParallelLine(story)) expect(variant.prompt).toContain(`${PARALLEL_THREADS_TEXT.parallelAnchor}${PARALLEL_THREADS_TEXT.parallelLine}`);
      if (takesOneSidedLine(story)) expect(variant.prompt).toContain(`${PARALLEL_THREADS_TEXT.oneSidedAnchor}${PARALLEL_THREADS_TEXT.oneSidedLine}`);
      expect(withoutInsertions(variant.prompt)).toBe(production.prompt);
      expect(json(variant.schema)).toBe(json(production.schema));
    }
  });

  it("says the threads share one time and world, and the one-sided thread is that side's challenge with the others absent", () => {
    expect(PARALLEL_THREADS_TEXT.parallelLine).toContain("happen at the same time, in one world");
    expect(PARALLEL_THREADS_TEXT.parallelLine).toContain("a player is only in their own thread");
    expect(PARALLEL_THREADS_TEXT.parallelLine).toContain("says where it happens and who is there");
    expect(PARALLEL_THREADS_TEXT.oneSidedLine).toContain("that side's Challenge thread");
    expect(PARALLEL_THREADS_TEXT.oneSidedLine).toContain("never win or lose in its results");
  });

  it("assembles the reply as production does", () => {
    const story = chapterPlanning([0, 1]);
    const reply = { grouping: "apart", duration: 2, threads: [] };
    expect(parallelThreadsRequest(story, "thread").assemble?.(reply)).toEqual(threadStep.request(story).assemble(reply));
  });
});

describe("the group turn: parallel threads keep every person and vehicle in one place", () => {
  it("takes the line on a group chapter step whose chapter has more than one thread", () => {
    expect(takesTurnLine(chapterStep([["shared_sale", ["player1"]], ["player2_own", ["player2"]]]))).toBe(true);
    expect(takesTurnLine(chapterStep([["shared_sale", ["player1", "player2"]]]))).toBe(false);
    expect(takesTurnLine(threadBeat(2))).toBe(false);
    expect(takesTurnLine(laterSwitchBeat(2))).toBe(false);
  });

  it("adds the line once in the consistency section, and is production's turn byte for byte around it", () => {
    const story = chapterStep([["shared_sale", ["player1"]], ["player2_own", ["player2"]]]);
    const [variant, production] = [parallelThreadsRequest(story, "beat"), choiceResultRequest(story)];
    expect(occurrences(variant.prompt, PARALLEL_THREADS_TEXT.turnLine)).toBe(1);
    expect(variant.prompt).toContain(`${PARALLEL_THREADS_TEXT.turnAnchor}${PARALLEL_THREADS_TEXT.turnLine}`);
    expect(withoutInsertions(variant.prompt)).toBe(production.prompt);
    expect(production.prompt).toBe(beatStep.request(story).prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  it("says a character in one player's scenes is in no other player's, and a shared place is in one state", () => {
    expect(PARALLEL_THREADS_TEXT.turnLine).toContain("the threads happen at the same moment");
    expect(PARALLEL_THREADS_TEXT.turnLine).toContain("a player appears in another player's beat only if they are in the same thread");
    expect(PARALLEL_THREADS_TEXT.turnLine).toContain("in the same state in every beat");
  });
});

describe("production's request byte for byte everywhere else", () => {
  it.each([
    ["a single player's switch planner", () => firstSwitchBeat(1), "switch"],
    ["a group's opening switch planner", () => firstSwitchBeat(2), "switch"],
    ["a group's switch planner with no contest at its last stage", () => switchPlanning({ saleMilestones: 0 }), "switch"],
    ["a group's chapter planner, every player on one outcome", () => chapterPlanning([0, 0]), "thread"],
    ["a group's challenge step", () => threadBeat(2), "beat"],
    ["a group's switch turn", () => laterSwitchBeat(2), "beat"],
    ["a single player's step", () => threadBeat(1), "beat"],
  ] as const)("%s", (_, build, role) => {
    const story = build();
    const production = role === "switch" ? switchStep.request(story) : role === "thread" ? threadStep.request(story) : choiceResultRequest(story);
    const variant = parallelThreadsRequest(story, role);
    expect(variant.prompt).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  (frozen.length ? it : it.skip)("every frozen case of each role: production's request around the insertions, which only their situations carry", () => {
    let carried = 0;
    for (const c of frozen.filter((f) => (f.role === "beat" || f.role === "switch" || f.role === "thread") && f.state)) {
      const role = c.role as "beat" | "switch" | "thread";
      const story = caseStory(c, role === "beat");
      const production = role === "switch" ? switchStep.request(story).prompt : role === "thread" ? threadStep.request(story).prompt : choiceResultRequest(story).prompt;
      const variant = parallelThreadsRequest(story, role).prompt;
      const takes = role === "switch" ? takesLastStageLine(story) : role === "thread" ? takesParallelLine(story) || takesOneSidedLine(story) : takesTurnLine(story);
      // The switch planner's line is production's since 2026-10-01; the chapter planner's and the turn's are not
      const adopted = role === "switch";
      expect([c.id, withoutInsertions(variant) === withoutInsertions(production), variant === production]).toEqual([c.id, true, adopted || !takes]);
      if (takes) carried++;
    }
    expect(carried).toBeGreaterThan(0);
  });
});

describe("the eval variant", () => {
  it("sends each role's request with production's limits for the role and player count", () => {
    const cases = [
      ["switch", switchPlanning({ saleMilestones: 1 }), "switchAnalysis"],
      ["thread", chapterPlanning([0, 1]), "threadAnalysis"],
      ["beat", chapterStep([["shared_sale", ["player1"]], ["player2_own", ["player2"]]]), "beat"],
    ] as const;
    for (const [role, story, limitsRole] of cases) {
      const request = requestFor("parallelThreads", { role, story });
      expect(requestText(request)).toBe(parallelThreadsRequest(story, role).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits(limitsRole, 2));
    }
  });
});
